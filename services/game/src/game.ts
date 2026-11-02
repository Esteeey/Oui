import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  BOT_NAME,
  INITIAL_RATING,
  RULES,
  computeRewards,
  getTheme,
  levelFromXp,
  prepareDuel,
  questionsOf,
  ratingDelta,
  totals,
  unlockedTitles,
  type DuelRecord,
  type DuelResult,
  type DuelSnapshot,
  type Profile,
  type ServerMessage,
} from '@qu1z/shared';

import { DEFAULT_TIMING, Duel, type Participant, type Timing } from './duel';
import type { Notifier } from './notifier';
import { RateLimiter, DEFAULT_LIMITS, type Limits } from './rate-limit';
import { Repo, type UserRow } from './repo';

export const MAX_CHAT_LENGTH = 200;
const MAX_CHAT_MESSAGES = 100;

export interface GameOptions {
  repo: Repo;
  timing?: Timing;
  now?: () => number;
  /** Attente d'un adversaire réel avant de proposer le bot. */
  matchTimeoutMs?: number;
  limits?: Partial<Limits>;
  /** Envoi d'un message à toutes les connexions d'un joueur (fourni par le serveur WebSocket). */
  send: (playerId: string, message: ServerMessage) => void;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Logique du serveur de jeu, indépendante du transport : comptes, matchmaking,
 * duels, récompenses (calculées et versées ici uniquement), reconnexion, chat.
 * Les données durables sont en base (PostgreSQL) ; seuls les duels en cours vivent aussi en mémoire.
 */
export class Game {
  readonly repo: Repo;
  readonly limiter: RateLimiter;
  /** Branché par le serveur ; absent dans certains tests. */
  notifier?: Notifier;
  private readonly timing: Timing;
  private readonly now: () => number;
  private readonly matchTimeoutMs: number;
  private readonly send: GameOptions['send'];
  private readonly duels = new Map<string, Duel>();
  /** Joueur → duel en cours (non terminé). */
  private readonly active = new Map<string, string>();
  private readonly online = new Set<string>();
  private readonly queue = new Map<string, { playerId: string; since: number; timer: ReturnType<typeof setTimeout> }>();
  /** Écritures d'un duel, enchaînées pour garder leur ordre. */
  private readonly writes = new Map<string, Promise<void>>();

  constructor(options: GameOptions) {
    this.repo = options.repo;
    this.timing = options.timing ?? DEFAULT_TIMING;
    this.now = options.now ?? Date.now;
    this.matchTimeoutMs = options.matchTimeoutMs ?? 10_000;
    this.limiter = new RateLimiter({ ...DEFAULT_LIMITS, ...options.limits } as Limits, this.now);
    this.send = options.send;
  }

  /** Reprise des duels non terminés : ils continuent selon l'horloge réelle. */
  async restore(): Promise<void> {
    for (const state of await this.repo.unfinishedDuels()) {
      for (const p of state.participants) if (!p.isBot) p.connected = false;
      const duel = Duel.restore(state, this.timing, this.now, (d) => this.changed(d), (d) => void this.finished(d));
      this.duels.set(duel.id, duel);
      for (const p of state.participants) if (!p.isBot) this.active.set(p.playerId, duel.id);
    }
  }

  // ---- Comptes -----------------------------------------------------------------------------

  /** Retrouve un joueur par son jeton, ou crée un compte invité. Refuse les comptes bannis. */
  async hello(token?: string): Promise<{ user: UserRow; token: string } | { error: 'banned' | 'suspended' }> {
    if (token) {
      const user = await this.repo.userByTokenHash(hashToken(token));
      if (user) {
        if (user.status === 'banned') return { error: 'banned' };
        return { user, token };
      }
    }
    const newToken = randomBytes(32).toString('hex');
    const user = await this.repo.createGuest(hashToken(newToken));
    return { user, token: newToken };
  }

  async authenticate(token: string): Promise<UserRow | null> {
    const user = await this.repo.userByTokenHash(hashToken(token));
    return user && user.status !== 'banned' ? user : null;
  }

  profile(playerId: string): Promise<Profile> {
    return this.repo.profile(playerId);
  }

  isOnline(playerId: string): boolean {
    return this.online.has(playerId);
  }

