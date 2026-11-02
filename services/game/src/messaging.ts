import { randomUUID } from 'node:crypto';

import {
  isSticker,
  MAX_FIRST_MESSAGE_LENGTH,
  MAX_MESSAGE_LENGTH,
  levelFromXp,
  type Attachment,
  type ConversationDetail,
  type ConversationSummary,
  type MessageRequestView,
  type MessageView,
  type Presence,
  type ServerMessage,
  type UserSummary,
} from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import { validateGif, type GifProvider } from './gifs';
import { mediaView, type Media } from './media';
import type { RateLimiter } from './rate-limit';
import { SocialError } from './social';
import { mediaUrl } from './media';

/** Au plus 3 demandes vers la même personne sur 30 jours (anti-spam). */
const MAX_REQUESTS_PER_TARGET = 3;
const PAGE = 50;

const blockedSql = (a: string, b: string) =>
  `EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ${a} AND bl.blocked_id = ${b}) OR (bl.blocker_id = ${b} AND bl.blocked_id = ${a}))`;

function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

interface SummaryRow {
  id: string;
  pseudo: string;
  equipped_title: string | null;
  xp: number;
  avatar_key: string | null;
}

export interface MessageContent {
  text?: unknown;
  mediaId?: string;
  gif?: unknown;
  stickerId?: unknown;
  replyToId?: string;
}

function attachmentOf(r: {
  kind: MessageView['kind'];
  gif: { id: string; url: string; width: number; height: number } | string | null;
  sticker_id: string | null;
  media_id: string | null;
  storage_key: string | null;
  width: number | null;
  height: number | null;
  animated: boolean | null;
}): Attachment | null {
  if (r.kind === 'image' && r.media_id && r.storage_key) {
    return { kind: 'image', media: mediaView({ id: r.media_id, storage_key: r.storage_key, width: r.width!, height: r.height!, animated: !!r.animated }) };
  }
  if (r.kind === 'gif' && r.gif) return { kind: 'gif', gif: typeof r.gif === 'string' ? JSON.parse(r.gif) : r.gif };
  if (r.kind === 'sticker' && isSticker(r.sticker_id)) return { kind: 'sticker', stickerId: r.sticker_id };
  return null;
}

const summary = (r: SummaryRow): UserSummary => ({
  id: r.id,
  pseudo: r.pseudo,
  title: r.equipped_title,
  level: levelFromXp(r.xp).level,
  avatar: mediaUrl(r.avatar_key),
});

/**
 * Messagerie privée : demandes de message, conversations, messages texte, réponses, réactions,
 * statuts Envoyé / Lu, non-lus par conversation, épinglage, suppression de sa boîte, présence.
 * Séparée du centre de notifications. Un message n'est jamais modifié ni supprimé par son auteur.
 */
export class Messaging {
  constructor(
    private readonly db: Database,
    private readonly limiter: RateLimiter,
    private readonly isOnline: (userId: string) => boolean,
    private readonly send: (userId: string, message: ServerMessage) => void,
    private readonly media: Media,
    private readonly gifs: GifProvider | null,
  ) {}

  private limit(action: string, userId: string): void {
    if (!this.limiter.allow(action, userId)) throw new SocialError(429, 'rate_limited');
  }

  private async blocked(a: string, b: string, q: Queryable = this.db): Promise<boolean> {
    return (await q.query(`SELECT 1 WHERE ${blockedSql('$1::uuid', '$2::uuid')}`, [a, b])).length > 0;
  }

  private async user(id: string): Promise<UserSummary | null> {
    const [r] = await this.db.query<SummaryRow>(
      `SELECT u.id, p.pseudo, p.equipped_title, u.xp, (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.status <> 'banned'`,
      [id],
    );
    return r ? summary(r) : null;
  }

  private signal(userIds: string[], conversationId?: string): void {
    for (const id of userIds) this.send(id, { type: 'messages', ...(conversationId ? { conversationId } : {}) });
  }

  /** Conversation privée active entre deux joueurs, s'il y en a une. */
  private async activeDirect(a: string, b: string, q: Queryable = this.db): Promise<string | null> {
    const [row] = await q.query<{ id: string }>('SELECT id FROM conversations WHERE direct_key = $1 AND deleted_at IS NULL', [directKey(a, b)]);
    return row?.id ?? null;
  }

