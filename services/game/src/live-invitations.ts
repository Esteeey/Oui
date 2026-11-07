import { randomUUID } from 'node:crypto';

import { getTheme, levelFromXp, questionsOf, RULES, type LiveInvitation, type LiveInvitationStatus, type ServerMessage, type UserSummary } from '@qu1z/shared';

import type { Database } from './db/database';
import type { Game } from './game';
import type { Push } from './push';
import type { WebPush } from './web-push';
import { SocialError } from './social';

/** Invitations de duel en direct. Le défi asynchrone 24 h reste géré par Challenges. */
export class LiveInvitations {
  constructor(
    private readonly db: Database,
    private readonly game: Game,
    private readonly send: (userId: string, message: ServerMessage) => void,
    private readonly push: Push,
    private readonly webPush: WebPush,
  ) {}

  private async summaries(ids: string[]): Promise<Map<string, UserSummary>> {
    if (!ids.length) return new Map();
    const rows = await this.db.query<{ id: string; pseudo: string; title: string | null; xp: number; avatar_key: string | null }>(
      `SELECT u.id, p.pseudo, p.equipped_title AS title, u.xp,
        (SELECT storage_key FROM media WHERE id = p.avatar_media_id AND removed_by_moderation_at IS NULL) AS avatar_key
       FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ANY($1::uuid[])`, [ids]);
    const { mediaUrl } = await import('./media');
    return new Map(rows.map((r) => [r.id, { id: r.id, pseudo: r.pseudo, title: r.title, level: levelFromXp(r.xp).level, avatar: mediaUrl(r.avatar_key) }]));
  }

  private async views(viewer: string, onlyPending = false): Promise<LiveInvitation[]> {
    await this.expire();
    const rows = await this.db.query<{
      id: string; sender_id: string; receiver_id: string; theme_id: string; status: LiveInvitationStatus;
      created_at: Date; expires_at: Date; responded_at: Date | null; match_id: string | null;
    }>(`SELECT id, sender_id, receiver_id, theme_id, status, created_at, expires_at, responded_at, match_id
       FROM live_duel_invitations WHERE (sender_id = $1 OR receiver_id = $1)
       ${onlyPending ? "AND status = 'pending'" : "AND created_at > now() - interval '48 hours'"}
       ORDER BY created_at DESC LIMIT 50`, [viewer]);
    const people = await this.summaries([...new Set(rows.flatMap((r) => [r.sender_id, r.receiver_id]))]);
    return rows.flatMap((r) => {
      const sender = people.get(r.sender_id); const receiver = people.get(r.receiver_id);
      return sender && receiver ? [{ id: r.id, sender, receiver, themeId: r.theme_id, status: r.status,
        createdAt: new Date(r.created_at).getTime(), expiresAt: new Date(r.expires_at).getTime(),
        respondedAt: r.responded_at ? new Date(r.responded_at).getTime() : null, matchId: r.match_id,
        incoming: r.receiver_id === viewer }] : [];
    });
  }

  async list(viewer: string): Promise<{ invitations: LiveInvitation[] }> { return { invitations: await this.views(viewer) }; }

