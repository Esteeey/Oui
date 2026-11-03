import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

/** Accès SQL minimal, identique pour PostgreSQL réel et PostgreSQL embarqué (PGlite). */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  /** Exécute `fn` dans une transaction : tout est validé, ou rien. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** PostgreSQL embarqué : en mémoire (tests) ou dans un dossier (développement). */
export async function openPglite(dataDir?: string): Promise<Database> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  const wrap = (q: { query: PGlite['query'] }): Queryable => ({
    query: async <T,>(sql: string, params: unknown[] = []) => (await q.query<T>(sql, params)).rows,
  });
  // PGlite n'exécute qu'une requête à la fois : on sérialise les transactions.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    ...wrap(db),
    transaction: <T,>(fn: (tx: Queryable) => Promise<T>) => {
      const run = chain.then(() => db.transaction((tx) => fn(wrap(tx))));
      chain = run.catch(() => {});
      return run;
    },
    close: () => db.close(),
  };
}

/** PostgreSQL réel (production), via `DATABASE_URL`. */
export async function openPostgres(url: string): Promise<Database> {
  // Base distante : connexion chiffrée et certificat vérifié. Supabase signe ses certificats avec sa propre autorité,
  // dont le certificat racine public est fourni dans certs/ (SHA-256 80:70:25:AD…CA:FA, valable jusqu'en 2031).
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const ca = /\.supabase\.(com|co)[:/]/.test(url) ? readFileSync(SUPABASE_CA, 'utf8') : undefined;
  const pool = new pg.Pool({ connectionString: url, max: 10, ssl: local ? false : { ca } });
  return {
    query: async <T,>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[],
    transaction: async <T,>(fn: (tx: Queryable) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async <R,>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as R[] });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const SUPABASE_CA = join(dirname(fileURLToPath(import.meta.url)), '../../certs/supabase-root-2021.crt');

/** Applique, dans l'ordre et une seule fois, les fichiers `NNN_nom.sql` du dossier des migrations. */
export async function migrate(db: Database): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await db.transaction(async (tx) => {
      for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
        await tx.query(statement);
      }
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

/** Ouvre la base selon l'environnement et applique les migrations. */
export async function openDatabase(options: { url?: string; dataDir?: string } = {}): Promise<Database> {
  const db = options.url ? await openPostgres(options.url) : await openPglite(options.dataDir);
  await migrate(db);
  return db;
}