  /** Présence : appelée par le serveur quand la première connexion s'ouvre ou la dernière se ferme. */
  setOnline(playerId: string, online: boolean): void {
    if (online) {
      const wasOnline = this.online.has(playerId);
      this.online.add(playerId);
      if (!wasOnline) void this.notifier?.friendOnline(playerId).catch((err) => console.error('Notification', err));
    } else {
      this.online.delete(playerId);
      this.cancelQueue(playerId);
      void this.repo.touchLastSeen(playerId);
    }
    const duelId = this.active.get(playerId);
    if (duelId) this.duels.get(duelId)?.setConnected(playerId, online);
  }

  /** À la (re)connexion : renvoie le duel en cours, ou les résultats non vus. */
  async resync(playerId: string): Promise<void> {
    const activeId = this.active.get(playerId);
    if (activeId) return this.pushTo(playerId, this.duels.get(activeId)!);
    const user = await this.repo.user(playerId);
    const pending = user?.pending_result_duel_id;
    if (!pending) return;
    const duel = this.duels.get(pending) ?? (await this.loadFinished(pending));
    if (duel) await this.pushTo(playerId, duel);
  }

  private async loadFinished(duelId: string): Promise<Duel | null> {
    const state = await this.repo.duelState(duelId);
    if (!state) return null;
    const duel = Duel.restore(state, this.timing, this.now, () => {}, () => {});
    this.duels.set(duel.id, duel);
    return duel;
  }

  // ---- Matchmaking -------------------------------------------------------------------------

  async play(playerId: string, themeId: string, mode: 'bot' | 'pvp'): Promise<void> {
    const activeId = this.active.get(playerId);
    if (activeId) return this.pushTo(playerId, this.duels.get(activeId)!);
    if (!getTheme(themeId) || questionsOf(themeId).length < RULES.questionsPerDuel) {
      this.send(playerId, { type: 'error', code: 'unknown_theme', message: 'Thème inconnu.' });
      return;
    }
    if (!this.limiter.allow('play', playerId)) {
      this.send(playerId, { type: 'error', code: 'rate_limited', message: 'Trop de demandes, réessaie dans un instant.' });
      return;
    }
    this.cancelQueue(playerId);
    if (mode === 'bot') return this.startBotDuel(playerId, themeId);

    const waiting = this.queue.get(themeId);
    if (waiting && waiting.playerId !== playerId && !(await this.repo.isBlockedEitherWay(waiting.playerId, playerId))) {
      clearTimeout(waiting.timer);
      this.queue.delete(themeId);
      await this.startDuel(themeId, 'pvp', [await this.human(waiting.playerId, themeId), await this.human(playerId, themeId)]);
      return;
    }
    if (waiting && waiting.playerId !== playerId) {
      // Deux joueurs qui se sont bloqués ne sont jamais appariés : on joue contre le bot.
      return this.startBotDuel(playerId, themeId);
    }
    const since = this.now();
    const timer = setTimeout(() => {
      if (this.queue.get(themeId)?.playerId !== playerId) return;
      this.queue.delete(themeId);
      void this.startBotDuel(playerId, themeId);
    }, this.matchTimeoutMs);
    this.queue.set(themeId, { playerId, since, timer });
    this.send(playerId, { type: 'queued', themeId, since });
  }

  /** Duel issu d'un défi accepté entre deux joueurs réels. Refusé si l'un d'eux est déjà en duel. */
  async startChallengeDuel(fromId: string, toId: string, themeId: string): Promise<string | null> {
    if (this.active.has(fromId) || this.active.has(toId)) return null;
    this.cancelQueue(fromId);
    this.cancelQueue(toId);
    const duel = await this.startDuel(themeId, 'pvp', [await this.human(fromId, themeId), await this.human(toId, themeId)]);
    return duel.id;
  }

  cancelQueue(playerId: string): void {
    for (const [themeId, entry] of this.queue) {
      if (entry.playerId === playerId) {
        clearTimeout(entry.timer);
        this.queue.delete(themeId);
        this.send(playerId, { type: 'queueCancelled' });
      }
    }
  }

