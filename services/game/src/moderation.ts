import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import {
  attachmentLabel,
  levelFromXp,
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  RESTRICTIONS,
  type AppealStatus,
  type AppealSummary,
  type ModerationLogEntry,
  type ReportDetail,
  type ReportReason,
  type ReportStatus,
  type ReportSummary,
  type ReportTargetType,
  type Restriction,
  type SanctionLevel,
  type SanctionView,
  type UserSummary,
} from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import { mediaUrl } from './media';
import { writeLog, type ActorRole } from './moderation-log';
import type { Messaging } from './messaging';
import type { Notifier } from './notifier';
import type { RateLimiter } from './rate-limit';
import { SocialError, type Social } from './social';

const AVATAR = (alias: string) => `(SELECT storage_key FROM media WHERE id = ${alias}.avatar_media_id)`;
const USER_COLS = (u: string, p: string, prefix: string) =>
  `${u}.id AS ${prefix}id, ${p}.pseudo AS ${prefix}pseudo, ${p}.equipped_title AS ${prefix}title, ${u}.xp AS ${prefix}xp, ${AVATAR(p)} AS ${prefix}avatar`;

type Row = Record<string, any>;
function userOf(r: Row, prefix: string): UserSummary | null {
  if (!r[`${prefix}id`]) return null;
  return {
    id: r[`${prefix}id`],
    // Compte supprimé : preuves conservées sans profil.
    pseudo: r[`${prefix}pseudo`] ?? 'Compte supprimé',
    title: r[`${prefix}title`] ?? null,
    level: levelFromXp(Number(r[`${prefix}xp`] ?? 0)).level,
    avatar: mediaUrl(r[`${prefix}avatar`]),
  };
}

/** Empreinte d'un réseau (adresse IP salée et hachée) : jamais stockée en clair. */
export function networkHash(ip: string, salt = process.env.QU1Z_NETWORK_SALT ?? 'qu1z-dev-salt'): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/**
 * Empreinte du réseau d'une requête HTTP ou WebSocket. L'en-tête x-forwarded-for n'est cru que derrière
 * un proxy de confiance (QU1Z_TRUST_PROXY=1).
 */
export function requestNetwork(req: IncomingMessage): string {
  const forwarded = process.env.QU1Z_TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  return networkHash(forwarded || req.socket.remoteAddress || 'unknown');
}

/** Empreinte d'une adresse e-mail (bannissements). */
export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

const CONTEXT_MESSAGES = 10;

interface SanctionRow {
  id: string;
  level: SanctionLevel;
  reason: string;
  restrictions: Restriction[];
  starts_at: Date;
  ends_at: Date | null;
  revoked_at: Date | null;
  created_by: string;
  appeal_id: string | null;
  appeal_status: AppealStatus | null;
  appeal_text: string | null;
  appeal_evidence: string | null;
  decision_text: string | null;
  appeal_created_at: Date | null;
  decided_at: Date | null;
}

const SANCTION_SELECT = `SELECT s.id, s.level, s.reason, s.restrictions, s.starts_at, s.ends_at, s.revoked_at, s.created_by,
    a.id AS appeal_id, a.status AS appeal_status, a.text AS appeal_text, a.evidence AS appeal_evidence,
    a.decision_text, a.created_at AS appeal_created_at, a.decided_at
  FROM sanctions s LEFT JOIN appeals a ON a.sanction_id = s.id`;

function sanctionView(r: SanctionRow): SanctionView {
  const now = Date.now();
  return {
    id: r.id,
    level: r.level,
    reason: r.reason,
    restrictions: r.restrictions ?? [],
    startsAt: new Date(r.starts_at).getTime(),
    endsAt: r.ends_at ? new Date(r.ends_at).getTime() : null,
    active: !r.revoked_at && (!r.ends_at || new Date(r.ends_at).getTime() > now) && r.level !== 'warning',
    revokedAt: r.revoked_at ? new Date(r.revoked_at).getTime() : null,
    appeal: r.appeal_id
      ? {
          id: r.appeal_id,
          status: r.appeal_status!,
          text: r.appeal_text!,
          evidence: r.appeal_evidence,
          decisionText: r.decision_text,
          createdAt: new Date(r.appeal_created_at!).getTime(),
          decidedAt: r.decided_at ? new Date(r.decided_at).getTime() : null,
        }
      : null,
  };
}

/**
 * Modération : signalements (avec contenu et contexte figés), interventions officielles invisibles,
 * sanctions à trois niveaux, appels, journal interne. Toutes les routes de l'équipe exigent le rôle
 * `moderator` ou `admin`, vérifié ici.
 */