  async create(sender: string, receiver: string, themeId: string): Promise<LiveInvitation> {
    if (sender === receiver) throw new SocialError(400, 'self');
    if (!getTheme(themeId) || questionsOf(themeId).length < RULES.questionsPerDuel) throw new SocialError(404, 'unknown_theme');
    if (!(await this.db.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [receiver])).length) throw new SocialError(404, 'not_found');
    const allowed = await this.db.query(`SELECT 1 WHERE EXISTS (SELECT 1 FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1))
      AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1))`, [sender, receiver]);
    if (!allowed.length) throw new SocialError(403, 'not_connected_by_follow');
    if (!this.game.limiter.allow('challenge', sender)) throw new SocialError(429, 'rate_limited');
    if (this.game.hasActiveDuel(sender)) throw new SocialError(409, 'busy');
    const id = randomUUID();
    const rows = await this.db.query<{ id: string }>(`INSERT INTO live_duel_invitations (id, sender_id, receiver_id, theme_id)
      VALUES ($1, $2, $3, $4) RETURNING id`, [id, sender, receiver, themeId]).catch((err: { code?: string }) => {
      if (err.code === '23505') throw new SocialError(409, 'invitation_pending'); throw err;
    });
    if (!rows.length) throw new SocialError(409, 'invitation_pending');
    const [view] = (await this.views(sender)).filter((x) => x.id === id);
    if (!view) throw new SocialError(500, 'server_error');
    const [incoming] = (await this.views(receiver, true)).filter((x) => x.id === id);
    this.send(sender, { type: 'duelInvitation', invitation: view });
    if (incoming) this.send(receiver, { type: 'duelInvitation', invitation: incoming });
    await this.notifyOffline(receiver, view);
    return view;
  }

  private async notifyOffline(receiver: string, invite: LiveInvitation): Promise<void> {
    const [prefs] = await this.db.query<{ prefs: Record<string, unknown> }>('SELECT prefs FROM notification_preferences WHERE user_id = $1', [receiver]);
    if (prefs?.prefs?.duelInvites === false) return;
    const sound = prefs?.prefs?.duelInviteSound !== false;
    const vibrate = prefs?.prefs?.duelInviteVibration !== false;
    const nativeSent = await this.push.notify([receiver], async () => ({ title: 'Nouveau défi !', body: `${invite.sender.pseudo} t'invite à une partie.`,
      data: { kind: 'duel_invitation', invitationId: invite.id }, channelId: 'community', sound: sound ? 'default' : null, vibrate: vibrate ? [0, 120] : [] }), true);
    const webSent = await this.webPush.notify(receiver, { title: 'Nouveau défi !', body: `${invite.sender.pseudo} t'invite à une partie.`,
      data: { kind: 'duel_invitation', invitationId: invite.id }, vibrate: vibrate ? [120] : [], silent: !sound });
    if (nativeSent || webSent) await this.db.query("UPDATE live_duel_invitations SET notification_status = 'sent' WHERE id = $1 AND status = 'pending'", [invite.id]);
  }

  async respond(viewer: string, id: string, action: 'accept' | 'decline' | 'cancel'): Promise<{ invitation: LiveInvitation; matchId?: string }> {
    const [row] = await this.db.query<{ sender_id: string; receiver_id: string; theme_id: string; status: LiveInvitationStatus; match_id: string | null }>(
      'SELECT sender_id, receiver_id, theme_id, status, match_id FROM live_duel_invitations WHERE id = $1', [id]);
    if (!row) throw new SocialError(404, 'not_found');
    if (action === 'cancel' ? row.sender_id !== viewer : row.receiver_id !== viewer) throw new SocialError(403, 'forbidden');
    if (row.status !== 'pending') throw new SocialError(409, 'invitation_expired_or_handled');
    let matchId = row.match_id;
    let status: LiveInvitationStatus = row.status as LiveInvitationStatus;
    if (action === 'accept' && status === 'pending') {
      const blocked = await this.db.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [row.sender_id, row.receiver_id]);
      if (blocked.length) throw new SocialError(403, 'blocked');
      const claimed = await this.db.query<{ id: string }>(`UPDATE live_duel_invitations SET status = 'accepted', responded_at = now()
        WHERE id = $1 AND receiver_id = $2 AND status = 'pending' AND expires_at > now() RETURNING id`, [id, viewer]);
      if (!claimed.length) {
        await this.expire();
        throw new SocialError(409, 'invitation_expired_or_handled');
      }
      try {
        const duel = await this.game.startLiveInviteDuel(row.sender_id, row.receiver_id, row.theme_id);
        if (!duel) {
          await this.db.query("UPDATE live_duel_invitations SET status = 'unavailable', responded_at = now() WHERE id = $1 AND match_id IS NULL", [id]);
          status = 'unavailable';
        } else {
          matchId = duel.id;
          await this.db.query('UPDATE live_duel_invitations SET match_id = $2 WHERE id = $1', [id, matchId]);
          status = 'accepted';
        }
      } catch (err) {
        await this.db.query("UPDATE live_duel_invitations SET status = 'unavailable', responded_at = now() WHERE id = $1 AND match_id IS NULL", [id]);
        throw err;
      }
    } else if (status === 'pending') {
      const next = action === 'decline' ? 'declined' : 'cancelled';
      const changed = await this.db.query<{ id: string }>(`UPDATE live_duel_invitations SET status = $3, responded_at = now()
        WHERE id = $1 AND ${action === 'cancel' ? 'sender_id' : 'receiver_id'} = $2 AND status = 'pending' AND expires_at > now() RETURNING id`, [id, viewer, next]);
      if (!changed.length) throw new SocialError(409, 'invitation_expired_or_handled');
      status = next;
    }
    // Construire une vue par destinataire : `incoming` est relatif au lecteur et ne
    // doit pas être envoyé avec la même valeur aux deux joueurs.
    const [senderInvitation] = (await this.views(row.sender_id)).filter((x) => x.id === id);
    const [receiverInvitation] = (await this.views(row.receiver_id)).filter((x) => x.id === id);
    if (!senderInvitation || !receiverInvitation) throw new SocialError(404, 'not_found');
    this.send(row.sender_id, { type: 'duelInvitation', invitation: senderInvitation });
    this.send(row.receiver_id, { type: 'duelInvitation', invitation: receiverInvitation });
    return { invitation: viewer === row.sender_id ? senderInvitation : receiverInvitation, ...(matchId ? { matchId } : {}) };
  }

  async expire(): Promise<void> {
    const expired = await this.db.query<{ id: string; sender_id: string; receiver_id: string }>(`UPDATE live_duel_invitations
      SET status = 'expired', responded_at = now() WHERE status = 'pending' AND expires_at <= now() RETURNING id, sender_id, receiver_id`);
    for (const row of expired) {
      const [invitation] = (await this.views(row.sender_id)).filter((x) => x.id === row.id);
      if (invitation) { const m = { type: 'duelInvitation' as const, invitation }; this.send(row.sender_id, m); this.send(row.receiver_id, m); }
    }
    await this.db.query("DELETE FROM live_duel_invitations WHERE status <> 'pending' AND created_at < now() - interval '48 hours'");
  }
}
