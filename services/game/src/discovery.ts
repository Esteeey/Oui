import { CATEGORIES, THEMES, levelFromXp, type PeopleEntry, type PeopleSections, type UserSummary } from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import { mediaUrl } from './media';

/** Taille de la liste Découvrir et équilibre entre suggestions personnalisées et découvertes au hasard. */
export const DISCOVER = {
  size: 12,
  personalized: 8,
  random: 4,
  /** Nombre de suggestions remplacées à chaque renouvellement… */
  rotate: 3,
  /** …au plus une fois par heure. */
  rotateEveryMs: 60 * 60 * 1000,
  /** Un profil déjà proposé n'est pas reproposé avant ce délai (sauf s'il n'y a pas assez de joueurs). */
  cooldownDays: 7,
};

/** Page Personnes : joueurs par section, et fenêtre des « joueurs actifs ». */
export const PEOPLE = { perSection: 6, activeDays: 7 };

const MAX_QUERY = 30;

function notBlocked(other: string, viewer = '$1'): string {
  return `NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ${viewer} AND bl.blocked_id = ${other})
    OR (bl.blocker_id = ${other} AND bl.blocked_id = ${viewer}))`;
}

interface Row {
  id: string;
  pseudo: string;
  equipped_title: string | null;
  xp: number;
  avatar_key: string | null;
}