export class Moderation {
  constructor(
    private readonly db: Database,
    private readonly limiter: RateLimiter,
    private readonly social: Social,
    private readonly messaging: Messaging,
    private readonly notifier: Notifier,
    /** Coupe les connexions d'un joueur banni. */
    private readonly disconnect: (userId: string) => void,
  ) {}

  // ---- Droits --------------------------------------------------------------------------------

  async staffRole(userId: string, q: Queryable = this.db): Promise<'moderator' | 'admin'> {
    const [u] = await q.query<{ role: string }>("SELECT role FROM users WHERE id = $1 AND status = 'active'", [userId]);
    if (!u || (u.role !== 'moderator' && u.role !== 'admin')) throw new SocialError(403, 'forbidden');
    return u.role;
  }

  private async log(q: Queryable, actorId: string, action: string, targetType: string, targetId: string | null, details?: Record<string, unknown>) {
    const role = (await this.staffRole(actorId, q)) as ActorRole;
    await writeLog(q, { actorId, actorRole: role, action, targetType, targetId, details });
  }

  /** Restrictions en vigueur (suspensions actives non levées). */
  async restrictions(userId: string): Promise<{ restricted: Set<Restriction>; until: number | null }> {
    const rows = await this.db.query<{ restrictions: Restriction[]; ends_at: Date | null }>(
      `SELECT restrictions, ends_at FROM sanctions WHERE user_id = $1 AND level = 'suspension' AND revoked_at IS NULL
         AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`,
      [userId],
    );
    const restricted = new Set(rows.flatMap((r) => r.restrictions));
    const until = rows.reduce<number | null>((m, r) => (r.ends_at ? Math.max(m ?? 0, new Date(r.ends_at).getTime()) : m), null);
    return { restricted, until };
  }

  /** Refuse l'action si une suspension en cours la restreint. */
  async assertAllowed(userId: string, restriction: Restriction): Promise<void> {
    const { restricted } = await this.restrictions(userId);
    if (restricted.has(restriction)) throw new SocialError(403, 'suspended');
  }

  // ---- Signalements (joueurs) ----------------------------------------------------------------

  private async messageContext(conversationId: string, seq: number) {
    const rows = await this.db.query<Row>(
      `SELECT x.id, x.seq, x.kind, x.text, x.created_at, x.sender_id, p.pseudo, x.gif, x.sticker_id, md.storage_key,
              x.removed_by_moderation_at
       FROM messages x LEFT JOIN profiles p ON p.user_id = x.sender_id LEFT JOIN media md ON md.id = x.media_id
       WHERE x.conversation_id = $1 AND x.seq BETWEEN $2 AND $3 ORDER BY x.seq`,
      [conversationId, seq - CONTEXT_MESSAGES, seq + CONTEXT_MESSAGES],
    );
    return rows.map((r) => ({
      id: r.id,
      at: new Date(r.created_at).toISOString(),
      senderId: r.sender_id,
      sender: r.pseudo ?? null,
      kind: r.kind,
      text: r.text,
      media: r.storage_key ? mediaUrl(r.storage_key) : null,
      gif: r.gif ? (typeof r.gif === 'string' ? JSON.parse(r.gif) : r.gif).url : null,
      sticker: r.sticker_id,
      removed: !!r.removed_by_moderation_at,
    }));
  }

