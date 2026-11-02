import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { INITIAL_RATING, type DuelResult, type ThemeStats } from '@qu1z/shared';

import { openDatabase, type Database } from './db/database';
import type { DuelState } from './duel';

interface LegacyPlayer {
  id: string;
  tokenHash: string;
  name: string;
  xp: number;
  stats: Record<string, ThemeStats>;
  pendingResult: string | null;
}

interface LegacyStore {
  players: Record<string, LegacyPlayer>;
  duels: Record<string, DuelState>;
  results: Record<string, DuelResult>;
}

/**
 * Reprise des données de l'ancien stockage JSON (`data/store.json`) dans PostgreSQL.
 * Idempotente : une donnée déjà présente n'est ni dupliquée ni modifiée.
 */
export async function importLegacy(db: Database, data: LegacyStore): Promise<{ players: number; duels: number; results: number }> {
  const count = { players: 0, duels: 0, results: 0 };
  await db.transaction(async (tx) => {
    for (const p of Object.values(data.players ?? {})) {
      const inserted = await tx.query(
        'INSERT INTO users (id, token_hash, xp) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id',
        [p.id, p.tokenHash, p.xp],
      );
      if (!inserted.length) continue;
      count.players++;
      let pseudo = p.name;
      if ((await tx.query('SELECT 1 FROM profiles WHERE lower(pseudo) = lower($1)', [pseudo])).length) pseudo = `${p.name} ${p.id.slice(0, 4)}`;
      await tx.query('INSERT INTO profiles (user_id, pseudo) VALUES ($1, $2)', [p.id, pseudo]);
      for (const [themeId, s] of Object.entries(p.stats ?? {})) {
        await tx.query(
          `INSERT INTO theme_stats (user_id, theme_id, xp, rating, duels, wins, draws, correct, answered, total_correct_response_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
          [p.id, themeId, s.xp, s.rating ?? INITIAL_RATING, s.duels, s.wins, s.draws, s.correct, s.answered, s.totalCorrectResponseMs],
        );
      }
    }
    for (const state of Object.values(data.duels ?? {})) {
      const inserted = await tx.query(
        'INSERT INTO duels (id, theme_id, mode, state, finished_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id',
        [state.id, state.themeId, state.mode, state, state.endedAt ? new Date(state.endedAt) : null],
      );
      if (!inserted.length) continue;
      count.duels++;
      for (const p of state.participants) {
        if (!p.isBot && data.players[p.playerId]) {
          await tx.query('INSERT INTO duel_participants (duel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [state.id, p.playerId]);
        }
      }
    }
    for (const [key, result] of Object.entries(data.results ?? {})) {
      const [duelId, userId] = key.split(':');
      if (!data.players[userId] || !data.duels[duelId]) continue;
      const inserted = await tx.query(
        `INSERT INTO duel_results (duel_id, user_id, result, xp_awarded, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING duel_id`,
        [duelId, userId, result, result.rewards.total, new Date(result.record.playedAt)],
      );
      if (inserted.length) count.results++;
    }
    for (const p of Object.values(data.players ?? {})) {
      if (p.pendingResult) await tx.query('UPDATE users SET pending_result_duel_id = $2 WHERE id = $1', [p.id, p.pendingResult]);
    }
  });
  return count;
}

// Utilisation : tsx src/import-json.ts [chemin du store.json]
if (process.argv[1]?.endsWith('import-json.ts')) {
  const file = resolve(process.argv[2] ?? 'data/store.json');
  if (!existsSync(file)) {
    console.log(`Aucun ancien fichier à reprendre (${file}).`);
    process.exit(0);
  }
  const url = process.env.DATABASE_URL;
  const db = await openDatabase(url ? { url } : { dataDir: resolve(process.env.QU1Z_DATA_DIR ?? 'data/pg') });
  console.log('Reprise :', await importLegacy(db, JSON.parse(readFileSync(file, 'utf8'))));
  await db.close();
}
