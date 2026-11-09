import { randomUUID } from 'node:crypto';

import {
  MAX_BIO_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_POST_LENGTH,
  PSEUDO_PATTERN,
  extractMentions,
  getTheme,
  isCountryCode,
  isSticker,
  levelFromXp,
  seasonOf,
  weekOf,
  NEARBY_KM,
  LOCATION_PRECISION_DEG,
  themeTitleForLevel,
  themeTitleTier,
  unlockedDecors,
  unlockedThemeTitles,
  type ActivityView,
  type DecorId,
  type CommentView,
  type DuelResult,
  type FeedItem,
  type LeaderboardRow,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type PostTarget,
  type PostView,
  type PublicProfile,
  type ThemeInfo,
  type UserSummary,
} from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import type { Notifier } from './notifier';
import type { RateLimiter } from './rate-limit';
import { Banners } from './banners';
import { mediaUrl, mediaView, type Media } from './media';

/** Erreur métier renvoyée telle quelle par l'API (code HTTP + code lisible). */
export class SocialError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const PAGE = 30;

interface SummaryRow {
  id: string;
  pseudo: string;
  equipped_title: string | null;
  xp: number;
  avatar_key: string | null;
}

const SUMMARY_COLUMNS = `u.id, p.pseudo, p.equipped_title, u.xp, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key`;

function summary(r: SummaryRow): UserSummary {
  return { id: r.id, pseudo: r.pseudo, title: r.equipped_title, level: levelFromXp(r.xp).level, avatar: mediaUrl(r.avatar_key) };
}

/** Aucun blocage dans un sens ou dans l'autre entre `viewer` et la colonne `other`. */
function notBlocked(other: string, viewer = '$1'): string {
  return `NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ${viewer} AND bl.blocked_id = ${other})
    OR (bl.blocker_id = ${other} AND bl.blocked_id = ${viewer}))`;
}

/**
 * Le contenu de l'auteur est visible par `viewer` : pas de blocage, et profil public,
 * ou viewer = auteur, ou viewer abonné accepté. Utilisé par TOUTES les requêtes communautaires.
 */
function canSee(author: string, viewer = '$1'): string {
  return `(${notBlocked(author, viewer)} AND (${author} = ${viewer}
    OR NOT (SELECT pr.is_private FROM profiles pr WHERE pr.user_id = ${author})
    OR EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = ${viewer} AND fo.followee_id = ${author})))`;
}

/** Service social : profils, abonnements, thèmes, publications, commentaires, likes, mentions, classements. */
export class Social {
  private readonly banners: Banners;

  constructor(
    private readonly db: Database,
    private readonly limiter: RateLimiter,
    private readonly notifier?: Notifier,
    private readonly media?: Media,
    private readonly isOnline: (userId: string) => boolean = () => false,
  ) {
    this.banners = new Banners(db);
  }

  /** Les notifications ne doivent jamais faire échouer l'action qui les déclenche. */
  private notify(userId: string, input: Parameters<Notifier['notify']>[1]): Promise<void> {
    return this.notifier ? this.notifier.notify(userId, input).catch((err) => console.error('Notification', err)) : Promise.resolve();
  }

  // ---- Utilitaires -------------------------------------------------------------------------

  private async exists(userId: string): Promise<boolean> {
    return (await this.db.query("SELECT 1 FROM users WHERE id = $1 AND status NOT IN ('banned', 'deleted')", [userId])).length > 0;
  }

