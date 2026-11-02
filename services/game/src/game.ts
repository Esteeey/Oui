import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  BOT_NAME,
  DEMO_OPPONENTS,
  INITIAL_RATING,
  RULES,
  computeRewards,
  getTheme,
  prepareDuel,
  questionsOf,
  ratingDelta,
  totals,
  type ChatMessage,
  type DuelRecord,
  type DuelResult,
  type DuelSnapshot,
  type Profile,
  type ServerMessage,
  type ThemeStats,
} from '@qu1z/shared';

import { DEFAULT_TIMING, Duel, type Participant, type Timing } from './duel';
import { Store, type PlayerRecord } from './store';

export const MAX_CHAT_LENGTH = 200;
const MAX_CHAT_MESSAGES = 100;
const HISTORY_SIZE = 30;

const EMPTY_STATS: ThemeStats = {
  xp: 0,
  rating: INITIAL_RATING,
  duels: 0,
  wins: 0,
  draws: 0,
  correct: 0,
  answered: 0,
  totalCorrectResponseMs: 0,
};

export interface GameOptions {
  store?: Store;
  timing?: Timing;
  now?: () => number;
  /** Attente d'un adversaire réel avant de proposer le bot. */
  matchTimeoutMs?: number;
  /** Envoi d'un message à toutes les connexions d'un joueur (fourni par le serveur WebSocket). */
  send: (playerId: string, message: ServerMessage) => void;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Logique du serveur de jeu, indépendante du transport : comptes, matchmaking,
 * duels, récompenses (calculées et versées ici uniquement), reconnexion, chat.
 */
export class Game {
  readonly store: Store;
  private readonly timing: Timing;
  private readonly now: () => number;
  private readonly matchTimeoutMs: number;
  private readonly send: GameOptions['send'];
  private readonly duels = new Map<string, Duel>();
  /** Joueur → duel en cours (non terminé). */
  private readonly active = new Map<string, string>();
  private readonly online = new Set<string>();
  private readonly queue = new Map<string, { playerId: string; since: number; timer: ReturnType<typeof setTimeout> }>();

  constructor(options: GameOptions) {
    this.store = options.store ?? new Store(null);
    this.timing = options.timing ?? DEFAULT_TIMING;
    this.now = options.now ?? Date.now;
    this.matchTimeoutMs = options.matchTimeoutMs ?? 10_000;
    this.send = options.send;
    this.store.prune(this.now());
    // Reprise des duels enregistrés : ils continuent selon l'horloge réelle.
    for (const state of Object.values(this.store.data.duels)) {
      for (const p of state.participants) if (!p.isBot) p.connected = false;
      const duel = Duel.restore(state, this.timing, this.now, (d) => this.changed(d), (d) => this.finished(d));
      this.duels.set(duel.id, duel);
      if (!duel.isFinished) for (const p of state.participants) if (!p.isBot) this.active.set(p.playerId, duel.id);
    }
  }

  // ---- Comptes -----------------------------------------------------------------------------

  /** Retrouve un joueur par son jeton, ou crée un compte invité. */
  hello(token?: string): { player: PlayerRecord; token: string } {
    if (token) {
      const hash = hashToken(token);
      const player = Object.values(this.store.data.players).find((p) => p.tokenHash === hash);
      if (player) return { player, token };
    }
    const newToken = randomBytes(32).toString('hex');
    const player: PlayerRecord = {
      id: randomUUID(),
      tokenHash: hashToken(newToken),
      name: `Joueur ${1000 + Math.floor(Math.random() * 9000)}`,
      xp: 0,
      stats: {},
      history: [],
      rewardedDuels: [],
      pendingResult: null,
    };
    this.store.data.players[player.id] = player;
    this.store.save();
    return { player, token: newToken };
  }

  profile(playerId: string): Profile {
    const p = this.store.data.players[playerId];
    return { id: p.id, name: p.name, xp: p.xp, stats: p.stats, history: p.history };
  }

  /** Présence : appelée par le serveur quand la première connexion s'ouvre ou la dernière se ferme. */
  setOnline(playerId: string, online: boolean): void {
    if (online) this.online.add(playerId);
    else {
      this.online.delete(playerId);
      this.cancelQueue(playerId);
    }
    const duelId = this.active.get(playerId);
    if (duelId) this.duels.get(duelId)?.setConnected(playerId, online);
  }

  /** À la (re)connexion : renvoie le duel en cours, ou les résultats non vus. */
  resync(playerId: string): void {
    const activeId = this.active.get(playerId);
    if (activeId) {
      this.pushTo(playerId, this.duels.get(activeId)!);
      return;
    }
    const pending = this.store.data.players[playerId]?.pendingResult;
    if (pending && this.duels.has(pending)) this.pushTo(playerId, this.duels.get(pending)!);
  }

