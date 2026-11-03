import { randomUUID } from 'node:crypto';

import {
  groupRights,
  levelFromXp,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_NAME_LENGTH,
  MAX_PINNED_MESSAGES,
  type GroupDetail,
  type GroupInvitationView,
  type GroupRole,
  type UserSummary,
} from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import { mediaUrl, type Media } from './media';
import type { Messaging } from './messaging';
import { writeLog } from './moderation-log';
import type { RateLimiter } from './rate-limit';
import { SocialError } from './social';

const AVATAR = (alias: string) =>
  `(SELECT storage_key FROM media WHERE id = ${alias}.avatar_media_id AND removed_by_moderation_at IS NULL)`;
const USER_COLUMNS = (u: string, p: string, prefix = '') =>
  `${u}.id AS ${prefix}id, ${p}.pseudo AS ${prefix}pseudo, ${p}.equipped_title AS ${prefix}title, ${u}.xp AS ${prefix}xp, ${AVATAR(p)} AS ${prefix}avatar`;

const blockedSql = (a: string, b: string) =>
  `EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ${a} AND bl.blocked_id = ${b}) OR (bl.blocker_id = ${b} AND bl.blocked_id = ${a}))`;

type Row = Record<string, unknown>;
function userOf(r: Row, prefix = ''): UserSummary {
  return {
    id: r[`${prefix}id`] as string,
    pseudo: r[`${prefix}pseudo`] as string,
    title: (r[`${prefix}title`] as string | null) ?? null,
    level: levelFromXp(Number(r[`${prefix}xp`])).level,
    avatar: mediaUrl(r[`${prefix}avatar`] as string | null),
  };
}

/** Événements affichés dans la conversation sous forme de messages système. */
type SystemEvent =
  | 'created'
  | 'joined'
  | 'left'
  | 'removed'
  | 'excluded'
  | 'admin_added'
  | 'admin_removed'
  | 'creator_transferred'
  | 'renamed'
  | 'photo_changed';

function systemText(event: SystemEvent, actor: string, target: string | null, extra?: string): string {
  switch (event) {
    case 'created':
      return `${actor} a créé le groupe « ${extra} »`;
    case 'joined':
      return `${actor} a rejoint le groupe`;
    case 'left':
      return `${actor} a quitté le groupe`;
    case 'removed':
      return `${target} a été retiré du groupe`;
    case 'excluded':
      return `${target} a été exclu du groupe`;
    case 'admin_added':
      return `${target} a été nommé administrateur`;
    case 'admin_removed':
      return `${target} n’est plus administrateur`;
    case 'creator_transferred':
      return `${target} est maintenant le créateur du groupe`;
    case 'renamed':
      return `${actor} a renommé le groupe « ${extra} »`;
    case 'photo_changed':
      return `${actor} a changé la photo du groupe`;
  }
}

/**
 * Groupes : création, invitations (acceptées ou refusées), rôles créateur / administrateur / membre,
 * transfert du rôle de créateur, départ, retrait, exclusions temporaires ou définitives, suppression,
 * messages épinglés et messages système. Toutes les vérifications de droits sont faites ici.
 */
export class Groups {
  constructor(
    private readonly db: Database,
    private readonly limiter: RateLimiter,
    private readonly messaging: Messaging,
    private readonly media: Media,
    private readonly maxMembers = MAX_GROUP_MEMBERS,
  ) {}

  private limit(action: string, userId: string): void {
    if (!this.limiter.allow(action, userId)) throw new SocialError(429, 'rate_limited');
  }