const toSummary = (r: Row): UserSummary => ({
  id: r.id,
  pseudo: r.pseudo,
  title: r.equipped_title,
  level: levelFromXp(r.xp).level,
  avatar: mediaUrl(r.avatar_key),
});

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function likePattern(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface SearchResults {
  players: UserSummary[];
  themes: { id: string; name: string; categoryId: string }[];
}

/** Recherche globale (joueurs, thèmes), suggestions de mentions et page Découvrir. */
export class Discovery {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  /** Joueurs par pseudo (exact, puis début, puis contenu) et thèmes par nom. Jamais un joueur bloqué ou banni. */
  async search(viewer: string, raw: string): Promise<SearchResults> {
    const q = String(raw ?? '').trim().slice(0, MAX_QUERY);
    if (!q) return { players: [], themes: [] };
    const players = await this.db.query<Row>(
      `SELECT u.id, p.pseudo, p.equipped_title, u.xp, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.status <> 'banned' AND ${notBlocked('u.id')}
         AND lower(p.pseudo) LIKE '%' || lower($2) || '%' ESCAPE '\\'
       ORDER BY (lower(p.pseudo) = lower($3)) DESC, (lower(p.pseudo) LIKE lower($2) || '%' ESCAPE '\\') DESC,
                length(p.pseudo), p.pseudo
       LIMIT 20`,
      [viewer, likePattern(q), q],
    );
    const nq = normalize(q);
    const themes = THEMES.filter((t) => {
      const category = CATEGORIES.find((c) => c.id === t.categoryId);
      return normalize(`${t.name} ${category?.name ?? ''}`).includes(nq);
    }).map((t) => ({ id: t.id, name: t.name, categoryId: t.categoryId }));
    return { players: players.map(toSummary), themes };
  }

  /** Suggestions pendant la saisie d'une mention @… : début de pseudo, sans soi-même ni joueur bloqué. */
  async mentionSuggestions(viewer: string, raw: string): Promise<UserSummary[]> {
    const q = String(raw ?? '').trim().replace(/^@/, '').slice(0, 20);
    if (!q) return [];
    const rows = await this.db.query<Row>(
      `SELECT u.id, p.pseudo, p.equipped_title, u.xp, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.id <> $1 AND u.status <> 'banned' AND ${notBlocked('u.id')}
         AND lower(p.pseudo) LIKE lower($2) || '%' ESCAPE '\\'
       ORDER BY EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = u.id) DESC,
                length(p.pseudo), p.pseudo
       LIMIT 6`,
      [viewer, likePattern(q)],
    );
    return rows.map(toSummary);
  }

  /**
   * Page Découvrir : liste stable, renouvelée progressivement (quelques profils à la fois, au plus une fois par heure),
   * mélangeant suggestions personnalisées (niveau proche, thèmes en commun, activité récente) et profils au hasard.
   * Les thèmes servent au calcul mais ne sont jamais affichés.
   */
  async discover(viewer: string): Promise<UserSummary[]> {
    return this.db.transaction(async (tx) => {
      // Retire ce qui n'a plus lieu d'être : déjà suivi, demande envoyée, blocage, compte banni.
      await tx.query(
        `DELETE FROM discover_suggestions ds WHERE ds.user_id = $1 AND (
           EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = ds.suggested_id)
           OR EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = $1 AND r.target_id = ds.suggested_id)
           OR EXISTS (SELECT 1 FROM users u WHERE u.id = ds.suggested_id AND u.status = 'banned')
           OR NOT (${notBlocked('ds.suggested_id')}))`,
        [viewer],
      );
      const current = await tx.query<{ suggested_id: string; kind: string; added_at: Date }>(
        'SELECT suggested_id, kind, added_at FROM discover_suggestions WHERE user_id = $1 ORDER BY added_at ASC',
        [viewer],
      );
      const newest = current.reduce((t, c) => Math.max(t, new Date(c.added_at).getTime()), 0);
      // Renouvellement progressif : on remplace seulement les plus anciennes.
      if (current.length >= DISCOVER.size && this.now() - newest >= DISCOVER.rotateEveryMs) {
        const old = current.slice(0, DISCOVER.rotate).map((c) => c.suggested_id);
        await tx.query('DELETE FROM discover_suggestions WHERE user_id = $1 AND suggested_id = ANY($2::uuid[])', [viewer, old]);
        current.splice(0, DISCOVER.rotate);
      }
      const counts = { personalized: 0, random: 0 };
      for (const c of current) counts[c.kind as 'personalized' | 'random']++;
      await this.fill(tx, viewer, 'personalized', DISCOVER.personalized - counts.personalized);
      await this.fill(tx, viewer, 'random', DISCOVER.size - current.length - Math.max(0, DISCOVER.personalized - counts.personalized));
      // Complète si l'un des deux viviers était trop petit.
      const [{ n }] = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM discover_suggestions WHERE user_id = $1', [viewer]);
      if (n < DISCOVER.size) await this.fill(tx, viewer, 'random', DISCOVER.size - n);

      const rows = await tx.query<Row & { kind: string }>(
        `SELECT u.id, p.pseudo, p.equipped_title, u.xp, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key, ds.kind FROM discover_suggestions ds
         JOIN users u ON u.id = ds.suggested_id JOIN profiles p ON p.user_id = u.id
         WHERE ds.user_id = $1 ORDER BY ds.added_at DESC, ds.suggested_id`,
        [viewer],
      );
      await tx.query(
        `INSERT INTO discover_history (user_id, suggested_id, last_shown_at)
         SELECT $1, suggested_id, now() FROM discover_suggestions WHERE user_id = $1
         ON CONFLICT (user_id, suggested_id) DO UPDATE SET last_shown_at = now()`,
        [viewer],
      );
      // Mélange : une découverte au hasard toutes les trois suggestions personnalisées.
      const personal = rows.filter((r) => r.kind === 'personalized');
      const random = rows.filter((r) => r.kind === 'random');
      const mixed: Row[] = [];
      while (personal.length || random.length) {
        mixed.push(...personal.splice(0, 2));
        if (random.length) mixed.push(random.shift()!);
      }
      return mixed.map(toSummary);
    });
  }

  /**
   * Page Personnes : un aperçu des suggestions de Découvrir, puis les joueurs avec le plus de thèmes en commun,
   * les plus actifs de la semaine et les plus suivis. Pas d'âge, de sexe ni de position : rien de tout ça n'est collecté.
   * La présence en ligne n'est jamais révélée (réservée aux abonnements mutuels, dans la messagerie).
   */
  async people(viewer: string): Promise<PeopleSections> {
    const suggestions = (await this.discover(viewer)).slice(0, PEOPLE.perSection);
    const shown = suggestions.map((u) => u.id);
    // Mêmes exclusions que Découvrir, plus les joueurs déjà affichés dans une section précédente.
    const eligible = `u.id <> $1 AND u.status <> 'banned' AND ${notBlocked('u.id')}
      AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = $1 AND r.target_id = u.id)
      AND NOT (u.id = ANY($2::uuid[]))`;
    const columns = `u.id, p.pseudo, p.equipped_title, u.xp,
      (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key`;
    const section = async (sql: string, toEntry: (r: Row & { n: number; show_followers: boolean }) => PeopleEntry) => {
      const rows = await this.db.query<Row & { n: number; show_followers: boolean }>(sql, [viewer, shown, PEOPLE.perSection]);
      shown.push(...rows.map((r) => r.id));
      return rows.map(toEntry);
    };

    const commonThemes = await section(
      `WITH mine AS (SELECT theme_id FROM theme_subscriptions WHERE user_id = $1 UNION SELECT theme_id FROM theme_stats WHERE user_id = $1),
            theirs AS (SELECT user_id, theme_id FROM theme_subscriptions UNION SELECT user_id, theme_id FROM theme_stats)
       SELECT ${columns}, count(*)::int AS n FROM theirs t JOIN mine m ON m.theme_id = t.theme_id
         JOIN users u ON u.id = t.user_id JOIN profiles p ON p.user_id = u.id
       WHERE ${eligible}
       GROUP BY u.id, p.user_id
       ORDER BY n DESC, u.last_seen_at DESC NULLS LAST, u.id LIMIT $3`,
      (r) => ({ user: toSummary(r), commonThemes: r.n }),
    );
    // Activité publique : duels terminés, et seulement pour les comptes publics.
    const active = await section(
      `SELECT ${columns}, count(*)::int AS n FROM duel_results d
         JOIN users u ON u.id = d.user_id JOIN profiles p ON p.user_id = u.id
       WHERE d.created_at > now() - make_interval(days => ${PEOPLE.activeDays}) AND NOT p.is_private AND ${eligible}
       GROUP BY u.id, p.user_id
       ORDER BY n DESC, u.id LIMIT $3`,
      (r) => ({ user: toSummary(r), duelsThisWeek: r.n }),
    );
    const popular = await section(
      `SELECT * FROM (
         SELECT ${columns}, p.show_followers, (SELECT count(*)::int FROM follows f WHERE f.followee_id = u.id) AS n
         FROM users u JOIN profiles p ON p.user_id = u.id WHERE ${eligible}) x
       WHERE n > 0 ORDER BY n DESC, xp DESC, id LIMIT $3`,
      (r) => ({ user: toSummary(r), followers: r.show_followers ? r.n : null }),
    );
    return { suggestions, commonThemes, active, popular };
  }

  private async fill(tx: Queryable, viewer: string, kind: 'personalized' | 'random', count: number): Promise<void> {
    if (count <= 0) return;
    const [me] = await tx.query<{ xp: number }>('SELECT xp FROM users WHERE id = $1', [viewer]);
    const myThemes = (
      await tx.query<{ theme_id: string }>(
        'SELECT theme_id FROM theme_subscriptions WHERE user_id = $1 UNION SELECT theme_id FROM theme_stats WHERE user_id = $1',
        [viewer],
      )
    ).map((r) => r.theme_id);
    for (const respectCooldown of [true, false]) {
      const order =
        kind === 'random'
          ? // Les paramètres $2 et $3 restent typés même quand le tri au hasard ne s'en sert pas.
            'random() + 0 * $2::int + 0 * cardinality($3::text[])'
          : `abs(u.xp - $2)::float / 100
             - 3 * (SELECT count(*) FROM (SELECT theme_id FROM theme_subscriptions WHERE user_id = u.id
                                          UNION SELECT theme_id FROM theme_stats WHERE user_id = u.id) t
                    WHERE t.theme_id = ANY($3::text[]))
             + coalesce(extract(epoch FROM now() - u.last_seen_at) / 86400, 30)`;
      const added = await tx.query(
        `INSERT INTO discover_suggestions (user_id, suggested_id, kind)
         SELECT $1, u.id, '${kind}' FROM users u
         WHERE u.id <> $1 AND u.status <> 'banned' AND ${notBlocked('u.id')}
           AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM follow_requests r WHERE r.requester_id = $1 AND r.target_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM discover_suggestions ds WHERE ds.user_id = $1 AND ds.suggested_id = u.id)
           AND ($5::boolean = false OR NOT EXISTS (
                 SELECT 1 FROM discover_history h WHERE h.user_id = $1 AND h.suggested_id = u.id
                   AND h.last_shown_at > now() - make_interval(days => ${DISCOVER.cooldownDays})))
         ORDER BY ${order}
         LIMIT $4
         ON CONFLICT DO NOTHING RETURNING suggested_id`,
        [viewer, me?.xp ?? 0, myThemes, count, respectCooldown],
      );
      count -= added.length;
      if (count <= 0) return;
    }
  }
}
