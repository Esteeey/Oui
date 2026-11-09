import { BANNER_MIN_DUELS, BANNER_MIN_PLAYERS, getTheme, seasonById, seasonOf, type ProfileBanner } from '@qu1z/shared';

import type { Database, Queryable } from './db/database';

/**
 * N°1 de chaque thème sur la période [$1, $2[, au classement Saison (XP gagnée, mêmes égalités que l'écran).
 * Le n°1 doit remplir les conditions, comptées depuis le début jusqu'à la fin de la période : sinon pas de banderole.
 */
const WINNERS_SQL = `
  WITH month AS (
    SELECT du.theme_id, d.user_id, sum(d.xp_awarded)::int AS xp
    FROM duel_results d JOIN duels du ON du.id = d.duel_id
    WHERE d.created_at >= $1::timestamptz AND d.created_at < $2::timestamptz
    GROUP BY du.theme_id, d.user_id HAVING sum(d.xp_awarded) > 0
  ), ranked AS (
    SELECT m.theme_id, m.user_id, m.xp, row_number() OVER (PARTITION BY m.theme_id ORDER BY m.xp DESC, m.user_id) AS rn
    FROM month m JOIN users u ON u.id = m.user_id WHERE u.status <> 'banned'
  ), history AS (
    SELECT du.theme_id, d.user_id, count(*)::int AS duels
    FROM duel_results d JOIN duels du ON du.id = d.duel_id JOIN users u ON u.id = d.user_id
    WHERE d.created_at < $2::timestamptz AND u.status <> 'banned'
    GROUP BY du.theme_id, d.user_id
  )
  SELECT r.theme_id, r.user_id, r.xp FROM ranked r
  JOIN history h ON h.theme_id = r.theme_id AND h.user_id = r.user_id
  WHERE r.rn = 1 AND h.duels >= $3 AND (SELECT count(*) FROM history o WHERE o.theme_id = r.theme_id) >= $4`;

interface Winner {
  theme_id: string;
  user_id: string;
  xp: number;
}

function winners(q: Queryable, startsAt: number, endsAt: number): Promise<Winner[]> {
  return q.query<Winner>(WINNERS_SQL, [new Date(startsAt), new Date(endsAt), BANNER_MIN_DUELS, BANNER_MIN_PLAYERS]);
}

const themeName = (themeId: string) => getTheme(themeId)?.name ?? themeId;

/** Banderoles « Meilleur en… » : celle du n°1 du mois en cours, et celles gardées des mois terminés. */
export class Banners {
  /** Dernier mois pour lequel tout ce qui précède est déjà clôturé (évite la requête à chaque profil). */
  private closedDuring: string | null = null;

  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  /** Attribue les banderoles des mois terminés, y compris ceux joués avant l'arrivée des banderoles. */
  async closeFinishedMonths(): Promise<void> {
    const current = seasonOf(this.now());
    if (this.closedDuring === current.id) return;
    const open = await this.db.query<{ season_id: string }>(
      `SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS season_id FROM duel_results WHERE created_at < $1
       EXCEPT SELECT season_id FROM banner_seasons_closed`,
      [new Date(current.startsAt)],
    );
    for (const { season_id } of open) {
      const season = seasonById(season_id);
      if (!season) continue;
      await this.db.transaction(async (tx) => {
        // Une seule attribution même si deux requêtes arrivent en même temps.
        const claimed = await tx.query('INSERT INTO banner_seasons_closed (season_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING season_id', [season.id]);
        if (!claimed.length) return;
        for (const w of await winners(tx, season.startsAt, season.endsAt)) {
          await tx.query('INSERT INTO monthly_banners (season_id, theme_id, user_id, xp) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [season.id, w.theme_id, w.user_id, w.xp]);
        }
      });
    }
    this.closedDuring = current.id;
  }

  /**
   * Banderoles d'un joueur, celle à afficher en premier : la banderole équipée, puis le mois en cours
   * (thème où il a le plus d'XP d'abord), puis les mois terminés du plus récent au plus ancien.
   */
  async of(userId: string, themeXp: Map<string, number>, equipped: string | null): Promise<ProfileBanner[]> {
    await this.closeFinishedMonths();
    const current = seasonOf(this.now());
    const live = (await winners(this.db, current.startsAt, current.endsAt))
      .filter((w) => w.user_id === userId)
      .sort((a, b) => (themeXp.get(b.theme_id) ?? 0) - (themeXp.get(a.theme_id) ?? 0))
      .map((w): ProfileBanner => ({ key: `current:${w.theme_id}`, themeId: w.theme_id, themeName: themeName(w.theme_id), season: null }));
    const past = await this.db.query<{ season_id: string; theme_id: string }>(
      'SELECT season_id, theme_id FROM monthly_banners WHERE user_id = $1 ORDER BY season_id DESC, theme_id',
      [userId],
    );
    const banners = [
      ...live,
      ...past.map((b): ProfileBanner => ({
        key: `${b.season_id}:${b.theme_id}`,
        themeId: b.theme_id,
        themeName: themeName(b.theme_id),
        season: seasonById(b.season_id)?.name ?? b.season_id,
      })),
    ];
    return [...banners.filter((b) => b.key === equipped), ...banners.filter((b) => b.key !== equipped)];
  }
}