  // ---- Demandes de message -----------------------------------------------------------------

  /** Envoyer une demande (avec un premier message facultatif). La conversation ne s'ouvre qu'après acceptation. */
  async request(from: string, to: string, rawText?: unknown): Promise<{ status: 'requested' | 'exists'; conversationId?: string }> {
    if (from === to) throw new SocialError(400, 'self');
    if (!(await this.user(to))) throw new SocialError(404, 'not_found');
    if (await this.blocked(from, to)) throw new SocialError(403, 'blocked');
    const existing = await this.activeDirect(from, to);
    if (existing) return { status: 'exists', conversationId: existing };
    const text = rawText === undefined || rawText === null ? null : String(rawText).trim() || null;
    if (text && text.length > MAX_FIRST_MESSAGE_LENGTH) throw new SocialError(400, 'invalid_text');
    // Une seule demande en attente par paire, dans un sens ou dans l'autre.
    const pending = await this.db.query<{ id: string; from_id: string }>(
      `SELECT id, from_id FROM message_requests WHERE status = 'pending'
         AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
      [from, to],
    );
    if (pending.some((p) => p.from_id === from)) throw new SocialError(409, 'already_requested');
    if (pending.length) throw new SocialError(409, 'request_waiting_for_you');
    const [{ n }] = await this.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM message_requests WHERE from_id = $1 AND to_id = $2 AND created_at > now() - interval '30 days'",
      [from, to],
    );
    if (n >= MAX_REQUESTS_PER_TARGET) throw new SocialError(429, 'too_many_requests');
    this.limit('messageRequest', from);
    await this.db.query('INSERT INTO message_requests (id, from_id, to_id, first_message) VALUES ($1, $2, $3, $4)', [randomUUID(), from, to, text]);
    this.signal([to]);
    return { status: 'requested' };
  }

  async requests(viewer: string): Promise<MessageRequestView[]> {
    const rows = await this.db.query<{
      id: string;
      first_message: string | null;
      created_at: Date;
      from_id: string;
      to_id: string;
      from_pseudo: string;
      from_title: string | null;
      from_xp: number;
      to_pseudo: string;
      to_title: string | null;
      to_xp: number;
      from_avatar: string | null;
      to_avatar: string | null;
    }>(
      `SELECT r.id, r.first_message, r.created_at, r.from_id, r.to_id,
              pf.pseudo AS from_pseudo, pf.equipped_title AS from_title, uf.xp AS from_xp, (SELECT storage_key FROM media WHERE id = pf.avatar_media_id AND removed_by_moderation_at IS NULL) AS from_avatar,
              pt.pseudo AS to_pseudo, pt.equipped_title AS to_title, ut.xp AS to_xp, (SELECT storage_key FROM media WHERE id = pt.avatar_media_id AND removed_by_moderation_at IS NULL) AS to_avatar
       FROM message_requests r
       JOIN users uf ON uf.id = r.from_id JOIN profiles pf ON pf.user_id = r.from_id
       JOIN users ut ON ut.id = r.to_id JOIN profiles pt ON pt.user_id = r.to_id
       WHERE r.status = 'pending' AND (r.from_id = $1 OR r.to_id = $1)
         AND uf.status <> 'banned' AND ut.status <> 'banned' AND NOT ${blockedSql('r.from_id', 'r.to_id')}
       ORDER BY r.created_at DESC`,
      [viewer],
    );
    return rows.map((r) => ({
      id: r.id,
      from: summary({ id: r.from_id, pseudo: r.from_pseudo, equipped_title: r.from_title, xp: r.from_xp, avatar_key: r.from_avatar }),
      to: summary({ id: r.to_id, pseudo: r.to_pseudo, equipped_title: r.to_title, xp: r.to_xp, avatar_key: r.to_avatar }),
      firstMessage: r.first_message,
      createdAt: new Date(r.created_at).getTime(),
      incoming: r.to_id === viewer,
    }));
  }

  /** Accepter : la conversation s'ouvre, avec le premier message s'il y en avait un. */
  async acceptRequest(viewer: string, id: string): Promise<{ conversationId: string }> {
    const result = await this.db.transaction(async (tx) => {
      const [r] = await tx.query<{ from_id: string; to_id: string; first_message: string | null }>(
        "UPDATE message_requests SET status = 'accepted', responded_at = now() WHERE id = $1 AND to_id = $2 AND status = 'pending' RETURNING from_id, to_id, first_message",
        [id, viewer],
      );
      if (!r) throw new SocialError(404, 'not_found');
      if (await this.blocked(r.from_id, r.to_id, tx)) throw new SocialError(403, 'blocked');
      let conversationId = await this.activeDirect(r.from_id, r.to_id, tx);
      if (!conversationId) {
        conversationId = randomUUID();
        await tx.query("INSERT INTO conversations (id, kind, direct_key, created_by) VALUES ($1, 'direct', $2, $3)", [
          conversationId,
          directKey(r.from_id, r.to_id),
          r.from_id,
        ]);
        for (const u of [r.from_id, r.to_id]) {
          await tx.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)', [conversationId, u]);
        }
      }
      await tx.query('UPDATE message_requests SET conversation_id = $2 WHERE id = $1', [id, conversationId]);
      if (r.first_message) {
        await tx.query("INSERT INTO messages (id, conversation_id, sender_id, kind, text) VALUES ($1, $2, $3, 'text', $4)", [
          randomUUID(),
          conversationId,
          r.from_id,
          r.first_message,
        ]);
        await tx.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
      }
      return { conversationId, from: r.from_id };
    });
    this.signal([viewer, result.from], result.conversationId);
    return { conversationId: result.conversationId };
  }

  /** Refuser : aucune notification à l'expéditeur. */
  async declineRequest(viewer: string, id: string): Promise<void> {
    const rows = await this.db.query(
      "UPDATE message_requests SET status = 'declined', responded_at = now() WHERE id = $1 AND to_id = $2 AND status = 'pending' RETURNING id",
      [id, viewer],
    );
    if (!rows.length) throw new SocialError(404, 'not_found');
  }

  // ---- Conversations -----------------------------------------------------------------------

  private async presenceOf(viewer: string, other: string): Promise<Presence | null> {
    // Présence visible seulement si chacun suit l'autre, et jamais en cas de blocage.
    const [row] = await this.db.query<{ last_seen_at: Date | null }>(
      `SELECT u.last_seen_at FROM users u WHERE u.id = $2
         AND EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2)
         AND EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1)
         AND NOT ${blockedSql('$1::uuid', '$2::uuid')}`,
      [viewer, other],
    );
    if (!row) return null;
    return { online: this.isOnline(other), lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : null };
  }

  /** Boîte de réception : épinglées d'abord, puis par dernier message ; non-lus par conversation. */
  async inbox(viewer: string): Promise<ConversationSummary[]> {
    const rows = await this.db.query<{
      id: string;
      kind: 'direct' | 'group';
      pinned_at: Date | null;
      last_message_at: Date;
      unread: number;
      other_id: string | null;
      last_text: string | null;
      last_kind: string | null;
      last_sender: string | null;
      last_at: Date | null;
    }>(
      `SELECT c.id, c.kind, m.pinned_at, c.last_message_at,
         (SELECT count(*)::int FROM messages x WHERE x.conversation_id = c.id AND x.seq > m.last_read_seq
            AND x.sender_id IS DISTINCT FROM $1 AND x.removed_by_moderation_at IS NULL
            AND (m.hidden_at IS NULL OR x.created_at > m.hidden_at)) AS unread,
         (SELECT o.user_id FROM conversation_members o WHERE o.conversation_id = c.id AND o.user_id <> $1 LIMIT 1) AS other_id,
         lm.text AS last_text, lm.kind AS last_kind, lm.sender_id AS last_sender, lm.created_at AS last_at
       FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN LATERAL (
         SELECT text, kind, sender_id, created_at FROM messages x
         WHERE x.conversation_id = c.id AND x.removed_by_moderation_at IS NULL AND (m.hidden_at IS NULL OR x.created_at > m.hidden_at)
         ORDER BY x.seq DESC LIMIT 1) lm ON true
       WHERE m.user_id = $1 AND m.left_at IS NULL AND c.deleted_at IS NULL
         -- Supprimée de ma boîte : elle ne revient qu'avec un nouveau message.
         AND (m.hidden_at IS NULL OR lm.created_at IS NOT NULL)
       ORDER BY (m.pinned_at IS NOT NULL) DESC, m.pinned_at DESC NULLS LAST, c.last_message_at DESC`,
      [viewer],
    );
    const out: ConversationSummary[] = [];
    for (const r of rows) {
      const other = r.other_id ? await this.user(r.other_id) : null;
      if (r.kind === 'direct' && !other) continue;
      out.push({
        id: r.id,
        kind: r.kind,
        other,
        lastMessage: r.last_at ? { text: r.last_text, kind: r.last_kind ?? 'text', senderId: r.last_sender, createdAt: new Date(r.last_at).getTime() } : null,
        unread: r.unread,
        pinned: r.pinned_at !== null,
        presence: r.other_id ? await this.presenceOf(viewer, r.other_id) : null,
      });
    }
    return out;
  }

  private async membership(viewer: string, conversationId: string): Promise<{ hidden_at: Date | null; last_read_seq: string }> {
    const [m] = await this.db.query<{ hidden_at: Date | null; last_read_seq: string }>(
      `SELECT m.hidden_at, m.last_read_seq FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = $1 AND m.user_id = $2 AND m.left_at IS NULL AND c.deleted_at IS NULL`,
      [conversationId, viewer],
    );
    if (!m) throw new SocialError(404, 'not_found');
    return m;
  }

  private async otherMembers(conversationId: string, viewer: string): Promise<string[]> {
    return (
      await this.db.query<{ user_id: string }>(
        'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 AND left_at IS NULL',
        [conversationId, viewer],
      )
    ).map((r) => r.user_id);
  }

  /** Messages d'une conversation (les plus récents ; `beforeSeq` pour remonter l'historique). */
  async conversation(viewer: string, conversationId: string, beforeSeq?: number): Promise<ConversationDetail> {
    const m = await this.membership(viewer, conversationId);
    const rows = await this.db.query<{
      id: string;
      seq: string;
      sender_id: string | null;
      kind: MessageView['kind'];
      text: string | null;
      created_at: Date;
      gif: { id: string; url: string; width: number; height: number } | null;
      sticker_id: string | null;
      media_id: string | null;
      storage_key: string | null;
      width: number | null;
      height: number | null;
      animated: boolean | null;
      reply_id: string | null;
      reply_sender: string | null;
      reply_pseudo: string | null;
      reply_kind: string | null;
      reply_text: string | null;
    }>(
      `SELECT x.id, x.seq, x.sender_id, x.kind, x.text, x.created_at, x.gif, x.sticker_id,
              md.id AS media_id, md.storage_key, md.width, md.height, md.animated,
              r.id AS reply_id, r.sender_id AS reply_sender, rp.pseudo AS reply_pseudo, r.kind AS reply_kind,
              CASE WHEN r.removed_by_moderation_at IS NULL THEN r.text ELSE NULL END AS reply_text
       FROM messages x LEFT JOIN messages r ON r.id = x.reply_to_id LEFT JOIN profiles rp ON rp.user_id = r.sender_id
       LEFT JOIN media md ON md.id = x.media_id AND md.removed_by_moderation_at IS NULL
       WHERE x.conversation_id = $1 AND x.removed_by_moderation_at IS NULL
         AND ($2::timestamptz IS NULL OR x.created_at > $2)
         AND ($3::bigint IS NULL OR x.seq < $3)
       ORDER BY x.seq DESC LIMIT ${PAGE}`,
      [conversationId, m.hidden_at, beforeSeq ?? null],
    );
    const ids = rows.map((r) => r.id);
    const reactions = ids.length
      ? await this.db.query<{ message_id: string; emoji: string; user_id: string }>(
          'SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id = ANY($1::uuid[]) ORDER BY created_at',
          [ids],
        )
      : [];
    // Statut de mes messages : « lu » dès que l'autre a lu jusque-là.
    const others = await this.otherMembers(conversationId, viewer);
    const [{ read_upto }] = await this.db.query<{ read_upto: string | null }>(
      'SELECT max(last_read_seq) AS read_upto FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
      [conversationId, viewer],
    );
    const readUpto = Number(read_upto ?? 0);
    const messages: MessageView[] = rows.reverse().map((r) => {
      const byEmoji = new Map<string, string[]>();
      for (const re of reactions.filter((x) => x.message_id === r.id)) byEmoji.set(re.emoji, [...(byEmoji.get(re.emoji) ?? []), re.user_id]);
      return {
        id: r.id,
        seq: Number(r.seq),
        senderId: r.sender_id,
        kind: r.kind,
        text: r.text,
        attachment: attachmentOf(r),
        createdAt: new Date(r.created_at).getTime(),
        replyTo: r.reply_id
          ? { id: r.reply_id, senderId: r.reply_sender, senderPseudo: r.reply_pseudo, kind: r.reply_kind ?? 'text', text: r.reply_text }
          : null,
        reactions: [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
        status: r.sender_id === viewer ? (Number(r.seq) <= readUpto ? 'read' : 'sent') : null,
      };
    });
    const summaryRow = (await this.inbox(viewer)).find((c) => c.id === conversationId);
    const other = others[0] ? await this.user(others[0]) : null;
    const canSend = !others.length || !(await this.blocked(viewer, others[0]));
    return {
      conversation: summaryRow ?? {
        id: conversationId,
        kind: 'direct',
        other,
        lastMessage: null,
        unread: 0,
        pinned: false,
        presence: others[0] ? await this.presenceOf(viewer, others[0]) : null,
      },
      messages,
      canSend,
    };
  }

  /**
   * Envoyer un message : texte, photo déjà envoyée (`mediaId`), GIF du catalogue (`gif`) ou sticker (`stickerId`).
   * Une photo peut être accompagnée d'une légende. Réponse facultative à un message de la même conversation.
   */
  async sendMessage(viewer: string, conversationId: string, content: MessageContent): Promise<MessageView> {
    await this.membership(viewer, conversationId);
    const text = content.text === undefined || content.text === null ? '' : String(content.text).trim();
    if (text.length > MAX_MESSAGE_LENGTH) throw new SocialError(400, 'invalid_text');
    const kinds = [content.mediaId, content.gif, content.stickerId].filter((x) => x !== undefined && x !== null);
    if (kinds.length > 1) throw new SocialError(400, 'invalid_message');
    const kind: MessageView['kind'] = content.mediaId ? 'image' : content.gif ? 'gif' : content.stickerId ? 'sticker' : 'text';
    if (kind === 'text' && !text) throw new SocialError(400, 'invalid_text');
    // Seule une photo peut porter une légende ; un GIF ou un sticker est envoyé seul.
    if ((kind === 'gif' || kind === 'sticker') && text) throw new SocialError(400, 'invalid_message');
    if (kind === 'sticker' && !isSticker(content.stickerId)) throw new SocialError(400, 'invalid_sticker');
    const gif = kind === 'gif' ? validateGif(this.gifs, content.gif) : null;
    const others = await this.otherMembers(conversationId, viewer);
    for (const o of others) if (await this.blocked(viewer, o)) throw new SocialError(403, 'blocked');
    this.limit('message', viewer);
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      if (content.replyToId) {
        const ok = await tx.query('SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2', [content.replyToId, conversationId]);
        if (!ok.length) throw new SocialError(400, 'invalid_reply');
      }
      const media = kind === 'image' ? await this.media.attach(tx, viewer, String(content.mediaId), 'message') : null;
      const [{ seq }] = await tx.query<{ seq: string }>(
        `INSERT INTO messages (id, conversation_id, sender_id, kind, text, reply_to_id, media_id, gif, sticker_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING seq`,
        [id, conversationId, viewer, kind, text || null, content.replyToId ?? null, media?.id ?? null, gif ? JSON.stringify(gif) : null, kind === 'sticker' ? content.stickerId : null],
      );
      await tx.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
      // Mon propre message est lu par moi ; ma boîte la réaffiche si je l'avais supprimée.
      await tx.query('UPDATE conversation_members SET last_read_seq = $3 WHERE conversation_id = $1 AND user_id = $2', [
        conversationId,
        viewer,
        seq,
      ]);
    });
    this.signal([viewer, ...others], conversationId);
    return (await this.conversation(viewer, conversationId)).messages.find((m) => m.id === id)!;
  }

  /** Marquer comme lu jusqu'au dernier message (confirmation de lecture obligatoire). */
  async markRead(viewer: string, conversationId: string): Promise<void> {
    await this.membership(viewer, conversationId);
    const updated = await this.db.query(
      `UPDATE conversation_members SET last_read_seq = (SELECT coalesce(max(seq), 0) FROM messages WHERE conversation_id = $1)
       WHERE conversation_id = $1 AND user_id = $2
         AND last_read_seq < (SELECT coalesce(max(seq), 0) FROM messages WHERE conversation_id = $1) RETURNING user_id`,
      [conversationId, viewer],
    );
    if (updated.length) this.signal(await this.otherMembers(conversationId, viewer), conversationId);
  }

  /** Réagir (ou changer sa réaction) ; `null` retire la réaction. */
  async react(viewer: string, messageId: string, emoji: string | null): Promise<void> {
    const [msg] = await this.db.query<{ conversation_id: string }>(
      'SELECT conversation_id FROM messages WHERE id = $1 AND removed_by_moderation_at IS NULL',
      [messageId],
    );
    if (!msg) throw new SocialError(404, 'not_found');
    await this.membership(viewer, msg.conversation_id);
    for (const o of await this.otherMembers(msg.conversation_id, viewer)) if (await this.blocked(viewer, o)) throw new SocialError(403, 'blocked');
    if (emoji === null) {
      await this.db.query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, viewer]);
    } else {
      const clean = String(emoji).trim();
      if (!clean || clean.length > 8 || /[\p{L}\p{N}]/u.test(clean)) throw new SocialError(400, 'invalid_emoji');
      await this.db.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = $3, created_at = now()`,
        [messageId, viewer, clean],
      );
    }
    this.signal([viewer, ...(await this.otherMembers(msg.conversation_id, viewer))], msg.conversation_id);
  }

  async setPinned(viewer: string, conversationId: string, pinned: boolean): Promise<void> {
    await this.membership(viewer, conversationId);
    await this.db.query('UPDATE conversation_members SET pinned_at = $3 WHERE conversation_id = $1 AND user_id = $2', [
      conversationId,
      viewer,
      pinned ? new Date() : null,
    ]);
  }

  /** Supprimer de MA boîte : l'autre garde la conversation ; elle me revient avec un nouveau message. */
  async hide(viewer: string, conversationId: string): Promise<void> {
    await this.membership(viewer, conversationId);
    await this.db.query(
      `UPDATE conversation_members SET hidden_at = now(), pinned_at = NULL,
         last_read_seq = (SELECT coalesce(max(seq), 0) FROM messages WHERE conversation_id = $1)
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, viewer],
    );
  }

  /**
   * Blocage : la conversation privée disparaît des deux côtés et les demandes en attente sont refusées.
   * Les messages restent en base (preuves pour la modération) mais ne sont plus accessibles dans l'application.
   */
  async onBlock(a: string, b: string, q: Queryable = this.db): Promise<void> {
    await q.query('UPDATE conversations SET deleted_at = now() WHERE direct_key = $1 AND deleted_at IS NULL', [directKey(a, b)]);
    await q.query(
      `UPDATE message_requests SET status = 'declined', responded_at = now()
       WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
      [a, b],
    );
    this.signal([a, b]);
  }

  /** Conversation privée existante avec un joueur (pour le bouton « Message »). */
  async directWith(viewer: string, other: string): Promise<string | null> {
    if (await this.blocked(viewer, other)) return null;
    const id = await this.activeDirect(viewer, other);
    if (!id) return null;
    // Une conversation que j'ai supprimée de ma boîte reste joignable : je peux y écrire de nouveau.
    return id;
  }
}