  private async human(playerId: string, themeId: string): Promise<Participant> {
    return {
      playerId,
      name: await this.repo.pseudo(playerId),
      color: null,
      isBot: false,
      rating: await this.repo.themeRating(playerId, themeId),
      connected: this.online.has(playerId),
      forfeited: false,
    };
  }

  private async startBotDuel(playerId: string, themeId: string): Promise<void> {
    const bot: Participant = {
      playerId: 'bot',
      name: BOT_NAME,
      color: null,
      isBot: true,
      rating: INITIAL_RATING,
      connected: true,
      forfeited: false,
    };
    await this.startDuel(themeId, 'bot', [await this.human(playerId, themeId), bot]);
  }

  private async startDuel(themeId: string, mode: 'bot' | 'pvp', participants: [Participant, Participant]): Promise<Duel> {
    const questions = prepareDuel(questionsOf(themeId), Math.floor(Math.random() * 2 ** 31));
    const duel = Duel.create(
      { id: randomUUID(), themeId, mode, questions, participants },
      this.timing,
      this.now,
      (d) => this.changed(d),
      (d) => void this.finished(d),
    );
    this.duels.set(duel.id, duel);
    const humans = participants.filter((p) => !p.isBot).map((p) => p.playerId);
    for (const id of humans) this.active.set(id, duel.id);
    this.writes.set(duel.id, this.repo.createDuel(structuredClone(duel.state), humans));
    this.changed(duel);
    return duel;
  }

  // ---- Actions en duel ---------------------------------------------------------------------

  private ownedDuel(playerId: string, duelId: string): Duel | null {
    const duel = this.duels.get(duelId);
    return duel && duel.participantIndex(playerId) >= 0 ? duel : null;
  }

  async answer(playerId: string, duelId: string, index: number, choice: number): Promise<void> {
    const duel = this.ownedDuel(playerId, duelId);
    if (!duel) return this.send(playerId, { type: 'error', code: 'not_in_duel', message: 'Duel introuvable.' });
    const result = duel.answer(playerId, index, choice);
    // En cas de refus (doublon, trop tard…), on renvoie l'état réel pour resynchroniser l'écran.
    if (!result.ok) await this.pushTo(playerId, duel);
  }

  forfeit(playerId: string, duelId: string): void {
    this.ownedDuel(playerId, duelId)?.forfeit(playerId);
  }

  async ackResult(playerId: string, duelId: string): Promise<void> {
    await this.repo.clearPendingResult(playerId, duelId);
  }

  // ---- Chat (duels entre joueurs réels) ----------------------------------------------------

  async chat(playerId: string, duelId: string, text: string): Promise<void> {
    const duel = this.ownedDuel(playerId, duelId);
    if (!duel || duel.state.mode !== 'pvp') return;
    const other = duel.state.participants.find((p) => p.playerId !== playerId)!;
    if (await this.repo.isBlockedEitherWay(playerId, other.playerId)) return;
    if (!this.limiter.allow('chat', playerId)) return;
    const clean = String(text ?? '').trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return;
    await this.writes.get(duelId);
    if (!(await this.repo.addDuelChat(duelId, playerId, clean, MAX_CHAT_MESSAGES))) return;
    for (const p of duel.state.participants) if (!p.isBot) await this.sendChat(p.playerId, duel);
  }

  async getChat(playerId: string, duelId: string): Promise<void> {
    const duel = this.ownedDuel(playerId, duelId);
    if (duel) await this.sendChat(playerId, duel);
  }

  private async sendChat(playerId: string, duel: Duel): Promise<void> {
    const other = duel.state.participants.find((p) => p.playerId !== playerId)!;
    const blocked = !other.isBot && (await this.repo.isBlockedEitherWay(playerId, other.playerId));
    const messages = blocked ? [] : await this.repo.duelChat(duel.id);
    this.send(playerId, { type: 'chat', duelId: duel.id, messages, canChat: duel.state.mode === 'pvp' && !blocked });
  }

  // ---- Diffusion et fin de duel ------------------------------------------------------------

  async snapshotFor(playerId: string, duel: Duel): Promise<DuelSnapshot> {
    const result = duel.isFinished ? await this.repo.result(duel.id, playerId) : null;
    return { ...duel.snapshotFor(playerId), result };
  }

  private async pushTo(playerId: string, duel: Duel): Promise<void> {
    this.send(playerId, { type: 'duel', snapshot: await this.snapshotFor(playerId, duel) });
  }