  async isBlockedEitherWay(a: string, b: string, q: Queryable = this.db): Promise<boolean> {
    return (
      (await q.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b]))
        .length > 0
    );
  }

  private async canSeeContentOf(viewer: string, author: string): Promise<boolean> {
    const rows = await this.db.query(`SELECT 1 WHERE ${canSee('$2')}`, [viewer, author]);
    return rows.length > 0;
  }

  private limit(action: string, userId: string): void {
    if (!this.limiter.allow(action, userId)) throw new SocialError(429, 'rate_limited');
  }

  // ---- Profils -----------------------------------------------------------------------------

  async profile(viewer: string, targetId: string): Promise<PublicProfile> {
    const [row] = await this.db.query<
      SummaryRow & {
        bio: string;
        is_private: boolean;
        show_followers: boolean;
        show_following: boolean;
        cover_key: string | null;
        country: string | null;
        city: string | null;
        region: string | null;
        geo_lat: number | null;
        last_seen_at: Date | null;
        equipped_decor: DecorId | null;
        equipped_banner: string | null;
      }
    >(
      `SELECT ${SUMMARY_COLUMNS}, p.bio, p.is_private, p.show_followers, p.show_following, p.country, p.city, p.region, p.geo_lat,
         u.last_seen_at, p.equipped_decor, p.equipped_banner,
         (SELECT storage_key FROM media WHERE id = p.cover_media_id AND removed_by_moderation_at IS NULL) AS cover_key
       FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.status <> 'banned'`,
      [targetId],
    );
    if (!row) throw new SocialError(404, 'not_found');
    const isMe = viewer === targetId;
    const [rel] = await this.db.query<{
      following: boolean;
      requested: boolean;
      follows_me: boolean;
      blocked_by_me: boolean;
      blocks_me: boolean;
      followers: number;
      following_count: number;
    }>(
      `SELECT
        EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2) AS following,
        EXISTS (SELECT 1 FROM follow_requests WHERE requester_id = $1 AND target_id = $2) AS requested,
        EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1) AS follows_me,
        EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
        EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocks_me,
        (SELECT count(*)::int FROM follows WHERE followee_id = $2) AS followers,
        (SELECT count(*)::int FROM follows WHERE follower_id = $2) AS following_count`,
      [viewer, targetId],
    );
    // Un joueur qui m'a bloqué m'est invisible.
    if (rel.blocks_me && !isMe) throw new SocialError(404, 'not_found');
    const canSeeContent = isMe || (!rel.blocked_by_me && (!row.is_private || rel.following));
    // Même règle que la messagerie : présence visible pour soi-même ou entre abonnés mutuels.
    const presence =
      isMe || (rel.following && rel.follows_me && !rel.blocked_by_me)
        ? { online: isMe || this.isOnline(targetId), lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : null }
        : null;
    let best: PublicProfile['best'] = null;
    if (canSeeContent && !rel.blocked_by_me) {
      const [b] = await this.db.query<{ theme_id: string; rank: number; players: number }>(
        `WITH mine AS (
           SELECT theme_id, xp FROM theme_stats WHERE user_id = $1 AND duels > 0 ORDER BY xp DESC, theme_id LIMIT 1)
         SELECT mine.theme_id,
           (SELECT count(*)::int + 1 FROM theme_stats t JOIN users u ON u.id = t.user_id
             WHERE t.theme_id = mine.theme_id AND t.duels > 0 AND t.xp > mine.xp AND u.status <> 'banned') AS rank,
           (SELECT count(*)::int FROM theme_stats t JOIN users u ON u.id = t.user_id
             WHERE t.theme_id = mine.theme_id AND t.duels > 0 AND u.status <> 'banned') AS players
         FROM mine`,
        [targetId],
      );
      if (b) best = { themeId: b.theme_id, rank: b.rank, players: b.players };
    }
    const visible = canSeeContent && !rel.blocked_by_me;
    const themeXp = await this.themeXp(targetId);
    const decors = this.decorsFor(row.xp, themeXp);
    return {
      ...summary(row),
      bio: canSeeContent ? row.bio : '',
      isPrivate: row.is_private,
      showFollowers: row.show_followers,
      showFollowing: row.show_following,
      followers: rel.followers,
      following: rel.following_count,
      xp: row.xp,
      relationship: {
        isMe,
        following: rel.following,
        requested: rel.requested,
        followsMe: rel.follows_me,
        blockedByMe: rel.blocked_by_me,
      },
      canSeeContent,
      canSeeFollowers: isMe || (canSeeContent && row.show_followers),
      canSeeFollowing: isMe || (canSeeContent && row.show_following),
      cover: mediaUrl(row.cover_key),
      ...(isMe ? { country: row.country, city: row.city, region: row.region, hasLocation: row.geo_lat !== null } : {}),
      ...(!isMe && canSeeContent && row.city ? { country: row.country, city: row.city } : {}),
      presence,
      best,
      autoTitle: visible ? this.bestTitle(themeXp) : null,
      decor: row.equipped_decor && decors.includes(row.equipped_decor) ? row.equipped_decor : decors[decors.length - 1],
      banners: visible ? await this.banners.of(targetId, themeXp, row.equipped_banner) : [],
    };
  }

  /** XP des thèmes réellement joués. */
  private async themeXp(userId: string, q: Queryable = this.db): Promise<Map<string, number>> {
    const rows = await q.query<{ theme_id: string; xp: number }>('SELECT theme_id, xp FROM theme_stats WHERE user_id = $1 AND duels > 0', [userId]);
    return new Map(rows.map((r) => [r.theme_id, r.xp]));
  }

  /** Thèmes joués, du titre le plus prestigieux au moins prestigieux (à palier égal, le plus d'XP). */
  private themesByPrestige(themeXp: Map<string, number>): [string, number][] {
    const tier = (xp: number) => themeTitleTier(levelFromXp(xp).level);
    return [...themeXp].sort(([, a], [, b]) => tier(b) - tier(a) || b - a);
  }

  private bestTitle(themeXp: Map<string, number>): string | null {
    const [best] = this.themesByPrestige(themeXp);
    return best ? themeTitleForLevel(best[0], levelFromXp(best[1]).level) : null;
  }

  private decorsFor(xp: number, themeXp: Map<string, number>): DecorId[] {
    const bestThemeLevel = Math.max(0, ...[...themeXp.values()].map((v) => levelFromXp(v).level));
    return unlockedDecors(levelFromXp(xp).level, bestThemeLevel);
  }

  private titlesFor(themeXp: Map<string, number>): string[] {
    return [...new Set(this.themesByPrestige(themeXp).flatMap(([themeId, xp]) => unlockedThemeTitles(themeId, levelFromXp(xp).level)))];
  }

  /** Titres (les plus prestigieux d'abord) et décors que le joueur peut équiper. */
  async cosmetics(userId: string, xp: number): Promise<{ titles: string[]; decors: DecorId[] }> {
    const themeXp = await this.themeXp(userId);
    return { titles: this.titlesFor(themeXp), decors: this.decorsFor(xp, themeXp) };
  }

  async updateProfile(
    userId: string,
    patch: {
      pseudo?: unknown;
      bio?: unknown;
      isPrivate?: unknown;
      showFollowers?: unknown;
      showFollowing?: unknown;
      equippedTitle?: unknown;
      equippedDecor?: unknown;
      equippedBanner?: unknown;
      country?: unknown;
      city?: unknown;
      region?: unknown;
      location?: unknown;
    },
  ): Promise<PublicProfile> {
    // Vérifié avant la transaction : le calcul des banderoles interroge la base directement.
    if (patch.equippedBanner !== undefined && patch.equippedBanner !== null) {
      const owned = await this.banners.of(userId, new Map(), null);
      if (!owned.some((b) => b.key === String(patch.equippedBanner))) throw new SocialError(403, 'banner_locked');
    }
    await this.db.transaction(async (tx) => {
      if (patch.pseudo !== undefined) {
        const pseudo = String(patch.pseudo).trim();
        if (!PSEUDO_PATTERN.test(pseudo)) throw new SocialError(400, 'invalid_pseudo');
        const taken = await tx.query('SELECT 1 FROM profiles WHERE lower(pseudo) = lower($1) AND user_id <> $2', [pseudo, userId]);
        if (taken.length) throw new SocialError(409, 'pseudo_taken');
        await tx.query('UPDATE profiles SET pseudo = $2 WHERE user_id = $1', [userId, pseudo]);
      }
      if (patch.bio !== undefined) {
        const bio = String(patch.bio).trim();
        if (bio.length > MAX_BIO_LENGTH) throw new SocialError(400, 'bio_too_long');
        await tx.query('UPDATE profiles SET bio = $2 WHERE user_id = $1', [userId, bio]);
      }
      for (const [key, column] of [
        ['isPrivate', 'is_private'],
        ['showFollowers', 'show_followers'],
        ['showFollowing', 'show_following'],
      ] as const) {
        if (patch[key] === undefined) continue;
        if (typeof patch[key] !== 'boolean') throw new SocialError(400, 'invalid_value');
        await tx.query(`UPDATE profiles SET ${column} = $2 WHERE user_id = $1`, [userId, patch[key]]);
      }
      // Un profil redevenu public accepte les demandes en attente : elles visaient à le suivre.
      if (patch.isPrivate === false) {
        await tx.query(
          `INSERT INTO follows (follower_id, followee_id)
           SELECT requester_id, target_id FROM follow_requests WHERE target_id = $1 ON CONFLICT DO NOTHING`,
          [userId],
        );
        await tx.query('DELETE FROM follow_requests WHERE target_id = $1', [userId]);
      }
      if (patch.country !== undefined) {
        if (patch.country !== null && !isCountryCode(patch.country)) throw new SocialError(400, 'invalid_country');
        await tx.query('UPDATE profiles SET country = $2 WHERE user_id = $1', [userId, patch.country]);
      }
      if (patch.city !== undefined) {
        const city = patch.city === null ? null : String(patch.city).trim();
        if (city !== null && (city.length < 1 || city.length > 60)) throw new SocialError(400, 'invalid_city');
        await tx.query('UPDATE profiles SET city = $2 WHERE user_id = $1', [userId, city]);
      }
      if (patch.region !== undefined) {
        const region = patch.region === null ? null : String(patch.region).trim();
        if (region !== null && (region.length < 1 || region.length > 60)) throw new SocialError(400, 'invalid_region');
        await tx.query('UPDATE profiles SET region = $2 WHERE user_id = $1', [userId, region]);
      }
      // Position approximative (arrondie à ~11 km), seulement pour le classement « À proximité ».
      if (patch.location !== undefined) {
        if (patch.location === null) {
          await tx.query('UPDATE profiles SET geo_lat = NULL, geo_lon = NULL WHERE user_id = $1', [userId]);
        } else {
          const { lat, lon } = patch.location as { lat?: unknown; lon?: unknown };
          if (typeof lat !== 'number' || typeof lon !== 'number' || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
            throw new SocialError(400, 'invalid_location');
          }
          const round = (v: number) => Math.round(v / LOCATION_PRECISION_DEG) * LOCATION_PRECISION_DEG;
          await tx.query('UPDATE profiles SET geo_lat = $2, geo_lon = $3 WHERE user_id = $1', [userId, round(lat), round(lon)]);
        }
      }
      if (patch.equippedTitle !== undefined) {
        const title = patch.equippedTitle === null ? null : String(patch.equippedTitle);
        if (title !== null && !this.titlesFor(await this.themeXp(userId, tx)).includes(title)) throw new SocialError(403, 'title_locked');
        await tx.query('UPDATE profiles SET equipped_title = $2 WHERE user_id = $1', [userId, title]);
      }
      if (patch.equippedDecor !== undefined) {
        const decor = patch.equippedDecor === null ? null : String(patch.equippedDecor);
        const [{ xp }] = await tx.query<{ xp: number }>('SELECT xp FROM users WHERE id = $1', [userId]);
        if (decor !== null && !(this.decorsFor(xp, await this.themeXp(userId, tx)) as string[]).includes(decor)) throw new SocialError(403, 'decor_locked');
        await tx.query('UPDATE profiles SET equipped_decor = $2 WHERE user_id = $1', [userId, decor]);
      }
      if (patch.equippedBanner !== undefined) {
        await tx.query('UPDATE profiles SET equipped_banner = $2 WHERE user_id = $1', [userId, patch.equippedBanner === null ? null : String(patch.equippedBanner)]);
      }
    });
    return this.profile(userId, userId);
  }

  // ---- Abonnements -------------------------------------------------------------------------

  /** S'abonner : direct pour un profil public, demande pour un profil privé. */
  async follow(viewer: string, target: string): Promise<{ status: 'following' | 'requested' }> {
    if (viewer === target) throw new SocialError(400, 'self');
    if (!(await this.exists(target))) throw new SocialError(404, 'not_found');
    if (await this.isBlockedEitherWay(viewer, target)) throw new SocialError(403, 'blocked');
    this.limit('follow', viewer);
    const [{ is_private }] = await this.db.query<{ is_private: boolean }>('SELECT is_private FROM profiles WHERE user_id = $1', [target]);
    const already = await this.db.query('SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2', [viewer, target]);
    if (already.length) return { status: 'following' };
    if (is_private) {
      const added = await this.db.query(
        'INSERT INTO follow_requests (requester_id, target_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING requester_id',
        [viewer, target],
      );
      if (added.length) {
        await this.notify(target, { type: 'follow_request', category: 'follows', actorId: viewer, groupKey: `follow_request:${viewer}` });
      }
      return { status: 'requested' };
    }
    const added = await this.db.query(
      'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING follower_id',
      [viewer, target],
    );
    if (added.length) {
      await this.notify(target, { type: 'new_follower', category: 'follows', actorId: viewer, groupKey: `new_follower:${viewer}` });
    }
    return { status: 'following' };
  }

  /** Se désabonner ou annuler sa demande. */
  async unfollow(viewer: string, target: string): Promise<void> {
    await this.db.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [viewer, target]);
    const cancelled = await this.db.query('DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2 RETURNING target_id', [
      viewer,
      target,
    ]);
    if (cancelled.length && this.notifier) await this.notifier.remove(target, `follow_request:${viewer}`);
  }

  /** Retirer un abonné : accès privé révoqué immédiatement, sans notification. */
  async removeFollower(owner: string, follower: string): Promise<void> {
    await this.db.query('DELETE FROM follows WHERE follower_id = $2 AND followee_id = $1', [owner, follower]);
  }

  async followRequests(owner: string): Promise<{ user: UserSummary; createdAt: number }[]> {
    const rows = await this.db.query<SummaryRow & { created_at: Date }>(
      `SELECT ${SUMMARY_COLUMNS}, fr.created_at FROM follow_requests fr
       JOIN users u ON u.id = fr.requester_id JOIN profiles p ON p.user_id = u.id
       WHERE fr.target_id = $1 AND u.status <> 'banned' AND ${notBlocked('u.id')}
       ORDER BY fr.created_at DESC`,
      [owner],
    );
    return rows.map((r) => ({ user: summary(r), createdAt: new Date(r.created_at).getTime() }));
  }

  /** Accepter une demande (une par une, jamais en masse). */
  async acceptRequest(owner: string, requester: string): Promise<void> {
    const accepted = await this.db.transaction(async (tx) => {
      const removed = await tx.query('DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2 RETURNING requester_id', [
        requester,
        owner,
      ]);
      if (!removed.length) throw new SocialError(404, 'no_request');
      if (await this.isBlockedEitherWay(owner, requester, tx)) return false;
      await tx.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [requester, owner]);
      return true;
    });
    if (this.notifier) await this.notifier.remove(owner, `follow_request:${requester}`);
    if (accepted) await this.notify(requester, { type: 'follow_accepted', category: 'follows', actorId: owner });
  }

  /** Refuser une demande : aucune notification au demandeur. */
  async declineRequest(owner: string, requester: string): Promise<void> {
    await this.db.query('DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2', [requester, owner]);
    if (this.notifier) await this.notifier.remove(owner, `follow_request:${requester}`);
  }

  async followList(viewer: string, target: string, which: 'followers' | 'following', search?: string): Promise<UserSummary[]> {
    const profile = await this.profile(viewer, target);
    if (which === 'followers' ? !profile.canSeeFollowers : !profile.canSeeFollowing) throw new SocialError(403, 'hidden');
    const [joinCol, whereCol] = which === 'followers' ? ['follower_id', 'followee_id'] : ['followee_id', 'follower_id'];
    const rows = await this.db.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM follows f
       JOIN users u ON u.id = f.${joinCol} JOIN profiles p ON p.user_id = u.id
       WHERE f.${whereCol} = $2 AND u.status <> 'banned' AND ${notBlocked('u.id')}
         AND ($3::text IS NULL OR p.pseudo ILIKE '%' || $3 || '%')
       ORDER BY f.created_at DESC LIMIT 200`,
      [viewer, target, search?.trim() ? search.trim().replace(/[%_\\]/g, (c) => `\\${c}`) : null],
    );
    return rows.map(summary);
  }

  // ---- Blocage (effets sociaux) ------------------------------------------------------------

  /** Bloquer : supprime les abonnements et demandes dans les deux sens (non restaurés au déblocage). */
  async block(blocker: string, blocked: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [blocker, blocked]);
      await tx.query(
        'DELETE FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)',
        [blocker, blocked],
      );
      await tx.query(
        'DELETE FROM follow_requests WHERE (requester_id = $1 AND target_id = $2) OR (requester_id = $2 AND target_id = $1)',
        [blocker, blocked],
      );
    });
  }

  // ---- Thèmes ------------------------------------------------------------------------------

  async themeInfo(viewer: string, themeIds: string[]): Promise<ThemeInfo[]> {
    const rows = await this.db.query<{ theme_id: string; n: number; mine: boolean }>(
      `SELECT theme_id, count(*)::int AS n, bool_or(user_id = $1) AS mine FROM theme_subscriptions
       WHERE theme_id = ANY($2::text[]) GROUP BY theme_id`,
      [viewer, themeIds],
    );
    const byId = new Map(rows.map((r) => [r.theme_id, r]));
    return themeIds.map((id) => ({ themeId: id, subscribers: byId.get(id)?.n ?? 0, subscribed: byId.get(id)?.mine ?? false }));
  }

  async setThemeSubscription(viewer: string, themeId: string, subscribed: boolean): Promise<ThemeInfo> {
    if (!getTheme(themeId)) throw new SocialError(404, 'unknown_theme');
    if (subscribed) {
      await this.db.query('INSERT INTO theme_subscriptions (user_id, theme_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [viewer, themeId]);
    } else {
      await this.db.query('DELETE FROM theme_subscriptions WHERE user_id = $1 AND theme_id = $2', [viewer, themeId]);
    }
    return (await this.themeInfo(viewer, [themeId]))[0];
  }

  async subscribedThemes(viewer: string): Promise<string[]> {
    return (await this.db.query<{ theme_id: string }>('SELECT theme_id FROM theme_subscriptions WHERE user_id = $1 ORDER BY created_at', [viewer])).map(
      (r) => r.theme_id,
    );
  }

  // ---- Mentions ----------------------------------------------------------------------------

  /** Résout les @pseudo d'un texte. Exclut soi-même et toute personne bloquée dans un sens ou l'autre. */
  private async resolveMentions(author: string, text: string, tx: Queryable): Promise<{ id: string; pseudo: string }[]> {
    const pseudos = extractMentions(text);
    if (!pseudos.length) return [];
    const rows = await tx.query<{ id: string; pseudo: string }>(
      `SELECT u.id, p.pseudo FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE lower(p.pseudo) = ANY($2::text[]) AND u.id <> $1 AND u.status <> 'banned' AND ${notBlocked('u.id')}`,
      [author, pseudos],
    );
    return rows.filter(() => this.limiter.allow('mention', author));
  }

  private async saveMentions(tx: Queryable, type: 'post' | 'comment', contentId: string, author: string, list: { id: string }[]) {
    for (const m of list) {
      await tx.query(
        'INSERT INTO mentions (id, content_type, content_id, author_id, mentioned_user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [randomUUID(), type, contentId, author, m.id],
      );
    }
  }

  // ---- Publications ------------------------------------------------------------------------

  /** Publication : texte, avec au choix une photo (déjà envoyée) ou un sticker du pack Qu1z. */
  async createPost(viewer: string, target: PostTarget, rawText: unknown, mediaId?: string, stickerId?: unknown): Promise<PostView> {
    const text = String(rawText ?? '').trim();
    const sticker = stickerId === undefined || stickerId === null ? null : stickerId;
    if (sticker !== null && (!isSticker(sticker) || mediaId)) throw new SocialError(400, 'invalid_sticker');
    if ((!text && !mediaId && !sticker) || text.length > MAX_POST_LENGTH) throw new SocialError(400, 'invalid_text');
    if (mediaId && !this.media) throw new SocialError(503, 'media_unavailable');
    this.limit('post', viewer);
    const id = randomUUID();
    let mentioned: { id: string }[] = [];
    await this.db.transaction(async (tx) => {
      if (target.kind === 'theme') {
        if (!getTheme(target.themeId)) throw new SocialError(404, 'unknown_theme');
        const sub = await tx.query('SELECT 1 FROM theme_subscriptions WHERE user_id = $1 AND theme_id = $2', [viewer, target.themeId]);
        if (!sub.length) throw new SocialError(403, 'not_subscribed');
      }
      const media = mediaId ? await this.media!.attach(tx, viewer, mediaId, 'post') : null;
      await tx.query('INSERT INTO posts (id, author_id, target, theme_id, text, media_id, sticker_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        id,
        viewer,
        target.kind,
        target.kind === 'theme' ? target.themeId : null,
        text,
        media?.id ?? null,
        sticker,
      ]);
      mentioned = await this.resolveMentions(viewer, text, tx);
      await this.saveMentions(tx, 'post', id, viewer, mentioned);
    });
    for (const m of mentioned) {
      await this.notify(m.id, { type: 'mention', category: 'community', actorId: viewer, data: { postId: id } });
    }
    return this.post(viewer, id);
  }

  private async postViews(viewer: string, where: string, params: unknown[], before?: number): Promise<PostView[]> {
    const rows = await this.db.query<
      SummaryRow & {
        post_id: string;
        target: 'profile' | 'theme';
        theme_id: string | null;
        text: string;
        created_at: Date;
        likes: number;
        liked: boolean;
        comments: number;
        media_id: string | null;
        media_key: string | null;
        media_width: number | null;
        media_height: number | null;
        media_animated: boolean | null;
        sticker_id: string | null;
      }
    >(
      `SELECT po.id AS post_id, po.target, po.theme_id, po.text, po.created_at, po.sticker_id, ${SUMMARY_COLUMNS},
         md.id AS media_id, md.storage_key AS media_key, md.width AS media_width, md.height AS media_height, md.animated AS media_animated,
         (SELECT count(*)::int FROM post_likes l WHERE l.post_id = po.id) AS likes,
         EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = po.id AND l.user_id = $1) AS liked,
         (SELECT count(*)::int FROM comments c WHERE c.post_id = po.id AND c.removed_at IS NULL AND ${notBlocked('c.author_id')}) AS comments
       FROM posts po JOIN users u ON u.id = po.author_id JOIN profiles p ON p.user_id = u.id
       LEFT JOIN media md ON md.id = po.media_id AND md.removed_by_moderation_at IS NULL
       WHERE po.removed_at IS NULL AND u.status <> 'banned' AND ${canSee('po.author_id')} AND (${where})
         -- Fil d'un thème : réservé à ses abonnés (l'auteur et les personnes mentionnées voient toujours la publication).
         AND (po.target <> 'theme' OR po.author_id = $1
           OR EXISTS (SELECT 1 FROM theme_subscriptions ts WHERE ts.user_id = $1 AND ts.theme_id = po.theme_id)
           OR EXISTS (SELECT 1 FROM mentions mn WHERE mn.content_type = 'post' AND mn.content_id = po.id AND mn.mentioned_user_id = $1))
         AND ($${params.length + 2}::timestamptz IS NULL OR po.created_at < $${params.length + 2})
       ORDER BY po.created_at DESC, po.id DESC LIMIT ${PAGE}`,
      [viewer, ...params, before ? new Date(before) : null],
    );
    const mentions = await this.mentionsOf(viewer, 'post', rows.map((r) => r.post_id));
    return rows.map((r) => ({
      id: r.post_id,
      author: summary(r),
      target: r.target === 'theme' ? { kind: 'theme', themeId: r.theme_id! } : { kind: 'profile' },
      text: r.text,
      media:
        r.media_id && r.media_key
          ? mediaView({ id: r.media_id, storage_key: r.media_key, width: r.media_width!, height: r.media_height!, animated: !!r.media_animated })
          : null,
      sticker: isSticker(r.sticker_id) ? r.sticker_id : null,
      createdAt: new Date(r.created_at).getTime(),
      likes: r.likes,
      likedByMe: r.liked,
      comments: r.comments,
      mentions: mentions.get(r.post_id) ?? [],
    }));
  }

  private async mentionsOf(viewer: string, type: 'post' | 'comment', ids: string[]): Promise<Map<string, { id: string; pseudo: string }[]>> {
    const map = new Map<string, { id: string; pseudo: string }[]>();
    if (!ids.length) return map;
    const rows = await this.db.query<{ content_id: string; id: string; pseudo: string }>(
      `SELECT m.content_id, u.id, p.pseudo FROM mentions m JOIN users u ON u.id = m.mentioned_user_id
       JOIN profiles p ON p.user_id = u.id
       WHERE m.content_type = $2 AND m.content_id = ANY($3::uuid[]) AND ${notBlocked('u.id')}`,
      [viewer, type, ids],
    );
    for (const r of rows) map.set(r.content_id, [...(map.get(r.content_id) ?? []), { id: r.id, pseudo: r.pseudo }]);
    return map;
  }

  async post(viewer: string, postId: string): Promise<PostView> {
    const [view] = await this.postViews(viewer, 'po.id = $2', [postId]);
    if (!view) throw new SocialError(404, 'not_found');
    return view;
  }

  /** Fil d'un thème : cadenassé tant que le joueur ne suit pas le thème. */
  async themeFeed(viewer: string, themeId: string, before?: number): Promise<PostView[]> {
    const sub = await this.db.query('SELECT 1 FROM theme_subscriptions WHERE user_id = $1 AND theme_id = $2', [viewer, themeId]);
    if (!sub.length) throw new SocialError(403, 'not_subscribed');
    return this.postViews(viewer, "po.target = 'theme' AND po.theme_id = $2", [themeId], before);
  }

  async wall(viewer: string, authorId: string, before?: number): Promise<PostView[]> {
    return this.postViews(viewer, "po.target = 'profile' AND po.author_id = $2", [authorId], before);
  }

  /** Accueil : mes publications, murs des personnes suivies, fils des thèmes suivis, activité de jeu des suivis. */
  async homeFeed(viewer: string, before?: number): Promise<FeedItem[]> {
    const posts = await this.postViews(
      viewer,
      `po.author_id = $1
       OR (po.target = 'profile' AND po.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))
       OR (po.target = 'theme' AND po.theme_id IN (SELECT theme_id FROM theme_subscriptions WHERE user_id = $1))`,
      [],
      before,
    );
    const activity = await this.activity(viewer, before);
    return [
      ...posts.map((post) => ({ kind: 'post' as const, at: post.createdAt, post })),
      ...activity.map((a) => ({ kind: 'activity' as const, at: a.createdAt, activity: a })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, PAGE);
  }

  /** Activité de jeu (victoires, sans-faute, niveaux) de moi et des personnes que je suis. */
  async activity(viewer: string, before?: number): Promise<ActivityView[]> {
    const rows = await this.db.query<SummaryRow & { duel_id: string; result: DuelResult; created_at: Date }>(
      `SELECT r.duel_id, r.result, r.created_at, ${SUMMARY_COLUMNS} FROM duel_results r
       JOIN users u ON u.id = r.user_id JOIN profiles p ON p.user_id = u.id
       WHERE (r.user_id = $1 OR r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))
         AND u.status <> 'banned' AND ${canSee('r.user_id')}
         AND ($2::timestamptz IS NULL OR r.created_at < $2)
       ORDER BY r.created_at DESC LIMIT ${PAGE}`,
      [viewer, before ? new Date(before) : null],
    );
    const out: ActivityView[] = [];
    for (const r of rows) {
      const rec = r.result.record;
      const base = { user: summary(r), themeId: rec.themeId, createdAt: new Date(r.created_at).getTime() };
      const levelBefore = levelFromXp(rec.xpBefore).level;
      const after = levelFromXp(rec.xpBefore + rec.xpGained).level;
      if (after > levelBefore) out.push({ ...base, id: `${r.duel_id}:${r.id}:level`, event: { kind: 'level', level: after } });
      if (rec.player.length === rec.questions.length && rec.player.length > 0 && rec.player.every((a) => a.correct)) {
        out.push({ ...base, id: `${r.duel_id}:${r.id}:perfect`, event: { kind: 'perfect' } });
      } else if (rec.outcome === 'win') {
        const score = rec.player.reduce((t, a) => t + a.points, 0);
        const opponentScore = rec.opponent.reduce((t, a) => t + a.points, 0);
        out.push({ ...base, id: `${r.duel_id}:${r.id}:win`, event: { kind: 'win', opponent: rec.opponentName, score, opponentScore } });
      }
    }
    return out;
  }

  // ---- Likes et commentaires ---------------------------------------------------------------

  async setLike(viewer: string, postId: string, liked: boolean): Promise<PostView> {
    await this.post(viewer, postId); // vérifie la visibilité (et donc les blocages)
    this.limit('like', viewer);
    if (liked) {
      const added = await this.db.query(
        'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING post_id',
        [postId, viewer],
      );
      const post = await this.post(viewer, postId);
      // Likes regroupés : « Thomas et 14 autres personnes aiment ta publication ».
      if (added.length) {
        await this.notify(post.author.id, { type: 'like', category: 'community', actorId: viewer, groupKey: `like:${postId}`, data: { postId } });
      }
    } else await this.db.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, viewer]);
    return this.post(viewer, postId);
  }

  async comments(viewer: string, postId: string): Promise<CommentView[]> {
    await this.post(viewer, postId);
    const rows = await this.db.query<
      SummaryRow & {
        comment_id: string;
        parent_comment_id: string | null;
        text: string;
        created_at: Date;
        likes: number;
        liked: boolean;
        media_id: string | null;
        media_key: string | null;
        media_width: number | null;
        media_height: number | null;
        media_animated: boolean | null;
      }
    >(
      `SELECT c.id AS comment_id, c.parent_comment_id, c.text, c.created_at, ${SUMMARY_COLUMNS},
         md.id AS media_id, md.storage_key AS media_key, md.width AS media_width, md.height AS media_height, md.animated AS media_animated,
         (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id = c.id) AS likes,
         EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $1) AS liked
       FROM comments c JOIN users u ON u.id = c.author_id JOIN profiles p ON p.user_id = u.id
       LEFT JOIN media md ON md.id = c.media_id AND md.removed_by_moderation_at IS NULL
       WHERE c.post_id = $2 AND c.removed_at IS NULL AND u.status <> 'banned' AND ${notBlocked('c.author_id')}
       ORDER BY c.created_at, c.id`,
      [viewer, postId],
    );
    const mentions = await this.mentionsOf(viewer, 'comment', rows.map((r) => r.comment_id));
    return rows.map((r) => ({
      id: r.comment_id,
      postId,
      parentId: r.parent_comment_id,
      author: summary(r),
      text: r.text,
      createdAt: new Date(r.created_at).getTime(),
      mentions: mentions.get(r.comment_id) ?? [],
      likes: r.likes,
      likedByMe: r.liked,
      media: r.media_id
        ? mediaView({ id: r.media_id, storage_key: r.media_key!, width: r.media_width!, height: r.media_height!, animated: !!r.media_animated })
        : null,
    }));
  }

  /** J'aime sur un commentaire : mêmes règles de visibilité que la publication, sans notification. */
  async setCommentLike(viewer: string, commentId: string, liked: boolean): Promise<{ likes: number; likedByMe: boolean }> {
    const [comment] = await this.db.query<{ post_id: string; author_id: string }>('SELECT post_id, author_id FROM comments WHERE id = $1 AND removed_at IS NULL', [commentId]);
    if (!comment) throw new SocialError(404, 'not_found');
    await this.post(viewer, comment.post_id);
    if (await this.isBlockedEitherWay(viewer, comment.author_id)) throw new SocialError(403, 'blocked');
    this.limit('like', viewer);
    if (liked) await this.db.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, viewer]);
    else await this.db.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, viewer]);
    const [row] = await this.db.query<{ likes: number }>('SELECT count(*)::int AS likes FROM comment_likes WHERE comment_id = $1', [commentId]);
    return { likes: row.likes, likedByMe: liked };
  }

  /** Dernières personnes ayant aimé une publication (avatars de la page de détail). */
  async recentLikers(viewer: string, postId: string): Promise<UserSummary[]> {
    await this.post(viewer, postId);
    const rows = await this.db.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS}
       FROM post_likes l JOIN users u ON u.id = l.user_id JOIN profiles p ON p.user_id = u.id
       WHERE l.post_id = $2 AND u.status <> 'banned' AND ${notBlocked('l.user_id')}
       ORDER BY l.created_at DESC LIMIT 5`,
      [viewer, postId],
    );
    return rows.map(summary);
  }

  async addComment(viewer: string, postId: string, rawText: unknown, parentId?: string, mediaId?: string): Promise<CommentView> {
    const post = await this.post(viewer, postId);
    const text = String(rawText ?? '').trim();
    if ((!text && !mediaId) || text.length > MAX_COMMENT_LENGTH) throw new SocialError(400, 'invalid_text');
    if (mediaId && !this.media) throw new SocialError(503, 'media_unavailable');
    if (await this.isBlockedEitherWay(viewer, post.author.id)) throw new SocialError(403, 'blocked');
    this.limit('comment', viewer);
    const id = randomUUID();
    let parentAuthor: string | null = null;
    let mentioned: { id: string }[] = [];
    await this.db.transaction(async (tx) => {
      if (parentId) {
        const [parent] = await tx.query<{ author_id: string; parent_comment_id: string | null }>(
          'SELECT author_id, parent_comment_id FROM comments WHERE id = $1 AND post_id = $2 AND removed_at IS NULL',
          [parentId, postId],
        );
        if (!parent) throw new SocialError(404, 'unknown_parent');
        if (await this.isBlockedEitherWay(viewer, parent.author_id, tx)) throw new SocialError(403, 'blocked');
        parentAuthor = parent.author_id;
        // Les réponses restent sur un seul niveau : on répond au fil du commentaire d'origine.
        parentId = parent.parent_comment_id ?? parentId;
      }
      const media = mediaId ? await this.media!.attach(tx, viewer, mediaId, 'post') : null;
      await tx.query('INSERT INTO comments (id, post_id, author_id, parent_comment_id, text, media_id) VALUES ($1, $2, $3, $4, $5, $6)', [
        id,
        postId,
        viewer,
        parentId ?? null,
        text,
        media?.id ?? null,
      ]);
      mentioned = await this.resolveMentions(viewer, text, tx);
      await this.saveMentions(tx, 'comment', id, viewer, mentioned);
    });
    const data = { postId, commentId: id };
    // Réponse à mon commentaire : regroupée par discussion, repart de zéro après lecture.
    if (parentAuthor) {
      await this.notify(parentAuthor, { type: 'reply', category: 'community', actorId: viewer, groupKey: `reply:${parentId}`, resetWhenRead: true, data });
    }
    if (post.author.id !== parentAuthor) {
      await this.notify(post.author.id, { type: 'comment', category: 'community', actorId: viewer, groupKey: `comment:${postId}`, resetWhenRead: true, data });
    }
    for (const m of mentioned) {
      if (m.id !== parentAuthor && m.id !== post.author.id) await this.notify(m.id, { type: 'mention', category: 'community', actorId: viewer, data });
    }
    return (await this.comments(viewer, postId)).find((c) => c.id === id)!;
  }

  // ---- Classements -------------------------------------------------------------------------

  async leaderboard(
    viewer: string,
    themeId: string | null,
    scope: LeaderboardScope,
    limit = 100,
    period: LeaderboardPeriod = 'rating',
  ): Promise<{ rows: LeaderboardRow[]; me: LeaderboardRow | null }> {
    // Par thème : la cote du thème ; général : moyenne des 3 meilleurs thèmes ($2 nul).
    const ratingSql = `SELECT user_id, rating FROM theme_stats WHERE $2::text IS NOT NULL AND theme_id = $2
      UNION ALL
      SELECT user_id, round(avg(rating))::int AS rating FROM (
        SELECT user_id, rating, row_number() OVER (PARTITION BY user_id ORDER BY rating DESC) AS rn FROM theme_stats
      ) t WHERE $2::text IS NULL AND rn <= 3 GROUP BY user_id`;
    // Saison (le mois) ou semaine (du lundi 00:00 UTC) : XP gagnée pendant la période, dans le thème s'il est donné.
    // Le classement général compte aussi les récompenses des défis du jour.
    const window = period === 'week' ? weekOf(Date.now()) : seasonOf(Date.now());
    const periodSql = `SELECT user_id, sum(xp)::int AS rating FROM (
        SELECT d.user_id, d.xp_awarded AS xp FROM duel_results d JOIN duels du ON du.id = d.duel_id
        WHERE d.created_at >= $5 AND d.created_at < $6 AND ($2::text IS NULL OR du.theme_id = $2)
        UNION ALL
        SELECT q.user_id, q.reward AS xp FROM daily_quests q
        WHERE $2::text IS NULL AND $7::boolean AND q.completed_at >= $5 AND q.completed_at < $6
      ) x GROUP BY user_id HAVING sum(xp) > 0`;
    const ranked = await this.db.query<SummaryRow & { rating: number; rn: number }>(
      `WITH ratings AS (${period === 'rating' ? ratingSql : periodSql}),
       me AS (SELECT country, region, geo_lat, geo_lon FROM profiles WHERE user_id = $1),
       ranked AS (
         SELECT ${SUMMARY_COLUMNS}, r.rating, row_number() OVER (ORDER BY r.rating DESC, u.id) AS rn
         FROM ratings r JOIN users u ON u.id = r.user_id JOIN profiles p ON p.user_id = u.id, me
         WHERE u.status <> 'banned' AND ${notBlocked('u.id')}
           AND ($3::text = 'world'
             OR ($3 = 'following' AND (u.id = $1 OR u.id IN (SELECT followee_id FROM follows WHERE follower_id = $1)))
             -- Pays, région, position : jamais de classement pour qui ne les a pas choisis (l'égalité avec NULL est fausse).
             OR ($3 = 'country' AND p.country = me.country)
             OR ($3 = 'region' AND p.country = me.country AND p.region = me.region)
             OR ($3 = 'nearby' AND p.geo_lat IS NOT NULL AND me.geo_lat IS NOT NULL
               AND 6371 * 2 * asin(sqrt(
                 power(sin(radians(p.geo_lat - me.geo_lat) / 2), 2)
                 + cos(radians(me.geo_lat)) * cos(radians(p.geo_lat)) * power(sin(radians(p.geo_lon - me.geo_lon) / 2), 2)
               )) <= ${NEARBY_KM}))
       )
       SELECT * FROM ranked WHERE rn <= $4 OR id = $1 ORDER BY rn`,
      [
        viewer,
        themeId,
        scope,
        Math.min(Math.max(1, limit), 100),
        ...(period === 'rating' ? [] : [new Date(window.startsAt), new Date(window.endsAt), period === 'week']),
      ],
    );
    const all = ranked.map((r) => ({ rank: Number(r.rn), user: summary(r), rating: r.rating, isMe: r.id === viewer }));
    const top = Math.min(Math.max(1, limit), 100);
    return { rows: all.filter((r) => r.rank <= top), me: all.find((r) => r.isMe) ?? null };
  }
}
