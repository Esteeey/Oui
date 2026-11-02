import { resolve } from 'node:path';

import { openDatabase } from './db/database';
import { Repo } from './repo';
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
// Production : DATABASE_URL (PostgreSQL). Développement : PostgreSQL embarqué dans services/game/data/pg.
const url = process.env.DATABASE_URL;
const dataDir = resolve(process.env.QU1Z_DATA_DIR ?? 'data/pg');

const db = await openDatabase(url ? { url } : { dataDir });
const server = await startServer(port, { repo: new Repo(db) });
console.log(`Serveur de jeu Qu1z : ws://localhost:${server.port} (base : ${url ? 'PostgreSQL' : dataDir})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close();
    await db.close();
    process.exit(0);
  });
}