  // ---- Matchmaking -------------------------------------------------------------------------

  play(playerId: string, themeId: string, mode: 'bot' | 'pvp', opponentId?: string): void {
    const activeId = this.active.get(playerId);
    if (activeId) {
      this.pushTo(playerId, this.duels.get(activeId)!);
      return;
    }
    if (!getTheme(themeId) || questionsOf(themeId).length < RULES.questionsPerDuel) {
      this.send(playerId, { type: 'error', code: 'unknown_theme', message: 'Thème inconnu.' });
      return;
    }
    this.cancelQueue(playerId);
    if (mode === 'bot') {
      this.startBotDuel(playerId, themeId, opponentId);
      return;
    }
    const waiting = this.queue.get(themeId);
    if (waiting && waiting.playerId !== playerId) {
      clearTimeout(waiting.timer);
      this.queue.delete(themeId);
      this.startDuel(themeId, 'pvp', [this.human(waiting.playerId, themeId), this.human(playerId, themeId)]);
      return;
    }
    const since = this.now();
    const timer = setTimeout(() => {
      if (this.queue.get(themeId)?.playerId !== playerId) return;
      this.queue.delete(themeId);
      this.startBotDuel(playerId, themeId);
    }, this.matchTimeoutMs);
    this.queue.set(themeId, { playerId, since, timer });
    this.send(playerId, { type: 'queued', themeId, since });
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

  private human(playerId: string, themeId: string): Participant {
    const p = this.store.data.players[playerId];
    return {
      playerId,
      name: p.name,
      color: null,
      isBot: false,
      rating: p.stats[themeId]?.rating ?? INITIAL_RATING,
      connected: this.online.has(playerId),
      forfeited: false,
    };
  }

  private startBotDuel(playerId: string, themeId: string, opponentId?: string): void {
    const demo = opponentId ? DEMO_OPPONENTS[opponentId] : undefined;
    const bot: Participant = {
      playerId: demo ? `bot:${opponentId}` : 'bot',
      name: demo?.name ?? BOT_NAME,
      color: demo?.color ?? null,
      isBot: true,
      rating: INITIAL_RATING,
      connected: true,
      forfeited: false,
    };
    this.startDuel(themeId, 'bot', [this.human(playerId, themeId), bot]);
  }

  private startDuel(themeId: string, mode: 'bot' | 'pvp', participants: [Participant, Participant]): Duel {
    const questions = prepareDuel(questionsOf(themeId), Math.floor(Math.random() * 2 ** 31));
    const duel = Duel.create(
      { id: randomUUID(), themeId, mode, questions, participants },
      this.timing,
      this.now,
      (d) => this.changed(d),
      (d) => this.finished(d),
    );
    this.duels.set(duel.id, duel);
    for (const p of participants) if (!p.isBot) this.active.set(p.playerId, duel.id);
    this.changed(duel);
    return duel;
  }

  // ---- Actions en duel ---------------------------------------------------------------------

  private ownedDuel(playerId: string, duelId: string): Duel | null {
    const duel = this.duels.get(duelId);
    return duel && duel.participantIndex(playerId) >= 0 ? duel : null;
  }

  answer(playerId: string, duelId: string, index: number, choice: number): void {
    const duel = this.ownedDuel(playerId, duelId);
    if (!duel) return this.send(playerId, { type: 'error', code: 'not_in_duel', message: 'Duel introuvable.' });
    const result = duel.answer(playerId, index, choice);
    // En cas de refus (doublon, trop tard…), on renvoie l'état réel pour resynchroniser l'écran.
    if (!result.ok) this.pushTo(playerId, duel);
  }

  forfeit(playerId: string, duelId: string): void {
    this.ownedDuel(playerId, duelId)?.forfeit(playerId);
  }

  ackResult(playerId: string, duelId: string): void {
    const p = this.store.data.players[playerId];
    if (p?.pendingResult === duelId) {
      p.pendingResult = null;
      this.store.save();
    }
  }

  // ---- Chat (duels entre joueurs réels) ----------------------------------------------------

  chat(playerId: string, duelId: string, text: string): void {
    const duel = this.ownedDuel(playerId, duelId);
    if (!duel || duel.state.mode !== 'pvp') return;
    const clean = String(text ?? '').trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return;
    const list = (this.store.data.chats[duelId] ??= []);
    if (list.length >= MAX_CHAT_MESSAGES) return;
    list.push({ id: randomUUID(), fromId: playerId, text: clean, at: this.now() });
    this.store.save();
    for (const p of duel.state.participants) if (!p.isBot) this.sendChat(p.playerId, duel);
  }

  getChat(playerId: string, duelId: string): void {
    const duel = this.ownedDuel(playerId, duelId);
    if (duel) this.sendChat(playerId, duel);
  }

  private sendChat(playerId: string, duel: Duel): void {
    const messages: ChatMessage[] = this.store.data.chats[duel.id] ?? [];
    this.send(playerId, { type: 'chat', duelId: duel.id, messages, canChat: duel.state.mode === 'pvp' });
  }

  // ---- Diffusion et fin de duel ------------------------------------------------------------

  snapshotFor(playerId: string, duel: Duel): DuelSnapshot {
    const result = duel.isFinished ? (this.store.data.results[`${duel.id}:${playerId}`] ?? null) : null;
    return { ...duel.snapshotFor(playerId), result };
  }

  private pushTo(playerId: string, duel: Duel): void {
    this.send(playerId, { type: 'duel', snapshot: this.snapshotFor(playerId, duel) });
  }

  private changed(duel: Duel): void {
    this.store.data.duels[duel.id] = duel.state;
    this.store.save();
    // Les résultats d'un duel terminé partent après le versement des récompenses (`finished`).
    if (duel.isFinished) return;
    for (const p of duel.state.participants) if (!p.isBot) this.pushTo(p.playerId, duel);
  }

  private finished(duel: Duel): void {
    for (const [k, p] of duel.state.participants.entries()) {
      if (p.isBot) continue;
      this.active.delete(p.playerId);
      this.grantRewards(duel, k);
    }
    this.store.save();
    for (const p of duel.state.participants) {
      if (p.isBot) continue;
      this.pushTo(p.playerId, duel);
      this.send(p.playerId, { type: 'profile', profile: this.profile(p.playerId) });
    }
  }

  /**
   * Versement des récompenses d'un joueur pour un duel : calculé ici à partir de l'état réel
   * du duel, une seule fois par duel et par joueur (idempotent). Le client n'envoie jamais d'XP.
   */
  grantRewards(duel: Duel, k: number): DuelResult | null {
    const s = duel.state;
    const me = s.participants[k];
    const other = s.participants[1 - k];
    const player = this.store.data.players[me.playerId];
    if (!player || !s.finishedFlags) return null;
    const key = `${s.id}:${me.playerId}`;
    if (player.rewardedDuels.includes(s.id)) return this.store.data.results[key] ?? null;

    const mine = duel.scored(k);
    const theirs = duel.scored(1 - k);
    const outcome = duel.outcomeFor(k);
    const rewards = computeRewards({
      outcome,
      finished: s.finishedFlags[k],
      forfeited: me.forfeited,
      correct: totals(mine).correct,
      questions: s.questions.length,
    });
    const stats = player.stats[s.themeId] ?? { ...EMPTY_STATS, rating: me.rating };
    const delta = ratingDelta(stats.rating, other.rating, outcome);
    const correctAnswers = mine.filter((a) => a.correct);
    const record: DuelRecord = {
      id: s.id,
      playedAt: s.endedAt ?? this.now(),
      themeId: s.themeId,
      opponentId: other.isBot ? (other.playerId.startsWith('bot:') ? other.playerId.slice(4) : null) : other.playerId,
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
    const accountXpBefore = player.xp;
    player.stats[s.themeId] = {
      xp: stats.xp + rewards.total,
      rating: stats.rating + delta,
      duels: stats.duels + 1,
      wins: stats.wins + (outcome === 'win' ? 1 : 0),
      draws: stats.draws + (outcome === 'draw' ? 1 : 0),
      correct: stats.correct + correctAnswers.length,
      answered: stats.answered + mine.length,
      totalCorrectResponseMs: stats.totalCorrectResponseMs + correctAnswers.reduce((t, a) => t + a.responseMs, 0),
    };
    player.xp += rewards.total;
    player.history = [record, ...player.history].slice(0, HISTORY_SIZE);
    player.rewardedDuels = [...player.rewardedDuels, s.id].slice(-1000);
    player.pendingResult = s.id;
    const result: DuelResult = {
      outcome,
      finished: s.finishedFlags[k],
      forfeited: me.forfeited,
      rewards,
      accountXpBefore,
      accountXpAfter: player.xp,
      record,
    };
    this.store.data.results[key] = result;
    return result;
  }

  activeDuelOf(playerId: string): Duel | undefined {
    const id = this.active.get(playerId);
    return id ? this.duels.get(id) : undefined;
  }

  getDuel(duelId: string): Duel | undefined {
    return this.duels.get(duelId);
  }

  dispose(): void {
    for (const duel of this.duels.values()) duel.dispose();
    for (const entry of this.queue.values()) clearTimeout(entry.timer);
  }
}
