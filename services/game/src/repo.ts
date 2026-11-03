import { randomUUID } from 'node:crypto';

import { INITIAL_RATING, type DuelRecord, type DuelResult, type Profile, type ThemeStats } from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import type { DuelState } from './duel';
import { mediaUrl } from './media';
import { awardMedals } from './medals';

export type Role = 'player' | 'moderator' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export interface UserRow {
  id: string;
  role: Role;
  status: AccountStatus;
  xp: number;
  pending_result_duel_id: string | null;
}

interface StatsRow {
  theme_id: string;
  xp: number;
  rating: number;
  duels: number;
  wins: number;
  draws: number;
  correct: number;
  answered: number;
  total_correct_response_ms: string | number;
}

const HISTORY_SIZE = 30;

function toStats(r: StatsRow): ThemeStats {
  return {
    xp: r.xp,
    rating: r.rating,
    duels: r.duels,
    wins: r.wins,
    draws: r.draws,
    correct: r.correct,
    answered: r.answered,
    totalCorrectResponseMs: Number(r.total_correct_response_ms),
  };
}

/** Accès aux données du serveur. Toutes les écritures sensibles passent par des transactions. */
export class Repo {
  constructor(readonly db: Database) {}

  // ---- Comptes -----------------------------------------------------------------------------

