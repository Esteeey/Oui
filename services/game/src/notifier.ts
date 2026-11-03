import { randomUUID } from 'node:crypto';

import {
  notificationText,
  DEFAULT_NOTIFICATION_PREFS,
  MAX_NOTIFICATIONS,
  levelFromXp,
  type NotificationCategory,
  type NotificationPrefs,
  type NotificationType,
  type NotificationView,
  type ServerMessage,
} from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import { mediaUrl } from './media';
import type { Push } from './push';

/** Acteurs distincts conservés par notification regroupée (le compteur reste exact jusque-là). */
const MAX_ACTORS = 200;

export interface NotifyInput {
  type: NotificationType;
  category: NotificationCategory;
  /** Joueur à l'origine de la notification (absent pour une notification système ou de progression). */
  actorId?: string;
  /** Regroupe les notifications de même clé (ex. tous les likes d'une publication). */
  groupKey?: string;
  /**
   * Regroupement « depuis la dernière lecture » : si la notification a été lue,
   * le prochain événement repart de zéro (réponses rapprochées d'une discussion).
   */
  resetWhenRead?: boolean;
  data?: Record<string, string | number | boolean | null>;
}

/**
 * Centre de notifications : création (avec regroupement), plafond de 50 par joueur appliqué
 * dans la même transaction, lecture, préférences, et signal temps réel au client.
 */
export class Notifier {
  constructor(
    private readonly db: Database,
    private readonly send: (userId: string, message: ServerMessage) => void,
  ) {}

  // ---- Création ----------------------------------------------------------------------------

  async notify(userId: string, input: NotifyInput): Promise<void> {
    if (input.actorId && input.actorId === userId) return;
    const created = await this.db.transaction(async (tx) => {
      if (input.actorId) {
        // Jamais de notification entre deux joueurs dont l'un a bloqué l'autre.
        const blocked = await tx.query(
          'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
          [userId, input.actorId],
        );
        if (blocked.length) return false;
      }
      const actors = input.actorId ? [input.actorId] : [];
      if (input.groupKey) {
        const [existing] = await tx.query<{ id: string; actor_ids: string[]; read_at: Date | null }>(
          'SELECT id, actor_ids, read_at FROM notifications WHERE user_id = $1 AND group_key = $2 FOR UPDATE',
          [userId, input.groupKey],
        );
        if (existing) {
          const restart = input.resetWhenRead && existing.read_at !== null;
          const previous = restart ? [] : existing.actor_ids.filter((a) => a !== input.actorId);
          const merged = [...actors, ...previous].slice(0, MAX_ACTORS);
          await tx.query(
            `UPDATE notifications SET actor_ids = $2::uuid[], actor_count = $3, data = $4, read_at = NULL, updated_at = now()
             WHERE id = $1`,
            [existing.id, merged, merged.length, input.data ?? {}],
          );
          await this.enforceCap(tx, userId);
          return true;
        }
      }
      await tx.query(
        `INSERT INTO notifications (id, user_id, type, category, group_key, actor_ids, actor_count, data)
         VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)`,
        [randomUUID(), userId, input.type, input.category, input.groupKey ?? null, actors, actors.length, input.data ?? {}],
      );
      await this.enforceCap(tx, userId);
      return true;
    });
    if (created) {
      this.send(userId, { type: 'notification', unread: await this.unread(userId) });
      await this.pushFor([userId], input.category);
    }
  }

  /** Branché par le serveur : notifications push (respecte les préférences par catégorie). */
  push?: Push;

  /** Push de la dernière notification, pour les joueurs hors de l'application qui l'ont activé pour cette catégorie. */
  private async pushFor(userIds: string[], category: NotificationCategory): Promise<void> {
    if (!this.push) return;
    await this.push.notify(userIds, async (userId) => {
      if (!(await this.prefs(userId)).push[category]) return null;
      const [latest] = await this.list(userId);
      if (!latest) return null;
      return { title: 'Qu1z', body: notificationText(latest), data: { kind: 'notification', notificationId: latest.id }, channelId: 'community' };
    });
  }

  /** Plafond de 50 : au-delà, les plus anciennes disparaissent, lues ou non. */
  private async enforceCap(tx: Queryable, userId: string): Promise<void> {
    await tx.query(
      `DELETE FROM notifications WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM notifications WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT ${MAX_NOTIFICATIONS})`,
      [userId],
    );
  }

  /** Retire une notification (ex. demande d'abonnement traitée ou annulée). */
  async remove(userId: string, groupKey: string): Promise<void> {
    await this.db.query('DELETE FROM notifications WHERE user_id = $1 AND group_key = $2', [userId, groupKey]);
    this.send(userId, { type: 'notification', unread: await this.unread(userId) });
  }

