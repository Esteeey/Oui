import { randomUUID } from 'node:crypto';

import {
  CHALLENGE_EXPIRY_HOURS,
  RULES,
  getTheme,
  levelFromXp,
  totals,
  type ChallengeView,
  type DuelQuestion,
  type DuelResult,
  type PlayerAnswer,
} from '@qu1z/shared';

import type { Database } from './db/database';
import type { Duel } from './duel';
import type { Game } from './game';
import type { Notifier } from './notifier';
import { SocialError } from './social';
import { mediaUrl } from './media';

/** Un défi expire s'il n'est pas relevé dans les 24 h (À AJUSTER : `CHALLENGE_EXPIRY_HOURS`). */
const EXPIRY = `interval '${CHALLENGE_EXPIRY_HOURS} hours'`;
/** Défis terminés, refusés ou expirés encore affichés (pour voir le résultat ou le statut). */
const RECENT = "interval '48 hours'";

/**
 * Défis entre joueurs réels, en match ASYNCHRONE. Autorisés si l'un suit l'autre (dans un sens ou dans
 * l'autre) ou, pour une revanche, s'ils viennent de s'affronter ; jamais en cas de blocage.
 *
 * 1. Envoyé (`sent`) : l'invitant joue tout de suite ses 7 questions ; ses réponses et temps sont enregistrés.
 * 2. En attente (`pending`) : l'ami est prévenu (notification) et a 24 h pour accepter ou refuser.
 * 3. Accepté (`accepted`) : l'ami rejoue les MÊMES questions contre l'enregistrement de l'invitant.
 * 4. Terminé (`completed`) : les récompenses sont versées aux deux joueurs (par le serveur de jeu).
 * Sinon : refusé (`declined`), expiré (`expired`) ou annulé (`cancelled`).
 */
export class Challenges {
  constructor(
    private readonly db: Database,
    private readonly game: Game,
    private readonly notifier?: Notifier,
  ) {
    game.onChallengeLeg = (duel, results) => this.legFinished(duel, results);
  }

  private notify(userId: string, input: Parameters<Notifier['notify']>[1]): Promise<void> {
    return this.notifier ? this.notifier.notify(userId, input).catch((err) => console.error('Notification', err)) : Promise.resolve();
  }