  private async conversationInfo(conversationId: string) {
    const [c] = await this.db.query<Row>('SELECT id, kind, name, deleted_at FROM conversations WHERE id = $1', [conversationId]);
    const members = await this.db.query<Row>(
      `SELECT m.user_id, p.pseudo, m.role, m.left_at FROM conversation_members m JOIN profiles p ON p.user_id = m.user_id
       WHERE m.conversation_id = $1 ORDER BY m.joined_at`,
      [conversationId],
    );
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      members: members.map((m) => ({ id: m.user_id, pseudo: m.pseudo, role: m.role, left: !!m.left_at })),
    };
  }

  /** Le signalant doit être membre actif de la conversation (on ne signale que ce qu'on voit). */
  private async assertMember(userId: string, conversationId: string): Promise<string> {
    const [m] = await this.db.query<{ role: string }>(
      `SELECT m.role FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = $1 AND m.user_id = $2 AND m.left_at IS NULL AND c.deleted_at IS NULL`,
      [conversationId, userId],
    );
    if (!m) throw new SocialError(404, 'not_found');
    return m.role;
  }

  /** Construit le contenu figé et le contexte d'un signalement, en vérifiant que le signalant y a accès. */
  private async snapshot(
    reporter: string,
    type: ReportTargetType,
    id: string,
  ): Promise<{ targetUserId: string | null; conversationId: string | null; priority: boolean; snapshot: Record<string, unknown> }> {
    switch (type) {
      case 'message':
      case 'media': {
        const [msg] = await this.db.query<Row>(
          `SELECT x.id, x.seq, x.conversation_id, x.sender_id, x.kind, x.media_id, x.gif, x.sticker_id, c.kind AS conv_kind
           FROM messages x JOIN conversations c ON c.id = x.conversation_id WHERE x.id = $1 AND x.kind <> 'system'`,
          [id],
        );
        if (!msg) throw new SocialError(404, 'not_found');
        const role = await this.assertMember(reporter, msg.conversation_id);
        if (msg.sender_id === reporter) throw new SocialError(400, 'self');
        if (type === 'media' && !(msg.media_id || msg.gif || msg.sticker_id)) throw new SocialError(400, 'invalid_target');
        const context = await this.messageContext(msg.conversation_id, Number(msg.seq));
        return {
          targetUserId: msg.sender_id,
          conversationId: msg.conversation_id,
          priority: msg.conv_kind === 'group' && (role === 'creator' || role === 'admin'),
          snapshot: {
            message: context.find((m) => m.id === id),
            conversation: await this.conversationInfo(msg.conversation_id),
            context,
          },
        };
      }
      case 'group': {
        const role = await this.assertMember(reporter, id);
        const [c] = await this.db.query<Row>("SELECT kind FROM conversations WHERE id = $1", [id]);
        if (c.kind !== 'group') throw new SocialError(400, 'invalid_target');
        const [last] = await this.db.query<{ seq: string }>('SELECT max(seq) AS seq FROM messages WHERE conversation_id = $1', [id]);
        const recent = await this.db.query<Row>(
          `SELECT x.id, x.kind, x.text, x.created_at, p.pseudo FROM messages x LEFT JOIN profiles p ON p.user_id = x.sender_id
           WHERE x.conversation_id = $1 ORDER BY x.seq DESC LIMIT 30`,
          [id],
        );
        return {
          targetUserId: null,
          conversationId: id,
          priority: role === 'creator' || role === 'admin',
          snapshot: {
            conversation: await this.conversationInfo(id),
            lastSeq: Number(last?.seq ?? 0),
            recent: recent.reverse().map((r) => ({ id: r.id, at: new Date(r.created_at).toISOString(), sender: r.pseudo, kind: r.kind, text: r.text })),
          },
        };
      }
      case 'user': {
        if (id === reporter) throw new SocialError(400, 'self');
        const [u] = await this.db.query<Row>(
          `SELECT p.pseudo, p.bio, p.equipped_title, ${AVATAR('p')} AS avatar, u.created_at
           FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
          [id],
        );
        if (!u) throw new SocialError(404, 'not_found');
        const posts = await this.db.query<Row>('SELECT id, text, created_at FROM posts WHERE author_id = $1 ORDER BY created_at DESC LIMIT 5', [id]);
        // Conversation privée entre les deux, s'il y en a une : derniers messages comme contexte.
        const [direct] = await this.db.query<{ id: string }>(
          "SELECT id FROM conversations WHERE direct_key = $1 AND kind = 'direct' ORDER BY created_at DESC LIMIT 1",
          [[reporter, id].sort().join(':')],
        );
        const [last] = direct
          ? await this.db.query<{ seq: string }>('SELECT max(seq) AS seq FROM messages WHERE conversation_id = $1', [direct.id])
          : [];
        return {
          targetUserId: id,
          conversationId: direct?.id ?? null,
          priority: false,
          snapshot: {
            profile: { pseudo: u.pseudo, bio: u.bio, title: u.equipped_title, avatar: mediaUrl(u.avatar), createdAt: new Date(u.created_at).toISOString() },
            recentPosts: posts.map((p) => ({ id: p.id, text: p.text, at: new Date(p.created_at).toISOString() })),
            directMessages: direct && last?.seq ? await this.messageContext(direct.id, Number(last.seq) - CONTEXT_MESSAGES) : [],
          },
        };
      }
      case 'post': {
        const post = await this.social.post(reporter, id); // 404 si le signalant ne peut pas la voir
        if (post.author.id === reporter) throw new SocialError(400, 'self');
        return { targetUserId: post.author.id, conversationId: null, priority: false, snapshot: { post } };
      }
      case 'comment': {
        const [c] = await this.db.query<Row>(
          `SELECT c.id, c.post_id, c.author_id, c.text, c.created_at, p.pseudo FROM comments c JOIN profiles p ON p.user_id = c.author_id
           WHERE c.id = $1 AND c.removed_at IS NULL`,
          [id],
        );
        if (!c) throw new SocialError(404, 'not_found');
        const post = await this.social.post(reporter, c.post_id);
        if (c.author_id === reporter) throw new SocialError(400, 'self');
        return {
          targetUserId: c.author_id,
          conversationId: null,
          priority: false,
          snapshot: { comment: { id: c.id, author: c.pseudo, text: c.text, at: new Date(c.created_at).toISOString() }, post },
        };
      }
    }
  }

  async report(reporter: string, input: { targetType: unknown; targetId: string; reason: unknown; details?: unknown }): Promise<{ id: string }> {
    const type = String(input.targetType) as ReportTargetType;
    if (!['message', 'media', 'user', 'group', 'post', 'comment'].includes(type)) throw new SocialError(400, 'invalid_target');
    const reason = String(input.reason) as ReportReason;
    if (!REPORT_REASONS.some((r) => r.id === reason)) throw new SocialError(400, 'invalid_reason');
    const details = input.details ? String(input.details).trim().slice(0, MAX_REPORT_DETAILS) || null : null;
    const snap = await this.snapshot(reporter, type, input.targetId);
    // Un seul signalement ouvert par joueur et par contenu.
    const dup = await this.db.query("SELECT 1 FROM reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status <> 'closed'", [
      reporter,
      type,
      input.targetId,
    ]);
    if (dup.length) throw new SocialError(409, 'already_reported');
    if (!this.limiter.allow('report', reporter)) throw new SocialError(429, 'rate_limited');
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, target_user_id, conversation_id, reason, details, context_snapshot, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, reporter, type, input.targetId, snap.targetUserId, snap.conversationId, reason, details, JSON.stringify(snap.snapshot), snap.priority],
    );
    return { id };
  }

  // ---- Sanctions et appels (joueur concerné) -------------------------------------------------

  async mySanctions(userId: string): Promise<SanctionView[]> {
    const rows = await this.db.query<SanctionRow>(`${SANCTION_SELECT} WHERE s.user_id = $1 ORDER BY s.created_at DESC`, [userId]);
    return rows.map(sanctionView);
  }

  /** Contester une sanction (avertissement, suspension ou bannissement) : un appel par sanction. */
  async appeal(userId: string, sanctionId: string, rawText: unknown, rawEvidence?: unknown): Promise<{ id: string }> {
    const [s] = await this.db.query<{ id: string }>('SELECT id FROM sanctions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [
      sanctionId,
      userId,
    ]);
    if (!s) throw new SocialError(404, 'not_found');
    const text = String(rawText ?? '').trim();
    if (text.length < 10 || text.length > 2000) throw new SocialError(400, 'invalid_text');
    const evidence = rawEvidence ? String(rawEvidence).trim().slice(0, 2000) || null : null;
    if ((await this.db.query('SELECT 1 FROM appeals WHERE sanction_id = $1', [sanctionId])).length) throw new SocialError(409, 'already_appealed');
    const id = randomUUID();
    await this.db.query('INSERT INTO appeals (id, sanction_id, user_id, text, evidence) VALUES ($1, $2, $3, $4, $5)', [
      id,
      sanctionId,
      userId,
      text,
      evidence,
    ]);
    return { id };
  }

  // ---- Panneau de modération : signalements --------------------------------------------------

  private reportSelect(where: string) {
    return `SELECT r.*, ${USER_COLS('ur', 'pr', 'r_')}, ${USER_COLS('ut', 'pt', 't_')}, ${USER_COLS('uh', 'ph', 'h_')}
      FROM reports r
      JOIN users ur ON ur.id = r.reporter_id LEFT JOIN profiles pr ON pr.user_id = ur.id
      LEFT JOIN users ut ON ut.id = r.target_user_id LEFT JOIN profiles pt ON pt.user_id = ut.id
      LEFT JOIN users uh ON uh.id = r.handled_by LEFT JOIN profiles ph ON ph.user_id = uh.id
      WHERE ${where}`;
  }

  private static preview(r: Row): string {
    const s = typeof r.context_snapshot === 'string' ? JSON.parse(r.context_snapshot) : r.context_snapshot;
    if (s.message) return s.message.text ?? attachmentLabel(s.message.kind) ?? '';
    if (s.comment) return s.comment.text;
    if (s.post) return s.post.text || 'Photo';
    if (s.profile) return `Profil de ${s.profile.pseudo}`;
    if (s.conversation) return `Groupe « ${s.conversation.name} »`;
    return '';
  }

  private static summary(r: Row): ReportSummary {
    return {
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      status: r.status,
      priority: r.priority,
      createdAt: new Date(r.created_at).getTime(),
      reporter: userOf(r, 'r_')!,
      targetUser: userOf(r, 't_'),
      preview: Moderation.preview(r),
    };
  }

  async listReports(mod: string, status: ReportStatus | 'all' = 'open'): Promise<ReportSummary[]> {
    await this.staffRole(mod);
    const rows = await this.db.query<Row>(
      `${this.reportSelect(status === 'all' ? 'true' : 'r.status = $1')} ORDER BY r.priority DESC, r.created_at ASC LIMIT 200`,
      status === 'all' ? [] : [status],
    );
    return rows.map(Moderation.summary);
  }

  async reportDetail(mod: string, id: string): Promise<ReportDetail> {
    await this.staffRole(mod);
    const [r] = await this.db.query<Row>(this.reportSelect('r.id = $1'), [id]);
    if (!r) throw new SocialError(404, 'not_found');
    const targetSanctions = r.target_user_id
      ? (await this.db.query<SanctionRow>(`${SANCTION_SELECT} WHERE s.user_id = $1 ORDER BY s.created_at DESC`, [r.target_user_id])).map((s) => ({
          ...sanctionView(s),
          createdBy: s.created_by,
        }))
      : [];
    const [{ n: targetReportCount }] = r.target_user_id
      ? await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM reports WHERE target_user_id = $1', [r.target_user_id])
      : [{ n: 0 }];
    const [{ n: reporterReportCount }] = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1', [
      r.reporter_id,
    ]);
    const linked = r.target_user_id
      ? await this.db.query<Row>(
          `SELECT ${USER_COLS('o', 'po', 'l_')}, o.status FROM users t JOIN users o ON o.last_network_hash = t.last_network_hash AND o.id <> t.id
           JOIN profiles po ON po.user_id = o.id WHERE t.id = $1 AND t.last_network_hash IS NOT NULL ORDER BY o.created_at DESC LIMIT 10`,
          [r.target_user_id],
        )
      : [];
    return {
      ...Moderation.summary(r),
      details: r.details,
      conversationId: r.conversation_id,
      snapshot: typeof r.context_snapshot === 'string' ? JSON.parse(r.context_snapshot) : r.context_snapshot,
      resolution: r.resolution,
      handledBy: userOf(r, 'h_'),
      targetSanctions,
      targetReportCount,
      reporterReportCount,
      linkedAccounts: linked.map((l) => ({ user: userOf(l, 'l_')!, status: l.status })),
    };
  }

  /** Prendre en charge ou clore un signalement. À la clôture, le signalant est informé (sans détail). */
  async setReportStatus(mod: string, id: string, status: ReportStatus, rawResolution?: unknown): Promise<void> {
    if (!['open', 'in_review', 'closed'].includes(status)) throw new SocialError(400, 'invalid_status');
    const resolution = rawResolution ? String(rawResolution).trim().slice(0, 500) || null : null;
    const reporter = await this.db.transaction(async (tx) => {
      const [r] = await tx.query<{ reporter_id: string; status: string }>('SELECT reporter_id, status FROM reports WHERE id = $1', [id]);
      if (!r) throw new SocialError(404, 'not_found');
      await tx.query('UPDATE reports SET status = $2, resolution = coalesce($3, resolution), handled_by = $4, updated_at = now() WHERE id = $1', [
        id,
        status,
        resolution,
        mod,
      ]);
      await this.log(tx, mod, `report_${status}`, 'report', id, resolution ? { resolution } : {});
      return r.status !== 'closed' && status === 'closed' ? r.reporter_id : null;
    });
    if (reporter) {
      await this.notifier.notify(reporter, { type: 'report_closed', category: 'system', data: { reportId: id } }).catch(() => {});
    }
  }

  // ---- Interventions officielles (invisibles des membres) ------------------------------------

  /** Retirer un contenu : message, photo / GIF / sticker, publication, commentaire. Aucune trace visible côté joueurs. */
  async removeContent(mod: string, type: 'message' | 'post' | 'comment', id: string, reportId?: string): Promise<void> {
    await this.staffRole(mod);
    const conversationId = await this.db.transaction(async (tx) => {
      let conv: string | null = null;
      if (type === 'message') {
        const [m] = await tx.query<{ conversation_id: string; media_id: string | null }>(
          'UPDATE messages SET removed_by_moderation_at = now() WHERE id = $1 RETURNING conversation_id, media_id',
          [id],
        );
        if (!m) throw new SocialError(404, 'not_found');
        // Le fichier reste stocké (preuve) mais n'est plus servi dans l'application.
        if (m.media_id) await tx.query('UPDATE media SET removed_by_moderation_at = now() WHERE id = $1', [m.media_id]);
        await tx.query('DELETE FROM pinned_messages WHERE message_id = $1', [id]);
        conv = m.conversation_id;
      } else {
        const table = type === 'post' ? 'posts' : 'comments';
        const rows = await tx.query(`UPDATE ${table} SET removed_at = now() WHERE id = $1 RETURNING id`, [id]);
        if (!rows.length) throw new SocialError(404, 'not_found');
      }
      await this.log(tx, mod, 'remove_content', type, id, reportId ? { reportId } : {});
      return conv;
    });
    if (conversationId) await this.messaging.signalMembers(conversationId);
  }

  /** Exclure un membre d'un groupe sans en être membre : aucun message système, impossible à lever par les administrateurs. */
  async groupExclude(mod: string, groupId: string, userId: string, hours: number | null, reportId?: string): Promise<void> {
    await this.staffRole(mod);
    if (hours !== null && (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365)) throw new SocialError(400, 'invalid_duration');
    await this.db.transaction(async (tx) => {
      const [c] = await tx.query("SELECT 1 FROM conversations WHERE id = $1 AND kind = 'group'", [groupId]);
      if (!c) throw new SocialError(404, 'not_found');
      await tx.query('UPDATE conversation_members SET left_at = now(), pinned_at = NULL WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL', [
        groupId,
        userId,
      ]);
      // Si le joueur exclu était créateur, le rôle passe au plus ancien administrateur, sinon au plus ancien membre.
      const [creator] = await tx.query("SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND role = 'creator' AND left_at IS NULL", [groupId]);
      if (!creator) {
        await tx.query(
          `UPDATE conversation_members SET role = 'creator' WHERE conversation_id = $1 AND user_id = (
             SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND left_at IS NULL
             ORDER BY (role = 'admin') DESC, joined_at LIMIT 1)`,
          [groupId],
        );
      }
      await tx.query(
        `INSERT INTO group_exclusions (conversation_id, user_id, until, by_id, official) VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET until = $3, by_id = $4, official = true, created_at = now()`,
        [groupId, userId, hours === null ? null : new Date(Date.now() + hours * 3600_000), mod],
      );
      await tx.query(
        "UPDATE group_invitations SET status = 'cancelled', responded_at = now() WHERE conversation_id = $1 AND invitee_id = $2 AND status = 'pending'",
        [groupId, userId],
      );
      await this.log(tx, mod, 'group_exclude', 'group', groupId, { userId, hours, ...(reportId ? { reportId } : {}) });
    });
    await this.messaging.signalMembers(groupId, [userId]);
  }

  /** Fermer un groupe en cas d'abus (messages conservés). */
  async closeGroup(mod: string, groupId: string, reportId?: string): Promise<void> {
    await this.staffRole(mod);
    const members = (
      await this.db.query<{ user_id: string }>('SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND left_at IS NULL', [groupId])
    ).map((r) => r.user_id);
    await this.db.transaction(async (tx) => {
      const rows = await tx.query("UPDATE conversations SET deleted_at = now() WHERE id = $1 AND kind = 'group' AND deleted_at IS NULL RETURNING id", [
        groupId,
      ]);
      if (!rows.length) throw new SocialError(404, 'not_found');
      await this.log(tx, mod, 'group_close', 'group', groupId, reportId ? { reportId } : {});
    });
    this.messaging.signal(members, groupId);
  }

  /** Vue d'un groupe pour l'équipe (sans en être membre) : membres et derniers messages, retirés compris. */
  async groupView(mod: string, groupId: string) {
    await this.staffRole(mod);
    const [c] = await this.db.query<Row>("SELECT id, name, deleted_at FROM conversations WHERE id = $1 AND kind = 'group'", [groupId]);
    if (!c) throw new SocialError(404, 'not_found');
    const [last] = await this.db.query<{ seq: string }>('SELECT max(seq) AS seq FROM messages WHERE conversation_id = $1', [groupId]);
    return {
      ...(await this.conversationInfo(groupId)),
      closed: !!c.deleted_at,
      messages: last?.seq ? await this.messageContext(groupId, Number(last.seq) - CONTEXT_MESSAGES) : [],
    };
  }

  // ---- Sanctions -----------------------------------------------------------------------------

  async sanction(
    mod: string,
    input: { userId: string; level: unknown; reason: unknown; hours?: unknown; restrictions?: unknown; reportId?: string },
  ): Promise<{ id: string }> {
    await this.staffRole(mod);
    const level = String(input.level) as SanctionLevel;
    if (!['warning', 'suspension', 'ban'].includes(level)) throw new SocialError(400, 'invalid_level');
    const reason = String(input.reason ?? '').trim();
    if (!reason || reason.length > 500) throw new SocialError(400, 'invalid_text');
    if (input.userId === mod) throw new SocialError(400, 'self');
    const [target] = await this.db.query<{ role: string; email: string | null }>('SELECT role, email FROM users WHERE id = $1', [input.userId]);
    if (!target) throw new SocialError(404, 'not_found');
    // Un modérateur ne sanctionne pas un membre de l'équipe ; seul un administrateur le peut.
    if (target.role !== 'player' && (await this.staffRole(mod)) !== 'admin') throw new SocialError(403, 'forbidden');
    let endsAt: Date | null = null;
    let restrictions: Restriction[] = [];
    if (level === 'suspension') {
      const hours = Number(input.hours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365) throw new SocialError(400, 'invalid_duration');
      endsAt = new Date(Date.now() + hours * 3600_000);
      const asked = Array.isArray(input.restrictions) ? input.restrictions.map(String) : RESTRICTIONS.map((r) => r.id);
      restrictions = RESTRICTIONS.map((r) => r.id).filter((r) => asked.includes(r));
      if (!restrictions.length) throw new SocialError(400, 'invalid_restrictions');
    }
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO sanctions (id, user_id, level, reason, restrictions, ends_at, report_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, input.userId, level, reason, restrictions, endsAt, input.reportId ?? null, mod],
      );
      if (level === 'ban') {
        await tx.query("UPDATE users SET status = 'banned' WHERE id = $1", [input.userId]);
        if (target.email) await tx.query('INSERT INTO banned_emails (email_hash, sanction_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [emailHash(target.email), id]);
      }
      await this.log(tx, mod, `sanction_${level}`, 'user', input.userId, { sanctionId: id, reason, hours: input.hours ?? null, restrictions, reportId: input.reportId ?? null });
    });
    if (level === 'ban') this.disconnect(input.userId);
    else await this.notifier.notify(input.userId, { type: 'sanction', category: 'system', data: { sanctionId: id, level } }).catch(() => {});
    return { id };
  }

  /** Lever une sanction : un bannissement levé réactive le compte et débloque l'adresse e-mail. */
  async revokeSanction(mod: string, sanctionId: string, rawReason: unknown, q?: Queryable): Promise<void> {
    const run = async (tx: Queryable) => {
      const [s] = await tx.query<{ user_id: string; level: SanctionLevel }>(
        'UPDATE sanctions SET revoked_at = now(), revoked_by = $2, revoke_reason = $3 WHERE id = $1 AND revoked_at IS NULL RETURNING user_id, level',
        [sanctionId, mod, String(rawReason ?? '').slice(0, 500) || null],
      );
      if (!s) throw new SocialError(404, 'not_found');
      if (s.level === 'ban') {
        const [other] = await tx.query("SELECT 1 FROM sanctions WHERE user_id = $1 AND level = 'ban' AND revoked_at IS NULL", [s.user_id]);
        if (!other) await tx.query("UPDATE users SET status = 'active' WHERE id = $1 AND status = 'banned'", [s.user_id]);
        await tx.query('DELETE FROM banned_emails WHERE sanction_id = $1', [sanctionId]);
      }
      await this.log(tx, mod, 'sanction_revoked', 'sanction', sanctionId, { userId: s.user_id });
    };
    if (q) {
      await this.staffRole(mod, q);
      await run(q);
      return;
    }
    await this.staffRole(mod);
    await this.db.transaction(run);
  }

  // ---- Appels (équipe) -----------------------------------------------------------------------

  async listAppeals(mod: string, status: AppealStatus | 'open' = 'open'): Promise<AppealSummary[]> {
    await this.staffRole(mod);
    const rows = await this.db.query<Row>(
      `SELECT a.id AS a_id, a.status AS a_status, a.created_at AS a_created, a.text AS a_text, a.evidence AS a_evidence, a.decision_text AS a_decision,
              ${USER_COLS('u', 'p', 'u_')}, s.id, s.level, s.reason, s.restrictions, s.starts_at, s.ends_at, s.revoked_at, s.created_by,
              a.id AS appeal_id, a.status AS appeal_status, a.text AS appeal_text, a.evidence AS appeal_evidence,
              a.decision_text, a.created_at AS appeal_created_at, a.decided_at
       FROM appeals a JOIN sanctions s ON s.id = a.sanction_id JOIN users u ON u.id = a.user_id JOIN profiles p ON p.user_id = u.id
       WHERE ${status === 'open' ? "a.status IN ('pending', 'in_review')" : 'a.status = $1'}
       ORDER BY a.created_at ASC LIMIT 200`,
      status === 'open' ? [] : [status],
    );
    return rows.map((r) => ({
      id: r.a_id,
      status: r.a_status,
      createdAt: new Date(r.a_created).getTime(),
      user: userOf(r, 'u_')!,
      sanction: sanctionView(r as SanctionRow),
      text: r.a_text,
      evidence: r.a_evidence,
      decisionText: r.a_decision,
    }));
  }

  /** Examiner, accepter (la sanction est levée) ou refuser un appel ; la décision finale est communiquée au joueur. */
  async decideAppeal(mod: string, appealId: string, status: AppealStatus, rawText?: unknown): Promise<void> {
    await this.staffRole(mod);
    if (!['in_review', 'accepted', 'rejected'].includes(status)) throw new SocialError(400, 'invalid_status');
    const text = rawText ? String(rawText).trim().slice(0, 1000) : '';
    const final = status === 'accepted' || status === 'rejected';
    if (final && !text) throw new SocialError(400, 'decision_required');
    const userId = await this.db.transaction(async (tx) => {
      const [a] = await tx.query<{ user_id: string; sanction_id: string; status: AppealStatus }>(
        'SELECT user_id, sanction_id, status FROM appeals WHERE id = $1',
        [appealId],
      );
      if (!a) throw new SocialError(404, 'not_found');
      if (a.status === 'accepted' || a.status === 'rejected') throw new SocialError(409, 'already_decided');
      await tx.query(
        `UPDATE appeals SET status = $2, decision_text = CASE WHEN $3::text = '' THEN decision_text ELSE $3::text END,
           decided_by = $4, decided_at = CASE WHEN $5 THEN now() ELSE decided_at END WHERE id = $1`,
        [appealId, status, text, mod, final],
      );
      if (status === 'accepted') await this.revokeSanction(mod, a.sanction_id, `Appel accepté : ${text}`, tx);
      await this.log(tx, mod, `appeal_${status}`, 'appeal', appealId, { sanctionId: a.sanction_id });
      return a.user_id;
    });
    if (final) {
      await this.notifier.notify(userId, { type: 'appeal_decision', category: 'system', data: { appealId, status } }).catch(() => {});
    }
  }

  // ---- Journal et rôles ----------------------------------------------------------------------

  async journal(mod: string, targetId?: string): Promise<ModerationLogEntry[]> {
    await this.staffRole(mod);
    const rows = await this.db.query<Row>(
      `SELECT l.*, ${USER_COLS('u', 'p', 'a_')} FROM moderation_log l
       LEFT JOIN users u ON u.id = l.actor_id LEFT JOIN profiles p ON p.user_id = u.id
       WHERE ($1::uuid IS NULL OR l.target_id = $1 OR l.details->>'userId' = $1::text)
       ORDER BY l.created_at DESC LIMIT 200`,
      [targetId ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      actor: userOf(r, 'a_'),
      actorRole: r.actor_role,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      createdAt: new Date(r.created_at).getTime(),
    }));
  }

  /** Nommer ou retirer un modérateur (administrateurs seulement). */
  async setStaffRole(admin: string, userId: string, role: unknown): Promise<void> {
    if ((await this.staffRole(admin)) !== 'admin') throw new SocialError(403, 'forbidden');
    if (role !== 'player' && role !== 'moderator') throw new SocialError(400, 'invalid_role');
    await this.db.transaction(async (tx) => {
      const rows = await tx.query("UPDATE users SET role = $2 WHERE id = $1 AND role <> 'admin' RETURNING id", [userId, role]);
      if (!rows.length) throw new SocialError(404, 'not_found');
      await this.log(tx, admin, `role_${role}`, 'user', userId);
    });
  }
}
