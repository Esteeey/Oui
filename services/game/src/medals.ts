import { SEASON_PODIUM, levelFromXp, seasonById, seasonOf, type DuelResult, type EarnedMedal } from '@qu1z/shared';

import type { Database, Queryable } from './db/database';

/**
 * Attribue les médailles méritées d'après les duels enregistrés du joueur, datées du duel qui les a débloquées.
 * Idempotent : appelé après chaque duel (dans sa transaction) et pour rattraper les duels plus anciens.
 */
export async function awardMedals(q: Queryable, userId: string): Promise<void> {
  const rows = await q.query<{ result: DuelResult; created_at: Date }>(
    'SELECT result, created_at FROM duel_results WHERE user_id = $1 ORDER BY created_at, duel_id',
    [userId],
  );
  const earned = new Map<string, Date>();
  const unlock = (id: string, at: Date, ok: boolean) => {
    if (ok && !earned.has(id)) earned.set(id, at);
  };
  const themeXp = new Map<string, number>();
  let streak = 0;
  for (const { result, created_at: at } of rows) {
    const r = result.record;
    themeXp.set(r.themeId, r.xpBefore + r.xpGained);
    streak = r.outcome === 'win' ? streak + 1 : 0;
    unlock('premier-duel', at, true);
    unlock('victoire', at, r.outcome === 'win');
    unlock('sans-faute', at, r.player.length > 0 && r.player.every((a) => a.correct));
    unlock('eclair', at, r.player.some((a) => a.correct && a.responseMs < 1000));
    unlock('serie', at, streak >= 3);
    unlock('explorateur', at, themeXp.size >= 3);
    unlock('passionne', at, [...themeXp.values()].some((xp) => levelFromXp(xp).level >= 5));
    unlock('revanche', at, r.opponentId !== null && r.outcome === 'win');
  }
  for (const [id, at] of earned) {
    await q.query('INSERT INTO user_medals (user_id, medal_id, earned_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, id, at]);
  }
}

/** Médailles et saisons (classement de l'XP gagnée dans le mois, podium récompensé à la clôture). */
export class Medals {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  /** Médailles d'un joueur (le visiteur doit avoir le droit de voir son contenu : vérifié par l'API). */
  async of(userId: string): Promise<EarnedMedal[]> {
    await this.closeFinishedSeasons();
    await awardMedals(this.db, userId);
    const rows = await this.db.query<{ medal_id: string; earned_at: Date; season_rank: number | null }>(
      'SELECT medal_id, earned_at, season_rank FROM user_medals WHERE user_id = $1 ORDER BY earned_at, medal_id',
      [userId],
    );
    return rows.map((r) => {
      const season = r.medal_id.startsWith('season:') ? seasonById(r.medal_id.slice('season:'.length)) : null;
      return {
        id: r.medal_id,
        earnedAt: new Date(r.earned_at).getTime(),
        ...(season && r.season_rank ? { season: { id: season.id, name: season.name, rank: r.season_rank } } : {}),
      };
    });
  }

  /** Clôture les saisons passées pas encore traitées : médaille aux trois joueurs ayant gagné le plus d'XP (hors bannis). */
  async closeFinishedSeasons(): Promise<void> {
    const current = seasonOf(this.now());
    const open = await this.db.query<{ season_id: string }>(
      `SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS season_id FROM duel_results WHERE created_at < $1
       EXCEPT SELECT season_id FROM seasons_closed`,
      [new Date(current.startsAt)],
    );
    for (const { season_id } of open) {
      const season = seasonById(season_id);
      if (!season) continue;
      await this.db.transaction(async (tx) => {
        // Une seule clôture même si deux requêtes arrivent en même temps.
        const claimed = await tx.query('INSERT INTO seasons_closed (season_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING season_id', [season.id]);
        if (!claimed.length) return;
        const podium = await tx.query<{ user_id: string }>(
          `SELECT d.user_id FROM duel_results d JOIN users u ON u.id = d.user_id
           WHERE d.created_at >= $1 AND d.created_at < $2 AND u.status <> 'banned'
           GROUP BY d.user_id HAVING sum(d.xp_awarded) > 0
           ORDER BY sum(d.xp_awarded) DESC, min(d.created_at), d.user_id LIMIT $3`,
          [new Date(season.startsAt), new Date(season.endsAt), SEASON_PODIUM],
        );
        for (const [i, { user_id }] of podium.entries()) {
          await tx.query(
            'INSERT INTO user_medals (user_id, medal_id, earned_at, season_rank) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [user_id, `season:${season.id}`, new Date(season.endsAt), i + 1],
          );
        }
      });
    }
  }
}