  private persist(duel: Duel): Promise<void> {
    const state = structuredClone(duel.state);
    const next = (this.writes.get(duel.id) ?? Promise.resolve()).then(() => this.repo.saveDuel(state)).catch((err) => {
      console.error('Sauvegarde du duel impossible', err);
    });
    this.writes.set(duel.id, next);
    return next;
  }

  private changed(duel: Duel): void {
    void this.persist(duel);
    // Les résultats d'un duel terminé partent après le versement des récompenses (`finished`).
    if (duel.isFinished) return;
    for (const p of duel.state.participants) {
      if (!p.isBot) this.send(p.playerId, { type: 'duel', snapshot: { ...duel.snapshotFor(p.playerId), result: null } });
    }
  }

  private async finished(duel: Duel): Promise<void> {
    await this.persist(duel);
    const results: (DuelResult | null)[] = [];
    for (const [k, p] of duel.state.participants.entries()) {
      if (p.isBot) {
        results.push(null);
        continue;
      }
      this.active.delete(p.playerId);
      results.push(await this.grantRewards(duel, k));
    }
    await this.notifyAfterDuel(duel, results).catch((err) => console.error('Notification', err));
    for (const p of duel.state.participants) {
      if (p.isBot) continue;
      await this.pushTo(p.playerId, duel);
      this.send(p.playerId, { type: 'profile', profile: await this.profile(p.playerId) });
    }
  }

  /**
   * Versement des récompenses d'un joueur pour un duel : calculé ici à partir de l'état réel
   * du duel, une seule fois par duel et par joueur (garanti par la base). Le client n'envoie jamais d'XP.
   */
  async grantRewards(duel: Duel, k: number): Promise<DuelResult | null> {
    const s = duel.state;
    const me = s.participants[k];
    const other = s.participants[1 - k];
    if (me.isBot || !s.finishedFlags) return null;
    const finishedFlag = s.finishedFlags[k];
    const mine = duel.scored(k);
    const theirs = duel.scored(1 - k);
    const outcome = duel.outcomeFor(k);
    const rewards = computeRewards({
      outcome,
      finished: finishedFlag,
      forfeited: me.forfeited,
      correct: totals(mine).correct,
      questions: s.questions.length,
    });
    const correctAnswers = mine.filter((a) => a.correct);
    return this.repo.grantOnce(s.id, me.playerId, s.themeId, me.rating, (stats, accountXp) => {
      const delta = ratingDelta(stats.rating, other.rating, outcome);
      const record: DuelRecord = {
        id: s.id,
        playedAt: s.endedAt ?? this.now(),
        themeId: s.themeId,
        opponentId: other.isBot ? null : other.playerId,
        opponentName: other.name,
        opponentIsBot: other.isBot,
        questions: duel.revealedQuestions(),
        player: mine,
        opponent: theirs,
        outcome,
        xpBefore: stats.xp,
        xpGained: rewards.total,
        ratingBefore: stats.rating,
        ratingDelta: delta,
      };
      return {
        result: {
          outcome,
          finished: finishedFlag,
          forfeited: me.forfeited,
          rewards,
          accountXpBefore: accountXp,
          accountXpAfter: accountXp + rewards.total,
          record,
        },
        newStats: {
          xp: stats.xp + rewards.total,
          rating: stats.rating + delta,
          duels: stats.duels + 1,
          wins: stats.wins + (outcome === 'win' ? 1 : 0),
          draws: stats.draws + (outcome === 'draw' ? 1 : 0),
          correct: stats.correct + correctAnswers.length,
          answered: stats.answered + mine.length,
          totalCorrectResponseMs: stats.totalCorrectResponseMs + correctAnswers.reduce((t, a) => t + a.responseMs, 0),
        },
      };
    });
  }