  async createGuest(tokenHash: string): Promise<UserRow> {
    const id = randomUUID();
    return this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO users (id, token_hash) VALUES ($1, $2)', [id, tokenHash]);
      for (let attempt = 0; ; attempt++) {
        const pseudo = `Joueur_${1000 + Math.floor(Math.random() * 9000)}${attempt > 5 ? attempt : ''}`;
        const taken = await tx.query('SELECT 1 FROM profiles WHERE lower(pseudo) = lower($1)', [pseudo]);
        if (taken.length === 0) {
          await tx.query('INSERT INTO profiles (user_id, pseudo) VALUES ($1, $2)', [id, pseudo]);
          break;
        }
      }
      return (await tx.query<UserRow>('SELECT id, role, status, xp, pending_result_duel_id FROM users WHERE id = $1', [id]))[0];
    });
  }

  async userByTokenHash(tokenHash: string): Promise<UserRow | null> {
    // Jeton d'origine du compte, ou session ouverte par connexion e-mail sur un autre appareil.
    const rows = await this.db.query<UserRow>(
      `SELECT id, role, status, xp, pending_result_duel_id FROM users
       WHERE token_hash = $1 OR id = (SELECT user_id FROM sessions WHERE token_hash = $1)`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async user(id: string): Promise<UserRow | null> {
    const rows = await this.db.query<UserRow>('SELECT id, role, status, xp, pending_result_duel_id FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async touchLastSeen(id: string): Promise<void> {
    await this.db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [id]);
  }

  async setRole(id: string, role: Role): Promise<void> {
    await this.db.query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
  }

  async setStatus(id: string, status: AccountStatus): Promise<void> {
    await this.db.query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
  }

  async pseudo(id: string): Promise<string> {
    return (await this.db.query<{ pseudo: string }>('SELECT pseudo FROM profiles WHERE user_id = $1', [id]))[0]?.pseudo ?? '?';
  }

  async avatar(id: string): Promise<string | null> {
    const [row] = await this.db.query<{ avatar_key: string | null }>(
      'SELECT (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key FROM profiles p WHERE p.user_id = $1',
      [id],
    );
    return mediaUrl(row?.avatar_key);
  }

  async cover(id: string): Promise<string | null> {
    const [row] = await this.db.query<{ cover_key: string | null }>(
      'SELECT (SELECT storage_key FROM media WHERE id = p.cover_media_id AND removed_by_moderation_at IS NULL) AS cover_key FROM profiles p WHERE p.user_id = $1',
      [id],
    );
    return mediaUrl(row?.cover_key);
  }

  async profile(id: string): Promise<Profile> {
    const [user] = await this.db.query<{ xp: number; pseudo: string; avatar_key: string | null }>(
      `SELECT u.xp, p.pseudo, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [id],
    );
    const stats = await this.db.query<StatsRow>('SELECT * FROM theme_stats WHERE user_id = $1', [id]);
    const history = await this.db.query<{ result: DuelResult }>(
      'SELECT result FROM duel_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [id, HISTORY_SIZE],
    );
    return {
      id,
      name: user?.pseudo ?? '?',
      xp: user?.xp ?? 0,
      avatar: mediaUrl(user?.avatar_key),
      stats: Object.fromEntries(stats.map((s) => [s.theme_id, toStats(s)])),
      history: history.map((h) => h.result.record),
    };
  }

  async themeRating(userId: string, themeId: string): Promise<number> {
    const rows = await this.db.query<{ rating: number }>('SELECT rating FROM theme_stats WHERE user_id = $1 AND theme_id = $2', [
      userId,
      themeId,
    ]);
    return rows[0]?.rating ?? INITIAL_RATING;
  }

  // ---- Duels -------------------------------------------------------------------------------

  async createDuel(state: DuelState, humanIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO duels (id, theme_id, mode, state) VALUES ($1, $2, $3, $4)', [state.id, state.themeId, state.mode, state]);
      for (const id of humanIds) await tx.query('INSERT INTO duel_participants (duel_id, user_id) VALUES ($1, $2)', [state.id, id]);
    });
  }

  async saveDuel(state: DuelState): Promise<void> {
    await this.db.query('UPDATE duels SET state = $2, finished_at = $3 WHERE id = $1', [
      state.id,
      state,
      state.endedAt ? new Date(state.endedAt) : null,
    ]);
  }

  async unfinishedDuels(): Promise<DuelState[]> {
    return (await this.db.query<{ state: DuelState }>('SELECT state FROM duels WHERE finished_at IS NULL')).map((r) => r.state);
  }

  async duelState(id: string): Promise<DuelState | null> {
    return (await this.db.query<{ state: DuelState }>('SELECT state FROM duels WHERE id = $1', [id]))[0]?.state ?? null;
  }

  async result(duelId: string, userId: string): Promise<DuelResult | null> {
    const rows = await this.db.query<{ result: DuelResult }>('SELECT result FROM duel_results WHERE duel_id = $1 AND user_id = $2', [
      duelId,
      userId,
    ]);
    return rows[0]?.result ?? null;
  }

  async rewardedCount(duelId: string, userId: string): Promise<number> {
    const rows = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM duel_results WHERE duel_id = $1 AND user_id = $2', [
      duelId,
      userId,
    ]);
    return rows[0].n;
  }

  /**
   * Versement des récompenses dans UNE transaction. La clé primaire (duel, joueur) de `duel_results`
   * empêche tout second versement : un appel répété ne change rien et renvoie le résultat existant.
   * `build` calcule le résultat à partir des statistiques du thème lues dans la même transaction.
   */
  async grantOnce(
    duelId: string,
    userId: string,
    themeId: string,
    initialRating: number,
    build: (stats: ThemeStats, accountXp: number) => { result: DuelResult; newStats: ThemeStats },
  ): Promise<DuelResult> {
    return this.db.transaction(async (tx: Queryable) => {
      const existing = await tx.query<{ result: DuelResult }>('SELECT result FROM duel_results WHERE duel_id = $1 AND user_id = $2', [
        duelId,
        userId,
      ]);
      if (existing[0]) return existing[0].result;
      const [user] = await tx.query<{ xp: number }>('SELECT xp FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const statsRows = await tx.query<StatsRow>('SELECT * FROM theme_stats WHERE user_id = $1 AND theme_id = $2 FOR UPDATE', [
        userId,
        themeId,
      ]);
      const stats = statsRows[0]
        ? toStats(statsRows[0])
        : { xp: 0, rating: initialRating, duels: 0, wins: 0, draws: 0, correct: 0, answered: 0, totalCorrectResponseMs: 0 };
      const { result, newStats } = build(stats, user.xp);
      const inserted = await tx.query(
        'INSERT INTO duel_results (duel_id, user_id, result, xp_awarded) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING duel_id',
        [duelId, userId, result, result.rewards.total],
      );
      if (inserted.length === 0) {
        return (await tx.query<{ result: DuelResult }>('SELECT result FROM duel_results WHERE duel_id = $1 AND user_id = $2', [duelId, userId]))[0]
          .result;
      }
      await tx.query(
        `INSERT INTO theme_stats (user_id, theme_id, xp, rating, duels, wins, draws, correct, answered, total_correct_response_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, theme_id) DO UPDATE SET xp = $3, rating = $4, duels = $5, wins = $6, draws = $7,
           correct = $8, answered = $9, total_correct_response_ms = $10`,
        [
          userId,
          themeId,
          newStats.xp,
          newStats.rating,
          newStats.duels,
          newStats.wins,
          newStats.draws,
          newStats.correct,
          newStats.answered,
          newStats.totalCorrectResponseMs,
        ],
      );
      await tx.query('UPDATE users SET xp = xp + $2, pending_result_duel_id = $3 WHERE id = $1', [userId, result.rewards.total, duelId]);
      await awardMedals(tx, userId);
      return result;
    });
  }

  async clearPendingResult(userId: string, duelId: string): Promise<void> {
    await this.db.query('UPDATE users SET pending_result_duel_id = NULL WHERE id = $1 AND pending_result_duel_id = $2', [userId, duelId]);
  }

  // ---- Blocages ----------------------------------------------------------------------------

  async block(blockerId: string, blockedId: string): Promise<void> {
    await this.db.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [blockerId, blockedId]);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.db.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
  }

  async blockedBy(blockerId: string): Promise<{ id: string; pseudo: string; since: number }[]> {
    const rows = await this.db.query<{ id: string; pseudo: string; created_at: Date }>(
      `SELECT b.blocked_id AS id, p.pseudo, b.created_at FROM blocks b
       JOIN profiles p ON p.user_id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [blockerId],
    );
    return rows.map((r) => ({ id: r.id, pseudo: r.pseudo, since: new Date(r.created_at).getTime() }));
  }

  /** Vrai si l'un des deux a bloqué l'autre. */
  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const rows = await this.db.query(
      'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
      [a, b],
    );
    return rows.length > 0;
  }
}

export type { DuelRecord };