  private static cleanName(raw: unknown): string {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > MAX_GROUP_NAME_LENGTH) throw new SocialError(400, 'invalid_name');
    return name;
  }

  /** Rôle du joueur dans un groupe actif ; 404 s'il n'en est pas membre (le groupe reste invisible). */
  private async roleOf(userId: string, groupId: string, q: Queryable = this.db): Promise<GroupRole> {
    const [m] = await q.query<{ role: GroupRole }>(
      `SELECT m.role FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = $1 AND m.user_id = $2 AND m.left_at IS NULL AND c.kind = 'group' AND c.deleted_at IS NULL`,
      [groupId, userId],
    );
    if (!m) throw new SocialError(404, 'not_found');
    return m.role;
  }

  /** Journal interne : toute action de gestion d'un groupe est enregistrée. */
  private async log(q: Queryable, actor: string, role: GroupRole, action: string, groupId: string, details: Record<string, unknown> = {}) {
    await writeLog(q, { actorId: actor, actorRole: role === 'creator' ? 'group_creator' : 'group_admin', action, targetType: 'group', targetId: groupId, details });
  }

  private async pseudo(userId: string, q: Queryable = this.db): Promise<string> {
    const [r] = await q.query<{ pseudo: string }>('SELECT pseudo FROM profiles WHERE user_id = $1', [userId]);
    return r?.pseudo ?? '?';
  }

  private async memberCount(groupId: string, q: Queryable = this.db): Promise<number> {
    const [{ n }] = await q.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id = $1 AND left_at IS NULL',
      [groupId],
    );
    return n;
  }

  private async system(q: Queryable, groupId: string, event: SystemEvent, actorId: string, targetId: string | null, extra?: string): Promise<void> {
    const text = systemText(event, await this.pseudo(actorId, q), targetId ? await this.pseudo(targetId, q) : null, extra);
    await q.query(
      "INSERT INTO messages (id, conversation_id, sender_id, kind, text, system_event) VALUES ($1, $2, NULL, 'system', $3, $4)",
      [randomUUID(), groupId, text, JSON.stringify({ event, actorId, targetId })],
    );
    await q.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [groupId]);
  }

  /** Ajoute (ou réintègre) un membre ; ses non-lus partent de son arrivée mais tout l'historique lui est visible. */
  private async addMember(q: Queryable, groupId: string, userId: string, role: GroupRole): Promise<void> {
    await q.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role, last_read_seq)
       VALUES ($1, $2, $3, (SELECT coalesce(max(seq), 0) FROM messages WHERE conversation_id = $1))
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = $3, left_at = NULL, hidden_at = NULL, pinned_at = NULL,
         joined_at = now(), last_read_seq = EXCLUDED.last_read_seq`,
      [groupId, userId, role],
    );
  }

  private async activeExclusion(groupId: string, userId: string, q: Queryable = this.db): Promise<boolean> {
    const rows = await q.query(
      'SELECT 1 FROM group_exclusions WHERE conversation_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())',
      [groupId, userId],
    );
    return rows.length > 0;
  }

  // ---- Création et fiche ---------------------------------------------------------------------

  /** Crée un groupe (le créateur en est le premier membre) et invite les joueurs choisis. */
  async create(creator: string, rawName: unknown, inviteeIds: string[] = []): Promise<{ conversationId: string; invited: number }> {
    const name = Groups.cleanName(rawName);
    this.limit('groupCreate', creator);
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.query("INSERT INTO conversations (id, kind, name, created_by) VALUES ($1, 'group', $2, $3)", [id, name, creator]);
      await this.addMember(tx, id, creator, 'creator');
      await this.system(tx, id, 'created', creator, null, name);
    });
    let invited = 0;
    for (const invitee of [...new Set(inviteeIds)].slice(0, this.maxMembers - 1)) {
      try {
        await this.invite(creator, id, invitee);
        invited++;
      } catch (err) {
        // Un joueur bloqué ou introuvable est simplement ignoré (sans révéler pourquoi).
        if (!(err instanceof SocialError) || err.status === 429) throw err;
      }
    }
    await this.messaging.signalMembers(id);
    return { conversationId: id, invited };
  }

  async detail(viewer: string, groupId: string): Promise<GroupDetail> {
    const myRole = await this.roleOf(viewer, groupId);
    const [g] = await this.db.query<{ name: string; avatar: string | null }>(
      `SELECT c.name, ${AVATAR('c')} AS avatar FROM conversations c WHERE c.id = $1`,
      [groupId],
    );
    const members = await this.db.query<Row & { role: GroupRole; joined_at: Date; blocked_by_me: boolean }>(
      `SELECT ${USER_COLUMNS('u', 'p')}, m.role, m.joined_at,
         EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $2 AND b.blocked_id = u.id) AS blocked_by_me
       FROM conversation_members m JOIN users u ON u.id = m.user_id JOIN profiles p ON p.user_id = u.id
       WHERE m.conversation_id = $1 AND m.left_at IS NULL
       ORDER BY CASE m.role WHEN 'creator' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, lower(p.pseudo)`,
      [groupId, viewer],
    );
    const manager = myRole !== 'member';
    const invitations = manager
      ? await this.db.query<Row & { inv_id: string; created_at: Date }>(
          `SELECT gi.id AS inv_id, gi.created_at, ${USER_COLUMNS('ui', 'pi', 'i_')}, ${USER_COLUMNS('uf', 'pf', 'f_')}
           FROM group_invitations gi
           JOIN users ui ON ui.id = gi.invitee_id JOIN profiles pi ON pi.user_id = ui.id
           JOIN users uf ON uf.id = gi.inviter_id JOIN profiles pf ON pf.user_id = uf.id
           WHERE gi.conversation_id = $1 AND gi.status = 'pending' ORDER BY gi.created_at DESC`,
          [groupId],
        )
      : [];
    const exclusions = manager
      ? await this.db.query<Row & { until: Date | null }>(
          `SELECT ${USER_COLUMNS('u', 'p')}, ge.until FROM group_exclusions ge JOIN users u ON u.id = ge.user_id JOIN profiles p ON p.user_id = u.id
           WHERE ge.conversation_id = $1 AND NOT ge.official AND (ge.until IS NULL OR ge.until > now()) ORDER BY ge.created_at DESC`,
          [groupId],
        )
      : [];
    return {
      id: groupId,
      name: g.name,
      avatar: mediaUrl(g.avatar),
      myRole,
      members: members.map((m) => ({ user: userOf(m), role: m.role, joinedAt: new Date(m.joined_at).getTime(), blockedByMe: m.blocked_by_me })),
      invitations: invitations.map((i) => ({
        id: i.inv_id,
        invitee: userOf(i, 'i_'),
        inviter: userOf(i, 'f_'),
        createdAt: new Date(i.created_at).getTime(),
      })),
      exclusions: exclusions.map((e) => ({ user: userOf(e), until: e.until ? new Date(e.until).getTime() : null })),
    };
  }

  /** Renommer le groupe ou changer sa photo (créateur et administrateurs). */
  async update(viewer: string, groupId: string, patch: { name?: unknown; avatarMediaId?: string | null }): Promise<void> {
    const role = await this.roleOf(viewer, groupId);
    if (!groupRights(role).edit) throw new SocialError(403, 'forbidden');
    let oldKey: string | null = null;
    await this.db.transaction(async (tx) => {
      if (patch.name !== undefined) {
        const name = Groups.cleanName(patch.name);
        await tx.query('UPDATE conversations SET name = $2 WHERE id = $1', [groupId, name]);
        await this.system(tx, groupId, 'renamed', viewer, null, name);
      }
      if (patch.avatarMediaId !== undefined) {
        const [prev] = await tx.query<{ id: string; storage_key: string }>(
          'SELECT m.id, m.storage_key FROM conversations c JOIN media m ON m.id = c.avatar_media_id WHERE c.id = $1',
          [groupId],
        );
        const media = patch.avatarMediaId ? await this.media.attach(tx, viewer, patch.avatarMediaId, 'group') : null;
        await tx.query('UPDATE conversations SET avatar_media_id = $2 WHERE id = $1', [groupId, media?.id ?? null]);
        if (prev) {
          await tx.query('DELETE FROM media WHERE id = $1', [prev.id]);
          oldKey = prev.storage_key;
        }
        await this.system(tx, groupId, 'photo_changed', viewer, null);
      }
    });
    if (oldKey) await this.media.store.delete(oldKey);
    await this.messaging.signalMembers(groupId);
  }

  // ---- Invitations ---------------------------------------------------------------------------

  /** Inviter un joueur (créateur et administrateurs). Jamais à travers un blocage. */
  async invite(viewer: string, groupId: string, invitee: string): Promise<{ invitationId: string }> {
    const role = await this.roleOf(viewer, groupId);
    if (!groupRights(role).invite) throw new SocialError(403, 'forbidden');
    if (invitee === viewer) throw new SocialError(400, 'self');
    const [target] = await this.db.query("SELECT 1 FROM users WHERE id = $1 AND status <> 'banned'", [invitee]);
    if (!target) throw new SocialError(404, 'not_found');
    if ((await this.db.query(`SELECT 1 WHERE ${blockedSql('$1::uuid', '$2::uuid')}`, [viewer, invitee])).length) {
      throw new SocialError(403, 'blocked');
    }
    const member = await this.db.query('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL', [
      groupId,
      invitee,
    ]);
    if (member.length) throw new SocialError(409, 'already_member');
    if (await this.activeExclusion(groupId, invitee)) throw new SocialError(403, 'excluded');
    const pending = await this.db.query("SELECT 1 FROM group_invitations WHERE conversation_id = $1 AND invitee_id = $2 AND status = 'pending'", [
      groupId,
      invitee,
    ]);
    if (pending.length) throw new SocialError(409, 'already_invited');
    const [{ n }] = await this.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM group_invitations WHERE conversation_id = $1 AND status = 'pending'",
      [groupId],
    );
    if ((await this.memberCount(groupId)) + n >= this.maxMembers) throw new SocialError(409, 'group_full');
    this.limit('groupInvite', viewer);
    const id = randomUUID();
    await this.db.query('INSERT INTO group_invitations (id, conversation_id, inviter_id, invitee_id) VALUES ($1, $2, $3, $4)', [
      id,
      groupId,
      viewer,
      invitee,
    ]);
    this.messaging.signal([invitee]);
    return { invitationId: id };
  }

  /** Invitations reçues (dans la messagerie, pas dans la cloche). */
  async invitations(viewer: string): Promise<GroupInvitationView[]> {
    const rows = await this.db.query<Row & { inv_id: string; created_at: Date; group_id: string; name: string; group_avatar: string | null; member_count: number }>(
      `SELECT gi.id AS inv_id, gi.created_at, c.id AS group_id, c.name, ${AVATAR('c')} AS group_avatar,
         (SELECT count(*)::int FROM conversation_members m WHERE m.conversation_id = c.id AND m.left_at IS NULL) AS member_count,
         ${USER_COLUMNS('u', 'p')}
       FROM group_invitations gi JOIN conversations c ON c.id = gi.conversation_id
       JOIN users u ON u.id = gi.inviter_id JOIN profiles p ON p.user_id = u.id
       WHERE gi.invitee_id = $1 AND gi.status = 'pending' AND c.deleted_at IS NULL AND u.status <> 'banned'
         AND NOT ${blockedSql('$1::uuid', 'gi.inviter_id')}
       ORDER BY gi.created_at DESC`,
      [viewer],
    );
    return rows.map((r) => ({
      id: r.inv_id,
      group: { id: r.group_id, name: r.name, avatar: mediaUrl(r.group_avatar), memberCount: r.member_count },
      inviter: userOf(r),
      createdAt: new Date(r.created_at).getTime(),
    }));
  }

  /** Accepter : le joueur rejoint le groupe (message système « a rejoint le groupe »). */
  async accept(viewer: string, invitationId: string): Promise<{ conversationId: string }> {
    const groupId = await this.db.transaction(async (tx) => {
      const [inv] = await tx.query<{ conversation_id: string; inviter_id: string }>(
        `UPDATE group_invitations gi SET status = 'accepted', responded_at = now()
         FROM conversations c
         WHERE gi.id = $1 AND gi.invitee_id = $2 AND gi.status = 'pending' AND c.id = gi.conversation_id AND c.deleted_at IS NULL
         RETURNING gi.conversation_id, gi.inviter_id`,
        [invitationId, viewer],
      );
      if (!inv) throw new SocialError(404, 'not_found');
      if ((await tx.query(`SELECT 1 WHERE ${blockedSql('$1::uuid', '$2::uuid')}`, [viewer, inv.inviter_id])).length) {
        throw new SocialError(404, 'not_found');
      }
      if (await this.activeExclusion(inv.conversation_id, viewer, tx)) throw new SocialError(403, 'excluded');
      if ((await this.memberCount(inv.conversation_id, tx)) >= this.maxMembers) throw new SocialError(409, 'group_full');
      await this.addMember(tx, inv.conversation_id, viewer, 'member');
      await this.system(tx, inv.conversation_id, 'joined', viewer, null);
      return inv.conversation_id;
    });
    await this.messaging.signalMembers(groupId);
    return { conversationId: groupId };
  }

  /** Refuser : personne n'est prévenu. */
  async decline(viewer: string, invitationId: string): Promise<void> {
    const rows = await this.db.query(
      "UPDATE group_invitations SET status = 'declined', responded_at = now() WHERE id = $1 AND invitee_id = $2 AND status = 'pending' RETURNING id",
      [invitationId, viewer],
    );
    if (!rows.length) throw new SocialError(404, 'not_found');
  }

  /** Annuler une invitation en attente (créateur et administrateurs). */
  async cancelInvitation(viewer: string, groupId: string, invitationId: string): Promise<void> {
    if (!groupRights(await this.roleOf(viewer, groupId)).invite) throw new SocialError(403, 'forbidden');
    const rows = await this.db.query(
      "UPDATE group_invitations SET status = 'cancelled', responded_at = now() WHERE id = $1 AND conversation_id = $2 AND status = 'pending' RETURNING invitee_id",
      [invitationId, groupId],
    );
    if (!rows.length) throw new SocialError(404, 'not_found');
  }

  // ---- Rôles, départs, retraits, exclusions --------------------------------------------------

  private async targetRole(groupId: string, target: string, q: Queryable = this.db): Promise<GroupRole> {
    const [m] = await q.query<{ role: GroupRole }>(
      'SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [groupId, target],
    );
    if (!m) throw new SocialError(404, 'not_member');
    return m.role;
  }

  /** Nommer ou retirer un administrateur (créateur seulement). */
  async setRole(viewer: string, groupId: string, target: string, role: 'admin' | 'member'): Promise<void> {
    if (!groupRights(await this.roleOf(viewer, groupId)).manageAdmins) throw new SocialError(403, 'forbidden');
    if (target === viewer) throw new SocialError(400, 'self');
    await this.db.transaction(async (tx) => {
      const current = await this.targetRole(groupId, target, tx);
      if (current === 'creator') throw new SocialError(403, 'forbidden');
      if (current === role) return;
      await tx.query('UPDATE conversation_members SET role = $3 WHERE conversation_id = $1 AND user_id = $2', [groupId, target, role]);
      await this.system(tx, groupId, role === 'admin' ? 'admin_added' : 'admin_removed', viewer, target);
      await this.log(tx, viewer, 'creator', role === 'admin' ? 'admin_added' : 'admin_removed', groupId, { userId: target });
    });
    await this.messaging.signalMembers(groupId);
  }

  /** Transférer le rôle de créateur : le nouveau créateur est choisi, l'ancien devient membre. */
  async transfer(viewer: string, groupId: string, target: string): Promise<void> {
    if (!groupRights(await this.roleOf(viewer, groupId)).transfer) throw new SocialError(403, 'forbidden');
    if (target === viewer) throw new SocialError(400, 'self');
    await this.db.transaction(async (tx) => {
      await this.targetRole(groupId, target, tx);
      await tx.query("UPDATE conversation_members SET role = 'creator' WHERE conversation_id = $1 AND user_id = $2", [groupId, target]);
      await tx.query("UPDATE conversation_members SET role = 'member' WHERE conversation_id = $1 AND user_id = $2", [groupId, viewer]);
      await this.system(tx, groupId, 'creator_transferred', viewer, target);
      await this.log(tx, viewer, 'creator', 'creator_transferred', groupId, { userId: target });
    });
    await this.messaging.signalMembers(groupId);
  }

  /** Quitter le groupe. Le créateur doit d'abord transférer son rôle. */
  async leave(viewer: string, groupId: string): Promise<void> {
    const role = await this.roleOf(viewer, groupId);
    if (role === 'creator') {
      throw new SocialError(409, (await this.memberCount(groupId)) > 1 ? 'transfer_required' : 'last_member');
    }
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE conversation_members SET left_at = now(), pinned_at = NULL WHERE conversation_id = $1 AND user_id = $2', [
        groupId,
        viewer,
      ]);
      await this.system(tx, groupId, 'left', viewer, null);
    });
    await this.messaging.signalMembers(groupId, [viewer]);
  }

  /**
   * Retirer un membre (il pourra être réinvité) ou l'exclure : temporairement (`hours`) ou définitivement (`hours` nul).
   * Un administrateur ne peut retirer que des membres simples ; le créateur peut retirer tout le monde.
   */
  async remove(viewer: string, groupId: string, target: string, exclusion?: { hours: number | null; reason?: unknown }): Promise<void> {
    const role = await this.roleOf(viewer, groupId);
    if (target === viewer) throw new SocialError(400, 'self');
    await this.db.transaction(async (tx) => {
      const targetRole = await this.targetRole(groupId, target, tx);
      if (!groupRights(role).canRemove(targetRole)) throw new SocialError(403, 'forbidden');
      await tx.query('UPDATE conversation_members SET left_at = now(), pinned_at = NULL WHERE conversation_id = $1 AND user_id = $2', [
        groupId,
        target,
      ]);
      if (exclusion) {
        const hours = exclusion.hours;
        if (hours !== null && (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365)) throw new SocialError(400, 'invalid_duration');
        const reason = exclusion.reason ? String(exclusion.reason).trim().slice(0, 200) || null : null;
        await tx.query(
          `INSERT INTO group_exclusions (conversation_id, user_id, until, by_id, reason) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (conversation_id, user_id) DO UPDATE SET until = $3, by_id = $4, reason = $5, created_at = now()`,
          [groupId, target, hours === null ? null : new Date(Date.now() + hours * 3600_000), viewer, reason],
        );
        await tx.query(
          "UPDATE group_invitations SET status = 'cancelled', responded_at = now() WHERE conversation_id = $1 AND invitee_id = $2 AND status = 'pending'",
          [groupId, target],
        );
      }
      await this.system(tx, groupId, exclusion ? 'excluded' : 'removed', viewer, target);
      await this.log(tx, viewer, role, exclusion ? 'member_excluded' : 'member_removed', groupId, {
        userId: target,
        ...(exclusion ? { hours: exclusion.hours } : {}),
      });
    });
    await this.messaging.signalMembers(groupId, [target]);
  }

  /** Lever une exclusion (créateur et administrateurs) : le joueur peut de nouveau être invité. */
  async liftExclusion(viewer: string, groupId: string, target: string): Promise<void> {
    const role = await this.roleOf(viewer, groupId);
    if (!groupRights(role).invite) throw new SocialError(403, 'forbidden');
    await this.db.transaction(async (tx) => {
      // Une exclusion décidée par la modération officielle ne peut pas être levée par le groupe.
      const rows = await tx.query('DELETE FROM group_exclusions WHERE conversation_id = $1 AND user_id = $2 AND NOT official RETURNING user_id', [
        groupId,
        target,
      ]);
      if (!rows.length) throw new SocialError(404, 'not_found');
      await this.log(tx, viewer, role, 'exclusion_lifted', groupId, { userId: target });
    });
  }

  /** Supprimer définitivement le groupe (créateur seulement) : fermé pour tous les membres. */
  async delete(viewer: string, groupId: string): Promise<void> {
    if (!groupRights(await this.roleOf(viewer, groupId)).delete) throw new SocialError(403, 'forbidden');
    const members = (
      await this.db.query<{ user_id: string }>('SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND left_at IS NULL', [groupId])
    ).map((r) => r.user_id);
    await this.db.transaction(async (tx) => {
      // Les messages restent en base (preuves pour la modération) mais ne sont plus accessibles.
      await tx.query('UPDATE conversations SET deleted_at = now() WHERE id = $1', [groupId]);
      await this.log(tx, viewer, 'creator', 'group_deleted', groupId);
      await tx.query(
        "UPDATE group_invitations SET status = 'cancelled', responded_at = now() WHERE conversation_id = $1 AND status = 'pending'",
        [groupId],
      );
    });
    this.messaging.signal(members, groupId);
  }

  // ---- Messages épinglés ---------------------------------------------------------------------

  async setPinned(viewer: string, messageId: string, pinned: boolean): Promise<void> {
    const [msg] = await this.db.query<{ conversation_id: string; kind: string }>(
      'SELECT conversation_id, kind FROM messages WHERE id = $1 AND removed_by_moderation_at IS NULL',
      [messageId],
    );
    if (!msg) throw new SocialError(404, 'not_found');
    const role = await this.roleOf(viewer, msg.conversation_id);
    if (!groupRights(role).pin) throw new SocialError(403, 'forbidden');
    if (pinned) {
      if (msg.kind === 'system') throw new SocialError(400, 'invalid_message');
      const [{ n }] = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM pinned_messages WHERE conversation_id = $1', [
        msg.conversation_id,
      ]);
      if (n >= MAX_PINNED_MESSAGES) throw new SocialError(409, 'too_many_pins');
      await this.db.query(
        'INSERT INTO pinned_messages (conversation_id, message_id, pinned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [msg.conversation_id, messageId, viewer],
      );
    } else {
      await this.db.query('DELETE FROM pinned_messages WHERE conversation_id = $1 AND message_id = $2', [msg.conversation_id, messageId]);
    }
    await this.messaging.signalMembers(msg.conversation_id);
  }
}