  /** Notifications de fin de duel : abandon, fin hors de l'application, progression, classement. */
  private async notifyAfterDuel(duel: Duel, results: (DuelResult | null)[]): Promise<void> {
    const n = this.notifier;
    if (!n) return;
    const s = duel.state;
    for (const [k, p] of s.participants.entries()) {
      const result = results[k];
      if (p.isBot || !result) continue;
      const other = s.participants[1 - k];
      const base = { duelId: s.id, themeId: s.themeId };
      if (other.forfeited && !other.isBot) {
        await n.notify(p.playerId, { type: 'opponent_forfeit', category: 'challenges', actorId: other.playerId, data: base });
      }
      if (!p.connected && !p.forfeited) {
        await n.notify(p.playerId, { type: 'duel_finished', category: 'challenges', data: { ...base, outcome: result.outcome } });
      }
      // Progression : niveau global, titre débloqué, niveau dans le thème.
      const levelBefore = levelFromXp(result.accountXpBefore).level;
      const levelAfter = levelFromXp(result.accountXpAfter).level;
      if (levelAfter > levelBefore) {
        await n.notify(p.playerId, { type: 'level_up', category: 'progression', data: { level: levelAfter } });
        const newTitles = unlockedTitles(levelAfter).filter((t) => !unlockedTitles(levelBefore).includes(t));
        for (const title of newTitles) await n.notify(p.playerId, { type: 'title_unlocked', category: 'progression', data: { title } });
      }
      const rec = result.record;
      const themeBefore = levelFromXp(rec.xpBefore).level;
      const themeAfter = levelFromXp(rec.xpBefore + rec.xpGained).level;
      if (themeAfter > themeBefore) {
        await n.notify(p.playerId, { type: 'theme_level_up', category: 'progression', data: { themeId: s.themeId, level: themeAfter } });
      }
      await this.notifyRanking(p.playerId, s.themeId, rec.ratingBefore, rec.ratingBefore + rec.ratingDelta);
    }
  }

  /** Seuls les changements importants : entrée dans le Top 100, le Top 10, la 1re place, et leurs pertes. */
  private async notifyRanking(userId: string, themeId: string, before: number, after: number): Promise<void> {
    const n = this.notifier!;
    const rankWith = async (rating: number) => {
      const [{ r }] = await this.repo.db.query<{ r: number }>(
        `SELECT 1 + count(*)::int AS r FROM theme_stats ts JOIN users u ON u.id = ts.user_id
         WHERE ts.theme_id = $1 AND ts.user_id <> $2 AND u.status <> 'banned' AND ts.rating > $3`,
        [themeId, userId, rating],
      );
      return r;
    };
    const rankBefore = await rankWith(before);
    const rankAfter = await rankWith(after);
    const data = { themeId, rank: rankAfter };
    if (rankAfter === 1 && rankBefore > 1) {
      await n.notify(userId, { type: 'rank_first', category: 'ranking', data });
      // L'ancien premier perd sa place : il est prévenu.
      const [previous] = await this.repo.db.query<{ user_id: string }>(
        `SELECT ts.user_id FROM theme_stats ts JOIN users u ON u.id = ts.user_id
         WHERE ts.theme_id = $1 AND ts.user_id <> $2 AND u.status <> 'banned' AND ts.rating >= $3 AND ts.rating < $4
         ORDER BY ts.rating DESC LIMIT 1`,
        [themeId, userId, before, after],
      );
      if (previous) await n.notify(previous.user_id, { type: 'rank_lost_first', category: 'ranking', actorId: userId, data: { themeId, rank: 2 } });
    } else if (rankAfter <= 10 && rankBefore > 10) {
      await n.notify(userId, { type: 'rank_top10', category: 'ranking', data });
    } else if (rankAfter <= 100 && rankBefore > 100) {
      await n.notify(userId, { type: 'rank_top100', category: 'ranking', data });
    } else if (rankBefore <= 10 && rankAfter > 10) {
      await n.notify(userId, { type: 'rank_left_top10', category: 'ranking', data });
    }
  }

  activeDuelOf(playerId: string): Duel | undefined {
    const id = this.active.get(playerId);
    return id ? this.duels.get(id) : undefined;
  }

  getDuel(duelId: string): Duel | undefined {
    return this.duels.get(duelId);
  }

  /** Attend la fin des écritures en cours (arrêt propre, tests). */
  async flush(): Promise<void> {
    await Promise.all(this.writes.values());
  }

  dispose(): void {
    for (const duel of this.duels.values()) duel.dispose();
    for (const entry of this.queue.values()) clearTimeout(entry.timer);
  }
}
