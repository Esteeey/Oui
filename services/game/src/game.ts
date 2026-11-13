import { createHash, randomUUID } from 'node:crypto';

import {
  BOT_NAME,
  DUEL_CHAT_MAX_LENGTH,
  FAST_ANSWER_MS,
  INITIAL_RATING,
  REWARDS,
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
  type DuelChatGif,
  type DuelChatMessage,
  type StickerId,
  type DuelQuestion,
  type DuelSnapshot,
  type PlayerAnswer,
  type Profile,
  type ServerMessage,
} from '@qu1z/shared';

import { DEFAULT_TIMING, Duel, type Participant, type Timing } from './duel';
import type { Notifier } from './notifier';
import { RateLimiter, DEFAULT_LIMITS, type Limits } from './rate-limit';
import { Quests } from './quests';
import { Repo, type UserRow } from './repo';


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

/** Multiplicateur d'XP (boost) : 1 par défaut, réglable par la variable d'environnement QU1Z_XP_MULTIPLIER (ex. 2). */
export function xpMultiplier(): number {
  const m = Number(process.env.QU1Z_XP_MULTIPLIER);
  return Number.isFinite(m) && m >= 1 && m <= 5 ? m : REWARDS.multiplier;
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
  /** Fin d'une manche de défi asynchrone (branché par les défis). */
  onChallengeLeg?: (duel: Duel, results: (DuelResult | null)[]) => Promise<void>;
  private readonly timing: Timing;
  private readonly now: () => number;
  private readonly matchTimeoutMs: number;
  private readonly send: GameOptions['send'];
  private readonly duels = new Map<string, Duel>();
  /** Joueur → duel en cours (non terminé). */
  private readonly active = new Map<string, string>();
  /** Réserve brièvement les deux comptes pendant la préparation d'un duel invité. */
  private readonly inviteReservations = new Set<string>();
  private readonly online = new Set<string>();
  /** Comptes admin connus (vus à la connexion) : eux seuls reçoivent la bonne réponse du mode triche. */
  private readonly admins = new Set<string>();
  private readonly queue = new Map<string, { playerId: string; since: number; timer: ReturnType<typeof setTimeout> }>();
  /** Écritures d'un duel, enchaînées pour garder leur ordre. */
  private readonly writes = new Map<string, Promise<void>>();
  /** Mini chat de fin de match, gardé en mémoire (30 derniers messages par duel). */
  private readonly chats = new Map<string, DuelChatMessage[]>();
  /** Joueurs présents sur l'écran de fin, par duel en mémoire. */
  private readonly onResults = new Map<string, Set<string>>();
  /** Défis du jour (objectifs quotidiens). */
  readonly quests: Quests;

  constructor(options: GameOptions) {
    this.repo = options.repo;
    this.timing = options.timing ?? DEFAULT_TIMING;
    this.now = options.now ?? Date.now;
    this.matchTimeoutMs = options.matchTimeoutMs ?? 10_000;
    this.limiter = new RateLimiter({ ...DEFAULT_LIMITS, ...options.limits } as Limits, this.now);
    this.send = options.send;
    this.quests = new Quests(this.repo.db, this.now);
  }

  /** Reprise des duels non terminés : ils continuent selon l'horloge réelle. */
  async restore(): Promise<void> {
    for (const state of await this.repo.unfinishedDuels()) {
      for (const p of state.participants) if (!p.isBot && !p.ghost) p.connected = false;
      const duel = Duel.restore(state, this.timing, this.now, (d) => this.changed(d), (d) => void this.finished(d));
      this.duels.set(duel.id, duel);
      for (const p of state.participants) if (!p.isBot && !p.ghost) this.active.set(p.playerId, duel.id);
    }
  }

  // ---- Comptes -----------------------------------------------------------------------------

  /** Retrouve un joueur par son jeton (obtenu à l'inscription ou à la connexion). Refuse les comptes bannis. */
  async hello(token?: string): Promise<{ user: UserRow; token: string } | { error: 'banned' | 'unauthenticated' }> {
    const user = token ? await this.repo.userByTokenHash(hashToken(token)) : null;
    if (!user || !token) return { error: 'unauthenticated' };
    if (user.status === 'banned') return { error: 'banned' };
    if (user.role === 'admin') this.admins.add(user.id);
    else this.admins.delete(user.id);
    return { user, token };
  }

  /** Compte associé au jeton ; un compte banni n'est renvoyé que si `allowBanned` (consultation des sanctions et appel). */
  async authenticate(token: string, options: { allowBanned?: boolean } = {}): Promise<UserRow | null> {
    const user = await this.repo.userByTokenHash(hashToken(token));
    if (!user) return null;
    return user.status !== 'banned' || options.allowBanned ? user : null;
  }

  profile(playerId: string): Promise<Profile> {
    return this.repo.profile(playerId);
  }

  /** Renvoie le profil à jour à toutes les connexions du joueur (pseudo, photo…). */
  async pushProfile(playerId: string): Promise<void> {
    this.send(playerId, { type: 'profile', profile: await this.profile(playerId) });
  }

  isOnline(playerId: string): boolean {
    return this.online.has(playerId);
  }

  hasActiveDuel(playerId: string): boolean { return this.active.has(playerId) || this.inviteReservations.has(playerId); }

  /** Crée le même duel PVP que le matchmaking, avec les deux comptes attachés à une unique session. */
  async startLiveInviteDuel(senderId: string, receiverId: string, themeId: string): Promise<Duel | null> {
    if (senderId === receiverId || !this.isOnline(receiverId) || this.hasActiveDuel(senderId) || this.hasActiveDuel(receiverId)) return null;
    this.inviteReservations.add(senderId); this.inviteReservations.add(receiverId);
    try {
      if (this.active.has(senderId) || this.active.has(receiverId)) return null;
      this.cancelQueue(senderId); this.cancelQueue(receiverId);
      const sender = await this.human(senderId, themeId);
      const receiver = await this.human(receiverId, themeId);
      if (!this.isOnline(receiverId) || this.active.has(senderId) || this.active.has(receiverId)) return null;
      sender.connected = this.isOnline(senderId);
      receiver.connected = true;
      return await this.startDuel(themeId, 'pvp', [sender, receiver]);
    } finally {
      this.inviteReservations.delete(senderId); this.inviteReservations.delete(receiverId);
    }
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
    if (this.inviteReservations.has(playerId)) return;
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

  /**
   * Défi asynchrone, manche 1 : l'invitant joue tout de suite ses 7 questions ; l'ami (absent) les rejouera
   * plus tard. Refusé (null) si l'invitant est déjà en duel.
   */
  async startChallengeLeg1(fromId: string, toId: string, themeId: string, challengeId: string): Promise<Duel | null> {
    if (this.hasActiveDuel(fromId)) return null;
    this.cancelQueue(fromId);
    this.inviteReservations.add(fromId);
    try {
      const friend: Participant = { ...(await this.human(toId, themeId)), ghost: 'pending', connected: true };
      const sender = await this.human(fromId, themeId);
      if (this.active.has(fromId)) return null;
      return await this.startDuel(themeId, 'pvp', [sender, friend], { challenge: { id: challengeId, leg: 1 } });
    } finally { this.inviteReservations.delete(fromId); }
  }

  /** Défi asynchrone, manche 2 : l'ami rejoue les MÊMES questions contre les réponses enregistrées de l'invitant. */
  async startChallengeLeg2(
    toId: string,
    fromId: string,
    themeId: string,
    challengeId: string,
    questions: DuelQuestion[],
    script: PlayerAnswer[],
  ): Promise<Duel | null> {
    if (this.hasActiveDuel(toId)) return null;
    this.cancelQueue(toId);
    const challenger: Participant = { ...(await this.human(fromId, themeId)), ghost: 'replay', script, connected: true };
    const player = await this.human(toId, themeId);
    if (this.active.has(toId) || this.inviteReservations.has(toId)) return null;
    return this.startDuel(themeId, 'pvp', [player, challenger], { questions, challenge: { id: challengeId, leg: 2 } });
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
      avatar: await this.repo.avatar(playerId),
      cover: await this.repo.cover(playerId),
      isBot: false,
      rating: await this.repo.themeRating(playerId, themeId),
      connected: this.online.has(playerId),
      forfeited: false,
    };
  }

  private async startBotDuel(playerId: string, themeId: string): Promise<void> {
    if (this.hasActiveDuel(playerId)) return;
    this.inviteReservations.add(playerId);
    try {
    const bot: Participant = {
      playerId: 'bot',
      name: BOT_NAME,
      color: null,
      isBot: true,
      level: levelFromXp(await this.repo.themeXp(playerId, themeId)).level,
      rating: INITIAL_RATING,
      connected: true,
      forfeited: false,
    };
    const player = await this.human(playerId, themeId);
    if (this.active.has(playerId)) return;
    await this.startDuel(themeId, 'bot', [player, bot]);
    } finally { this.inviteReservations.delete(playerId); }
  }

  private async startDuel(
    themeId: string,
    mode: 'bot' | 'pvp',
    participants: [Participant, Participant],
    options: { questions?: DuelQuestion[]; challenge?: { id: string; leg: 1 | 2 } } = {},
  ): Promise<Duel> {
    const questions = options.questions ?? prepareDuel(questionsOf(themeId), Math.floor(Math.random() * 2 ** 31));
    const duel = Duel.create(
      { id: randomUUID(), themeId, mode, questions, participants, challenge: options.challenge ?? null },
      this.timing,
      this.now,
      (d) => this.changed(d),
      (d) => void this.finished(d),
    );
    this.duels.set(duel.id, duel);
    // Joueurs réels du duel (pour l'historique) : l'ami qui jouera plus tard n'en fait pas encore partie.
    const humans = participants.filter((p) => !p.isBot && p.ghost !== 'pending').map((p) => p.playerId);
    for (const p of participants) if (!p.isBot && !p.ghost) this.active.set(p.playerId, duel.id);
    this.writes.set(duel.id, this.repo.createDuel(structuredClone(duel.state), humans));
    this.changed(duel);
    return duel;
  }

  // ---- Actions en duel ---------------------------------------------------------------------

  private ownedDuel(playerId: string, duelId: string): Duel | null {
    const duel = this.duels.get(duelId);
    return duel && duel.participantIndex(playerId) >= 0 ? duel : null;
  }

  async answer(playerId: string, duelId: string, index: number, choice: number, elapsedMs?: number): Promise<void> {
    const duel = this.ownedDuel(playerId, duelId);
    if (!duel) return this.send(playerId, { type: 'error', code: 'not_in_duel', message: 'Duel introuvable.' });
    const result = duel.answer(playerId, index, choice, elapsedMs);
    // En cas de refus (doublon, trop tard…), on renvoie l'état réel pour resynchroniser l'écran.
    if (!result.ok) await this.pushTo(playerId, duel);
  }

  /**
   * Duel du joueur, en mémoire ou déjà terminé et enregistré, avec la clé de son chat : un défi partage un seul
   * chat entre ses deux manches, un duel en direct a le sien.
   */
  private async chatContext(playerId: string, duelId: string): Promise<{ key: string; otherId: string; ghost: boolean } | null> {
    const duel = this.duels.get(duelId) ?? (await this.loadFinished(duelId).catch(() => null));
    if (!duel) return null;
    const me = duel.state.participants.findIndex((p) => p.playerId === playerId);
    if (me < 0) return null;
    const other = duel.state.participants[1 - me];
    const challenge = duel.state.challenge;
    if (other.ghost && !challenge) return null;
    return { key: challenge ? `challenge:${challenge.id}` : duelId, otherId: other.playerId, ghost: !!other.ghost };
  }

  /** Amis = abonnés l'un à l'autre. Seuls leurs messages de fin de partie sont enregistrés. */
  private async areFriends(a: string, b: string): Promise<boolean> {
    const rows = await this.repo.db.query(
      `SELECT 1 FROM follows f1 JOIN follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id
       WHERE f1.follower_id = $1 AND f1.followee_id = $2`,
      [a, b],
    );
    return rows.length > 0;
  }

  /**
   * Mini chat de fin de partie entre deux joueurs réels (jamais le bot). Texte de 1 à 140 caractères, limité
   * contre le spam, jamais entre joueurs qui se sont bloqués. Entre amis, les messages sont enregistrés
   * (ils restent visibles, défis compris) ; entre inconnus, ils ne vivent que le temps du duel en direct.
   */
  async duelChat(playerId: string, duelId: string, text: string, extra: { stickerId?: StickerId; gif?: DuelChatGif } = {}): Promise<void> {
    const ctx = await this.chatContext(playerId, duelId);
    if (!ctx) return this.send(playerId, { type: 'error', code: 'not_in_duel', message: 'Duel introuvable.' });
    const clean = extra.stickerId || extra.gif ? '' : text.replace(/\s+/g, ' ').trim().slice(0, DUEL_CHAT_MAX_LENGTH);
    if (!clean && !extra.stickerId && !extra.gif) return;
    if (!this.limiter.allow('chat', playerId)) return this.send(playerId, { type: 'error', code: 'rate_limited', message: 'Doucement : trop de messages.' });
    const blocked = await this.repo.db.query(
      'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
      [playerId, ctx.otherId],
    );
    if (blocked.length) return;
    const friends = await this.areFriends(playerId, ctx.otherId);
    // Un défi rejoué contre un inconnu n'a personne en face : rien à envoyer.
    if (ctx.ghost && !friends) return;
    const message: DuelChatMessage = { from: playerId, text: clean, at: this.now(), ...(extra.stickerId ? { stickerId: extra.stickerId } : extra.gif ? { gif: extra.gif } : {}) };
    if (friends) {
      await this.repo.db.query('INSERT INTO friend_duel_chat (chat_key, from_id, to_id, message) VALUES ($1, $2, $3, $4)', [
        ctx.key,
        playerId,
        ctx.otherId,
        JSON.stringify(message),
      ]);
    } else {
      this.chats.set(ctx.key, [...(this.chats.get(ctx.key) ?? []), message].slice(-30));
    }
    for (const id of [playerId, ctx.otherId]) this.send(id, { type: 'duelChat', duelId, messages: [message] });
  }

  async duelChatHistory(playerId: string, duelId: string): Promise<void> {
    const ctx = await this.chatContext(playerId, duelId);
    if (!ctx) return;
    const saved = await this.repo.db.query<{ message: DuelChatMessage }>(
      'SELECT message FROM friend_duel_chat WHERE chat_key = $1 AND $2 IN (from_id, to_id) ORDER BY id DESC LIMIT 30',
      [ctx.key, playerId],
    );
    const messages = [...saved.map((r) => r.message).reverse(), ...(this.chats.get(ctx.key) ?? [])].sort((x, y) => x.at - y.at);
    this.send(playerId, { type: 'duelChat', duelId, messages });
  }

  forfeit(playerId: string, duelId: string): void {
    this.ownedDuel(playerId, duelId)?.forfeit(playerId);
  }

  /** Rouvre les résultats d'un duel terminé (depuis une notification), réservé à ses participants. */
  /**
   * Présence sur l'écran de fin, juste après un duel en direct contre un joueur réel : prévient l'adversaire,
   * et à l'arrivée renvoie au joueur l'état de l'adversaire. Sans effet une fois le duel retiré de la mémoire.
   */
  resultsPresence(playerId: string, duelId: string, on: boolean): void {
    const duel = this.duels.get(duelId);
    const me = duel ? duel.participantIndex(playerId) : -1;
    if (!duel || me < 0) return;
    const other = duel.state.participants[1 - me];
    if (other.isBot || other.ghost) return;
    const present = this.onResults.get(duelId) ?? new Set<string>();
    if (on) present.add(playerId);
    else present.delete(playerId);
    if (present.size) this.onResults.set(duelId, present);
    else this.onResults.delete(duelId);
    this.send(other.playerId, { type: 'opponentPresence', duelId, on });
    if (on) this.send(playerId, { type: 'opponentPresence', duelId, on: present.has(other.playerId) });
  }

  async viewResult(playerId: string, duelId: string): Promise<void> {
    if (this.active.has(playerId)) return;
    const duel = this.duels.get(duelId) ?? (await this.loadFinished(duelId).catch(() => null));
    if (!duel || !duel.isFinished || !duel.state.participants.some((p) => p.playerId === playerId)) return;
    await this.pushTo(playerId, duel);
  }

  async ackResult(playerId: string, duelId: string): Promise<void> {
    await this.repo.clearPendingResult(playerId, duelId);
  }

  // ---- Diffusion et fin de duel ------------------------------------------------------------

  async snapshotFor(playerId: string, duel: Duel): Promise<DuelSnapshot> {
    const result = duel.isFinished ? await this.repo.result(duel.id, playerId) : null;
    return { ...this.cheat(playerId, duel), result };
  }

  /** Vue du duel, plus la bonne réponse pendant la question pour un admin (mode triche, réservé aux tests). */
  private cheat(playerId: string, duel: Duel): Omit<DuelSnapshot, 'result'> {
    const snap = duel.snapshotFor(playerId);
    if (!this.admins.has(playerId) || snap.phase !== 'answering') return snap;
    return { ...snap, cheatIndex: duel.state.questions[duel.state.index].correctIndex };
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
      if (!p.isBot && !p.ghost) this.send(p.playerId, { type: 'duel', snapshot: { ...this.cheat(p.playerId, duel), result: null } });
    }
  }

  private async finished(duel: Duel): Promise<void> {
    await this.persist(duel);
    const leg = duel.state.challenge?.leg;
    const results: (DuelResult | null)[] = [];
    for (const [k, p] of duel.state.participants.entries()) {
      if (!p.ghost) this.active.delete(p.playerId);
      // Manche 1 d'un défi : pas encore de résultat (il dépend de la partie de l'ami).
      if (p.isBot || p.ghost === 'pending' || leg === 1) {
        results.push(null);
        continue;
      }
      results.push(await this.grantRewards(duel, k));
    }
    await this.recordQuests(duel, results).catch((err) => console.error('Défis du jour', err));
    await this.notifyAfterDuel(duel, results).catch((err) => console.error('Notification', err));
    if (leg) await this.onChallengeLeg?.(duel, results).catch((err) => console.error('Défi', err));
    for (const p of duel.state.participants) {
      if (p.isBot || p.ghost === 'pending') continue;
      // L'invitant rejoué n'est pas dans ce duel : il verra le résultat à sa prochaine connexion.
      if (p.ghost !== 'replay') await this.pushTo(p.playerId, duel);
      this.send(p.playerId, { type: 'profile', profile: await this.profile(p.playerId) });
    }
  }

  /** Défis du jour : chaque joueur récompensé fait avancer ses objectifs (le serveur compte, pas le téléphone). */
  private async recordQuests(duel: Duel, results: (DuelResult | null)[]): Promise<void> {
    for (const [k, p] of duel.state.participants.entries()) {
      const result = results[k];
      if (p.isBot || !result) continue;
      const mine = duel.scored(k);
      const correct = mine.filter((a) => a.correct);
      await this.quests.record(p.playerId, {
        themeId: duel.state.themeId,
        outcome: result.outcome,
        finished: result.finished && !result.forfeited,
        correct: correct.length,
        fast: correct.filter((a) => a.responseMs < FAST_ANSWER_MS).length,
        score: totals(mine).points,
      });
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
      score: totals(mine).points,
      finished: finishedFlag,
      forfeited: me.forfeited,
      opponentForfeited: other.forfeited,
      multiplier: xpMultiplier(),
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
