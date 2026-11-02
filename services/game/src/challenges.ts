import { randomUUID } from 'node:crypto';

import { getTheme, levelFromXp, type ChallengeView } from '@qu1z/shared';

import type { Database } from './db/database';
import type { Game } from './game';
import type { Notifier } from './notifier';
import { SocialError } from './social';

/** Un défi en attente expire au bout de 24 h. */
const EXPIRY = "interval '24 hours'";

/**
 * Défis entre joueurs réels. Autorisés si l'un suit l'autre (dans un sens ou dans l'autre)
 * ou, pour une revanche, s'ils viennent de s'affronter ; jamais en cas de blocage.
 * Le duel démarre à l'acceptation, si le joueur qui a lancé le défi est connecté.
 */
export class Challenges {
  constructor(
    private readonly db: Database,
    private readonly game: Game,
    private readonly notifier?: Notifier,
  ) {}

  private notify(userId: string, input: Parameters<Notifier['notify']>[1]): Promise<void> {
    return this.notifier ? this.notifier.notify(userId, input).catch((err) => console.error('Notification', err)) : Promise.resolve();
  }

  /** Peut-on défier ce joueur ? (abonnement dans un sens ou l'autre, pas de blocage) */
  async canChallenge(from: string, to: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1))
         AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1))`,
      [from, to],
    );
    return rows.length > 0;
  }

  private async playedTogether(a: string, b: string, duelId: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM duel_participants x JOIN duel_participants y ON y.duel_id = x.duel_id
       WHERE x.duel_id = $3 AND x.user_id = $1 AND y.user_id = $2`,
      [a, b, duelId],
    );
    return rows.length > 0;
  }

  async create(from: string, to: string, themeId: string, rematchOf?: string): Promise<ChallengeView> {
    if (from === to) throw new SocialError(400, 'self');
    if (!getTheme(themeId)) throw new SocialError(404, 'unknown_theme');
    if (!(await this.db.query("SELECT 1 FROM users WHERE id = $1 AND status <> 'banned'", [to])).length) throw new SocialError(404, 'not_found');
    const blocked = await this.db.query(
      'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
      [from, to],
    );
    if (blocked.length) throw new SocialError(403, 'blocked');
    const allowed = rematchOf ? await this.playedTogether(from, to, rematchOf) : await this.canChallenge(from, to);
    if (!allowed) throw new SocialError(403, 'not_connected_by_follow');
    if (!this.game.limiter.allow('challenge', from)) throw new SocialError(429, 'rate_limited');

    // Un seul défi en attente par paire et par thème (double clic, renvois).
    const [existing] = await this.db.query<{ id: string }>(
      `SELECT id FROM challenges WHERE from_id = $1 AND to_id = $2 AND theme_id = $3 AND status = 'pending'
         AND created_at > now() - ${EXPIRY}`,
      [from, to, themeId],
    );
    if (existing) return this.view(from, existing.id);
    const id = randomUUID();
    const kind = rematchOf ? 'rematch' : 'challenge';
    await this.db.query('INSERT INTO challenges (id, from_id, to_id, theme_id, kind) VALUES ($1, $2, $3, $4, $5)', [id, from, to, themeId, kind]);
    await this.notify(to, {
      type: kind === 'rematch' ? 'rematch_request' : 'challenge_received',
      category: 'challenges',
      actorId: from,
      groupKey: `challenge:${id}`,
      data: { challengeId: id, themeId },
    });
    return this.view(from, id);
  }

  private async view(viewer: string, id: string): Promise<ChallengeView> {
    const [row] = await this.list(viewer, id);
    if (!row) throw new SocialError(404, 'not_found');
    return row;
  }

  /** Défis en attente (reçus et envoyés), plus récents d'abord ; les défis trop anciens expirent. */
  async list(viewer: string, onlyId?: string): Promise<ChallengeView[]> {
    await this.db.query(
      `UPDATE challenges SET status = 'expired' WHERE status = 'pending' AND created_at <= now() - ${EXPIRY}
         AND (from_id = $1 OR to_id = $1)`,
      [viewer],
    );
    const rows = await this.db.query<{
      id: string;
      from_id: string;
      to_id: string;
      theme_id: string;
      kind: 'challenge' | 'rematch';
      status: ChallengeView['status'];
      created_at: Date;
      duel_id: string | null;
      from_pseudo: string;
      from_title: string | null;
      from_xp: number;
      to_pseudo: string;
      to_title: string | null;
      to_xp: number;
    }>(
      `SELECT c.*, pf.pseudo AS from_pseudo, pf.equipped_title AS from_title, uf.xp AS from_xp,
              pt.pseudo AS to_pseudo, pt.equipped_title AS to_title, ut.xp AS to_xp
       FROM challenges c
       JOIN users uf ON uf.id = c.from_id JOIN profiles pf ON pf.user_id = c.from_id
       JOIN users ut ON ut.id = c.to_id JOIN profiles pt ON pt.user_id = c.to_id
       WHERE (c.from_id = $1 OR c.to_id = $1) AND ($2::uuid IS NULL AND c.status = 'pending' OR c.id = $2)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = c.from_id AND b.blocked_id = c.to_id)
                                                OR (b.blocker_id = c.to_id AND b.blocked_id = c.from_id))
       ORDER BY c.created_at DESC LIMIT 50`,
      [viewer, onlyId ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      from: { id: r.from_id, pseudo: r.from_pseudo, title: r.from_title, level: levelFromXp(r.from_xp).level },
      to: { id: r.to_id, pseudo: r.to_pseudo, title: r.to_title, level: levelFromXp(r.to_xp).level },
      themeId: r.theme_id,
      kind: r.kind,
      status: r.status,
      incoming: r.to_id === viewer,
      createdAt: new Date(r.created_at).getTime(),
      duelId: r.duel_id,
    }));
  }

  private async pending(id: string): Promise<{ from_id: string; to_id: string; theme_id: string }> {
    const [row] = await this.db.query<{ from_id: string; to_id: string; theme_id: string }>(
      `SELECT from_id, to_id, theme_id FROM challenges WHERE id = $1 AND status = 'pending' AND created_at > now() - ${EXPIRY}`,
      [id],
    );
    if (!row) throw new SocialError(404, 'not_found');
    return row;
  }

  /** Accepter : le duel démarre tout de suite pour les deux joueurs. */
  async accept(viewer: string, id: string): Promise<{ duelId: string }> {
    const c = await this.pending(id);
    if (c.to_id !== viewer) throw new SocialError(403, 'forbidden');
    if (await this.db.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [c.from_id, c.to_id]).then((r) => r.length)) {
      throw new SocialError(403, 'blocked');
    }
    if (!this.game.isOnline(c.from_id)) throw new SocialError(409, 'challenger_offline');
    // Passage atomique de « en attente » à « accepté » : un double clic ne lance pas deux duels.
    const claimed = await this.db.query("UPDATE challenges SET status = 'accepted', responded_at = now() WHERE id = $1 AND status = 'pending' RETURNING id", [id]);
    if (!claimed.length) throw new SocialError(404, 'not_found');
    const duelId = await this.game.startChallengeDuel(c.from_id, c.to_id, c.theme_id);
    if (!duelId) {
      await this.db.query("UPDATE challenges SET status = 'pending', responded_at = NULL WHERE id = $1", [id]);
      throw new SocialError(409, 'busy');
    }
    await this.db.query('UPDATE challenges SET duel_id = $2 WHERE id = $1', [id, duelId]);
    await this.notifier?.remove(c.to_id, `challenge:${id}`);
    await this.notify(c.from_id, { type: 'challenge_accepted', category: 'challenges', actorId: c.to_id, data: { challengeId: id, themeId: c.theme_id, duelId } });
    return { duelId };
  }

  async decline(viewer: string, id: string): Promise<void> {
    const c = await this.pending(id);
    if (c.to_id !== viewer) throw new SocialError(403, 'forbidden');
    await this.db.query("UPDATE challenges SET status = 'declined', responded_at = now() WHERE id = $1 AND status = 'pending'", [id]);
    await this.notifier?.remove(c.to_id, `challenge:${id}`);
    await this.notify(c.from_id, { type: 'challenge_declined', category: 'challenges', actorId: c.to_id, data: { challengeId: id, themeId: c.theme_id } });
  }

  async cancel(viewer: string, id: string): Promise<void> {
    const c = await this.pending(id);
    if (c.from_id !== viewer) throw new SocialError(403, 'forbidden');
    await this.db.query("UPDATE challenges SET status = 'cancelled', responded_at = now() WHERE id = $1 AND status = 'pending'", [id]);
    await this.notifier?.remove(c.to_id, `challenge:${id}`);
  }
}