  /** Annonce officielle envoyée à tous les comptes actifs. */
  async broadcast(input: NotifyInput): Promise<number> {
    const count = await this.db.transaction(async (tx) => {
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO notifications (id, user_id, type, category, data)
         SELECT gen_random_uuid(), id, $1, $2, $3 FROM users WHERE status <> 'banned' RETURNING user_id AS id`,
        [input.type, input.category, input.data ?? {}],
      );
      await tx.query(
        `DELETE FROM notifications WHERE id IN (
           SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY updated_at DESC, id DESC) AS rn
                           FROM notifications) t WHERE t.rn > ${MAX_NOTIFICATIONS})`,
      );
      return rows;
    });
    for (const { id } of count) this.send(id, { type: 'notification' });
    // Push : seulement les comptes qui ont un appareil enregistré.
    if (this.push) {
      const withDevice = await this.db.query<{ user_id: string }>('SELECT DISTINCT user_id FROM push_tokens');
      await this.pushFor(withDevice.map((r) => r.user_id), input.category);
    }
    return count.length;
  }

  // ---- Lecture -----------------------------------------------------------------------------

  async list(userId: string): Promise<NotificationView[]> {
    const rows = await this.db.query<{
      id: string;
      type: NotificationType;
      category: NotificationCategory;
      actor_ids: string[];
      actor_count: number;
      data: NotificationView['data'];
      read_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, type, category, actor_ids, actor_count, data, read_at, created_at, updated_at
       FROM notifications WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT ${MAX_NOTIFICATIONS}`,
      [userId],
    );
    const actorIds = [...new Set(rows.flatMap((r) => r.actor_ids))];
    // Acteurs visibles : jamais un joueur bloqué (dans un sens ou l'autre) ni banni.
    const actors = actorIds.length
      ? await this.db.query<{ id: string; pseudo: string; equipped_title: string | null; xp: number; avatar_key: string | null }>(
          `SELECT u.id, p.pseudo, p.equipped_title, u.xp, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key FROM users u JOIN profiles p ON p.user_id = u.id
           WHERE u.id = ANY($2::uuid[]) AND u.status <> 'banned'
             AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))`,
          [userId, actorIds],
        )
      : [];
    const byId = new Map(actors.map((a) => [a.id, { id: a.id, pseudo: a.pseudo, title: a.equipped_title, level: levelFromXp(a.xp).level, avatar: mediaUrl(a.avatar_key) }]));
    const out: NotificationView[] = [];
    for (const r of rows) {
      const visible = r.actor_ids.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
      if (r.actor_ids.length > 0 && visible.length === 0) continue;
      out.push({
        id: r.id,
        type: r.type,
        category: r.category,
        actors: visible.slice(0, 3),
        actorCount: r.actor_ids.length > 0 ? visible.length : 0,
        data: r.data,
        read: r.read_at !== null,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime(),
      });
    }
    return out;
  }

  async unread(userId: string): Promise<number> {
    const [{ n }] = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [
      userId,
    ]);
    return n;
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.db.query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [id, userId]);
    this.send(userId, { type: 'notification', unread: await this.unread(userId) });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
    this.send(userId, { type: 'notification', unread: 0 });
  }

  // ---- Préférences -------------------------------------------------------------------------

  async prefs(userId: string): Promise<NotificationPrefs> {
    const [row] = await this.db.query<{ prefs: Partial<NotificationPrefs> }>('SELECT prefs FROM notification_preferences WHERE user_id = $1', [userId]);
    const stored = row?.prefs ?? {};
    return {
      push: { ...DEFAULT_NOTIFICATION_PREFS.push, ...(stored.push ?? {}) },
      friendsOnline: stored.friendsOnline ?? DEFAULT_NOTIFICATION_PREFS.friendsOnline,
      hideMessagePreviews: stored.hideMessagePreviews ?? DEFAULT_NOTIFICATION_PREFS.hideMessagePreviews,
      messagePush: stored.messagePush ?? DEFAULT_NOTIFICATION_PREFS.messagePush,
    };
  }

  /** Mise à jour partielle et validée des préférences. */
  async setPrefs(userId: string, patch: Record<string, unknown>): Promise<NotificationPrefs> {
    const current = await this.prefs(userId);
    if (patch.push && typeof patch.push === 'object') {
      for (const [key, value] of Object.entries(patch.push as Record<string, unknown>)) {
        if (key in current.push && typeof value === 'boolean') current.push[key as NotificationCategory] = value;
      }
    }
    if (typeof patch.friendsOnline === 'boolean') current.friendsOnline = patch.friendsOnline;
    if (typeof patch.hideMessagePreviews === 'boolean') current.hideMessagePreviews = patch.hideMessagePreviews;
    if (typeof patch.messagePush === 'boolean') current.messagePush = patch.messagePush;
    await this.db.query(
      'INSERT INTO notification_preferences (user_id, prefs) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET prefs = $2',
      [userId, current],
    );
    return current;
  }

  // ---- Connexions des personnes suivies ----------------------------------------------------

  /** Prévient (si elles l'ont activé) les personnes qui suivent ce joueur, au plus une fois par heure. */
  async friendOnline(userId: string): Promise<void> {
    const rows = await this.db.query<{ follower_id: string }>(
      `SELECT f.follower_id FROM follows f JOIN notification_preferences np ON np.user_id = f.follower_id
       WHERE f.followee_id = $1 AND (np.prefs ->> 'friendsOnline')::boolean = true
         AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = f.follower_id AND n.group_key = 'online:' || $1
                         AND n.updated_at > now() - interval '1 hour')`,
      [userId],
    );
    for (const r of rows) {
      await this.notify(r.follower_id, { type: 'friend_online', category: 'friends_online', actorId: userId, groupKey: `online:${userId}` });
    }
  }
}