  private async blocked(a: string, b: string): Promise<boolean> {
    const rows = await this.db.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b]);
    return rows.length > 0;
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

  /**
   * Envoie un défi : l'invitant commence aussitôt sa partie (manche 1). Renvoie le défi et le duel à jouer.
   * Un seul défi ouvert par paire et par thème (double clic, renvois) : on renvoie alors celui qui existe.
   */
  async create(from: string, to: string, themeId: string, rematchOf?: string): Promise<ChallengeView & { playDuelId: string | null }> {
    if (from === to) throw new SocialError(400, 'self');
    if (!getTheme(themeId)) throw new SocialError(404, 'unknown_theme');
    if (!(await this.db.query("SELECT 1 FROM users WHERE id = $1 AND status NOT IN ('banned', 'deleted')", [to])).length) throw new SocialError(404, 'not_found');
    if (await this.blocked(from, to)) throw new SocialError(403, 'blocked');
    const allowed = rematchOf ? await this.playedTogether(from, to, rematchOf) : await this.canChallenge(from, to);
    if (!allowed) throw new SocialError(403, 'not_connected_by_follow');
    if (!this.game.limiter.allow('challenge', from)) throw new SocialError(429, 'rate_limited');

    const [existing] = await this.db.query<{ id: string }>(
      `SELECT id FROM challenges WHERE from_id = $1 AND to_id = $2 AND theme_id = $3 AND status IN ('sent', 'pending')
         AND created_at > now() - ${EXPIRY}`,
      [from, to, themeId],
    );
    if (existing) return { ...(await this.view(from, existing.id)), playDuelId: null };

    const id = randomUUID();
    const kind = rematchOf ? 'rematch' : 'challenge';
    await this.db.query("INSERT INTO challenges (id, from_id, to_id, theme_id, kind, status) VALUES ($1, $2, $3, $4, $5, 'sent')", [id, from, to, themeId, kind]);
    const duel = await this.game.startChallengeLeg1(from, to, themeId, id);
    if (!duel) {
      await this.db.query('DELETE FROM challenges WHERE id = $1', [id]);
      throw new SocialError(409, 'busy');
    }
    await this.db.query('UPDATE challenges SET from_duel_id = $2, questions = $3 WHERE id = $1', [id, duel.id, JSON.stringify(duel.state.questions)]);
    return { ...(await this.view(from, id)), playDuelId: duel.id };
  }

  /** Fin d'une manche jouée (appelé par le serveur de jeu). */
  private async legFinished(duel: Duel, results: (DuelResult | null)[]): Promise<void> {
    const s = duel.state;
    const challenge = s.challenge;
    if (!challenge) return;
    const [row] = await this.db.query<{ from_id: string; to_id: string; theme_id: string; kind: 'challenge' | 'rematch' }>(
      'SELECT from_id, to_id, theme_id, kind FROM challenges WHERE id = $1',
      [challenge.id],
    );
    if (!row) return;
    if (challenge.leg === 1) {
      // L'invitant a abandonné sa propre partie : le défi n'est jamais envoyé.
      if (s.participants[0].forfeited) {
        await this.db.query("UPDATE challenges SET status = 'cancelled', responded_at = now() WHERE id = $1 AND status = 'sent'", [challenge.id]);
        return;
      }
      const answers = s.answers[0].map((a) => a ?? { choice: null, responseMs: RULES.answerTimeMs });
      await this.db.query("UPDATE challenges SET status = 'pending', from_answers = $2, from_score = $3 WHERE id = $1 AND status = 'sent'", [
        challenge.id,
        JSON.stringify(answers),
        totals(duel.scored(0)).points,
      ]);
      await this.notify(row.to_id, {
        type: row.kind === 'rematch' ? 'rematch_request' : 'challenge_received',
        category: 'challenges',
        actorId: row.from_id,
        groupKey: `challenge:${challenge.id}`,
        data: { challengeId: challenge.id, themeId: row.theme_id },
      });
      return;
    }
    // Manche 2 : l'ami (participant 0) a joué contre l'enregistrement de l'invitant (participant 1).
    await this.db.query("UPDATE challenges SET status = 'completed', to_score = $2, completed_at = now() WHERE id = $1", [
      challenge.id,
      totals(duel.scored(0)).points,
    ]);
    await this.notify(row.from_id, {
      type: 'challenge_completed',
      category: 'challenges',
      actorId: row.to_id,
      data: { challengeId: challenge.id, themeId: row.theme_id, duelId: s.id, outcome: results[1]?.outcome ?? duel.outcomeFor(1) },
    });
  }

  async view(viewer: string, id: string): Promise<ChallengeView> {
    const [row] = await this.list(viewer, id);
    if (!row) throw new SocialError(404, 'not_found');
    return row;
  }

  /** Expire les défis non relevés à temps (envoyés ou en attente depuis plus de 24 h). */
  private async expire(viewer: string): Promise<void> {
    await this.db.query(
      `UPDATE challenges SET status = 'expired' WHERE status IN ('sent', 'pending') AND created_at <= now() - ${EXPIRY}
         AND (from_id = $1 OR to_id = $1)`,
      [viewer],
    );
  }

  /**
   * Défis reçus et envoyés, plus récents d'abord : ceux en cours, et ceux terminés, refusés ou expirés
   * récemment. L'ami ne voit un défi qu'une fois la partie de l'invitant jouée.
   */
  async list(viewer: string, onlyId?: string): Promise<ChallengeView[]> {
    await this.expire(viewer);
    const rows = await this.db.query<{
      id: string;
      from_id: string;
      to_id: string;
      theme_id: string;
      kind: 'challenge' | 'rematch';
      status: ChallengeView['status'];
      created_at: Date;
      duel_id: string | null;
      from_score: number | null;
      to_score: number | null;
      from_pseudo: string;
      from_title: string | null;
      from_xp: number;
      to_pseudo: string;
      to_title: string | null;
      to_xp: number;
      from_avatar: string | null;
      to_avatar: string | null;
    }>(
      `SELECT c.id, c.from_id, c.to_id, c.theme_id, c.kind, c.status, c.created_at, c.duel_id, c.from_score, c.to_score,
              pf.pseudo AS from_pseudo, pf.equipped_title AS from_title, uf.xp AS from_xp, (SELECT storage_key FROM media WHERE id = pf.avatar_media_id AND removed_by_moderation_at IS NULL) AS from_avatar,
              pt.pseudo AS to_pseudo, pt.equipped_title AS to_title, ut.xp AS to_xp, (SELECT storage_key FROM media WHERE id = pt.avatar_media_id AND removed_by_moderation_at IS NULL) AS to_avatar
       FROM challenges c
       JOIN users uf ON uf.id = c.from_id JOIN profiles pf ON pf.user_id = c.from_id
       JOIN users ut ON ut.id = c.to_id JOIN profiles pt ON pt.user_id = c.to_id
       WHERE (c.from_id = $1 OR c.to_id = $1)
         AND NOT (c.to_id = $1 AND c.status = 'sent')
         AND ($2::uuid IS NULL AND (c.status IN ('sent', 'pending', 'accepted')
                                    OR (c.status IN ('completed', 'declined', 'expired') AND coalesce(c.completed_at, c.responded_at, c.created_at) > now() - ${RECENT}))
              OR c.id = $2)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = c.from_id AND b.blocked_id = c.to_id)
                                                OR (b.blocker_id = c.to_id AND b.blocked_id = c.from_id))
       ORDER BY c.created_at DESC LIMIT 50`,
      [viewer, onlyId ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      from: { id: r.from_id, pseudo: r.from_pseudo, title: r.from_title, level: levelFromXp(r.from_xp).level, avatar: mediaUrl(r.from_avatar) },
      to: { id: r.to_id, pseudo: r.to_pseudo, title: r.to_title, level: levelFromXp(r.to_xp).level, avatar: mediaUrl(r.to_avatar) },
      themeId: r.theme_id,
      kind: r.kind,
      status: r.status,
      incoming: r.to_id === viewer,
      createdAt: new Date(r.created_at).getTime(),
      expiresAt: new Date(r.created_at).getTime() + CHALLENGE_EXPIRY_HOURS * 3_600_000,
      duelId: r.duel_id,
      fromScore: r.from_score,
      // Le score de l'ami n'est connu qu'à la fin de sa partie.
      toScore: r.status === 'completed' ? r.to_score : null,
    }));
  }

  private async pending(id: string): Promise<{ from_id: string; to_id: string; theme_id: string; questions: DuelQuestion[]; from_answers: PlayerAnswer[] }> {
    const [row] = await this.db.query<{ from_id: string; to_id: string; theme_id: string; questions: DuelQuestion[]; from_answers: PlayerAnswer[] }>(
      `SELECT from_id, to_id, theme_id, questions, from_answers FROM challenges WHERE id = $1 AND status = 'pending' AND created_at > now() - ${EXPIRY}`,
      [id],
    );
    if (!row) throw new SocialError(404, 'not_found');
    return row;
  }

  /** Accepter : l'ami joue tout de suite les mêmes questions contre l'enregistrement de l'invitant. */
  async accept(viewer: string, id: string): Promise<{ duelId: string }> {
    const c = await this.pending(id);
    if (c.to_id !== viewer) throw new SocialError(403, 'forbidden');
    if (await this.blocked(c.from_id, c.to_id)) throw new SocialError(403, 'blocked');
    // Passage atomique de « en attente » à « accepté » : un double clic ne lance pas deux duels.
    const claimed = await this.db.query("UPDATE challenges SET status = 'accepted', responded_at = now() WHERE id = $1 AND status = 'pending' RETURNING id", [id]);
    if (!claimed.length) throw new SocialError(404, 'not_found');
    const duel = await this.game.startChallengeLeg2(c.to_id, c.from_id, c.theme_id, id, c.questions, c.from_answers);
    if (!duel) {
      await this.db.query("UPDATE challenges SET status = 'pending', responded_at = NULL WHERE id = $1", [id]);
      throw new SocialError(409, 'busy');
    }
    await this.db.query('UPDATE challenges SET duel_id = $2 WHERE id = $1', [id, duel.id]);
    await this.notifier?.remove(c.to_id, `challenge:${id}`);
    await this.notify(c.from_id, { type: 'challenge_accepted', category: 'challenges', actorId: c.to_id, data: { challengeId: id, themeId: c.theme_id, duelId: duel.id } });
    return { duelId: duel.id };
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
