import {
  RULES,
  botAnswer,
  duelOutcome,
  readingTimeMs,
  scoreAnswers,
  totals,
  type DuelOutcome,
  type DuelPhase,
  type DuelQuestion,
  type DuelSnapshot,
  type ParticipantView,
  type PlayerAnswer,
} from '@qu1z/shared';

/** Durées du duel. Les tests les raccourcissent ; en production ce sont les règles du jeu. */
export interface Timing {
  introMs: number;
  answerMs: number;
  revealMs: number;
  readingMs: (q: DuelQuestion) => number;
  /** Tolérance réseau identique pour tous les joueurs, après la fin du chrono. */
  latencyGraceMs: number;
}

export const DEFAULT_TIMING: Timing = {
  introMs: RULES.introMs,
  answerMs: RULES.answerTimeMs,
  revealMs: RULES.revealMs,
  readingMs: (q) => readingTimeMs(q.text, !!q.image),
  latencyGraceMs: 300,
};

export interface Participant {
  playerId: string;
  name: string;
  color: string | null;
  isBot: boolean;
  rating: number;
  connected: boolean;
  forfeited: boolean;
}

export interface DuelState {
  id: string;
  themeId: string;
  mode: 'bot' | 'pvp';
  createdAt: number;
  questions: DuelQuestion[];
  participants: [Participant, Participant];
  phase: DuelPhase;
  index: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** Réponses par participant et par question (`null` = pas encore répondu). */
  answers: [(PlayerAnswer | null)[], (PlayerAnswer | null)[]];
  /** Nombre de questions entièrement révélées. */
  revealed: number;
  endedAt: number | null;
  /** Présent à la fin (sans abandon), fixé au moment où le duel se termine. */
  finishedFlags: [boolean, boolean] | null;
}

export type AnswerResult = { ok: true } | { ok: false; code: string };

const NO_ANSWER = (ms: number): PlayerAnswer => ({ choice: null, responseMs: ms });

/**
 * Un duel piloté par le serveur : il avance avec ses propres minuteries,
 * que les joueurs soient connectés ou non. Il n'est jamais mis en pause.
 */
export class Duel {
  state: DuelState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private finishEmitted = false;

  constructor(
    state: DuelState,
    private readonly timing: Timing,
    private readonly now: () => number,
    private readonly onChange: (duel: Duel) => void,
    private readonly onFinish: (duel: Duel) => void,
  ) {
    this.state = state;
  }

  static create(
    init: { id: string; themeId: string; mode: 'bot' | 'pvp'; questions: DuelQuestion[]; participants: [Participant, Participant] },
    timing: Timing,
    now: () => number,
    onChange: (duel: Duel) => void,
    onFinish: (duel: Duel) => void,
  ): Duel {
    const t = now();
    const duel = new Duel(
      {
        ...init,
        createdAt: t,
        phase: 'intro',
        index: 0,
        phaseStartedAt: t,
        phaseEndsAt: t + timing.introMs,
        answers: [init.questions.map(() => null), init.questions.map(() => null)],
        revealed: 0,
        endedAt: null,
        finishedFlags: null,
      },
      timing,
      now,
      onChange,
      onFinish,
    );
    duel.schedule();
    return duel;
  }

  /** Reprend un duel enregistré (redémarrage du serveur) là où il en est réellement. */
  static restore(
    state: DuelState,
    timing: Timing,
    now: () => number,
    onChange: (duel: Duel) => void,
    onFinish: (duel: Duel) => void,
  ): Duel {
    const duel = new Duel(state, timing, now, onChange, onFinish);
    if (state.phase === 'finished') duel.finishEmitted = true;
    else duel.schedule();
    return duel;
  }

  get id(): string {
    return this.state.id;
  }

  get isFinished(): boolean {
    return this.state.phase === 'finished';
  }

  participantIndex(playerId: string): number {
    return this.state.participants.findIndex((p) => p.playerId === playerId);
  }

  // ---- Déroulé ----------------------------------------------------------------------------

  /** Programme la fin de la phase en cours d'après l'horloge du serveur. */
  private schedule(): void {
    this.clearTimers();
    const s = this.state;
    if (s.phase === 'finished') return;
    const delay = Math.max(0, s.phaseEndsAt - this.now());
    const grace = s.phase === 'answering' ? this.timing.latencyGraceMs : 0;
    this.timer = setTimeout(() => this.advance(), delay + grace);
    if (s.phase === 'answering') this.scheduleBot();
  }

  private scheduleBot(): void {
    const s = this.state;
    s.participants.forEach((p, k) => {
      if (!p.isBot || s.answers[k][s.index]) return;
      const plan = botAnswer(s.questions[s.index]);
      if (plan.choice === null) return;
      const elapsed = this.now() - s.phaseStartedAt;
      const wait = Math.max(0, plan.responseMs - elapsed);
      if (plan.responseMs >= this.timing.answerMs) return;
      this.botTimer = setTimeout(() => this.record(k, plan.choice!, plan.responseMs), wait);
    });
  }

  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.timer = null;
    this.botTimer = null;
  }

  private setPhase(phase: DuelPhase, durationMs: number): void {
    const t = this.now();
    this.state.phase = phase;
    this.state.phaseStartedAt = t;
    this.state.phaseEndsAt = t + durationMs;
  }

  private advance(): void {
    const s = this.state;
    switch (s.phase) {
      case 'intro':
        this.enterReading(0);
        break;
      case 'reading':
        this.setPhase('answering', this.timing.answerMs);
        this.schedule();
        this.onChange(this);
        break;
      case 'answering':
        this.enterReveal();
        break;
      case 'reveal':
        if (s.index + 1 < s.questions.length) this.enterReading(s.index + 1);
        else this.finish();
        break;
      default:
        break;
    }
  }

  private enterReading(index: number): void {
    this.state.index = index;
    this.setPhase('reading', this.timing.readingMs(this.state.questions[index]));
    this.schedule();
    this.onChange(this);
  }

  private enterReveal(): void {
    const s = this.state;
    for (const k of [0, 1] as const) {
      if (!s.answers[k][s.index]) s.answers[k][s.index] = NO_ANSWER(this.timing.answerMs);
    }
    s.revealed = s.index + 1;
    this.setPhase('reveal', this.timing.revealMs);
    this.schedule();
    this.onChange(this);
  }

  private finish(): void {
    if (this.state.phase === 'finished') return;
    const s = this.state;
    this.clearTimers();
    s.phase = 'finished';
    s.endedAt = this.now();
    s.phaseStartedAt = s.endedAt;
    s.phaseEndsAt = s.endedAt;
    s.finishedFlags = [0, 1].map((k) => {
      const p = s.participants[k];
      return !p.forfeited && (p.isBot || p.connected);
    }) as [boolean, boolean];
    this.onChange(this);
    if (!this.finishEmitted) {
      this.finishEmitted = true;
      this.onFinish(this);
    }
  }

  // ---- Actions des joueurs ----------------------------------------------------------------

  private record(k: number, choice: number, responseMs: number): void {
    const s = this.state;
    if (s.phase !== 'answering' || s.answers[k][s.index]) return;
    s.answers[k][s.index] = { choice, responseMs: Math.min(Math.max(responseMs, 0), this.timing.answerMs) };
    const everyone = s.participants.every((p, j) => p.forfeited || s.answers[j][s.index]);
    if (everyone) this.enterReveal();
    else this.onChange(this);
  }

  /** Réponse d'un joueur. Le temps de réponse est mesuré par le serveur, jamais fourni par le client. */
  answer(playerId: string, index: number, choice: number): AnswerResult {
    const s = this.state;
    const k = this.participantIndex(playerId);
    if (k < 0) return { ok: false, code: 'not_in_duel' };
    if (s.participants[k].forfeited) return { ok: false, code: 'forfeited' };
    if (s.phase !== 'answering' || index !== s.index) return { ok: false, code: 'not_answering' };
    if (s.answers[k][index]) return { ok: false, code: 'already_answered' };
    if (!Number.isInteger(choice) || choice < 0 || choice >= s.questions[index].choices.length) {
      return { ok: false, code: 'invalid_choice' };
    }
    const t = this.now();
    if (t > s.phaseEndsAt + this.timing.latencyGraceMs) return { ok: false, code: 'too_late' };
    this.record(k, choice, t - s.phaseStartedAt);
    return { ok: true };
  }

  /** Abandon volontaire : le duel s'arrête, l'adversaire gagne, l'abandonnant ne reçoit rien. */
  forfeit(playerId: string): AnswerResult {
    const k = this.participantIndex(playerId);
    if (k < 0) return { ok: false, code: 'not_in_duel' };
    if (this.isFinished) return { ok: false, code: 'finished' };
    this.state.participants[k].forfeited = true;
    this.finish();
    return { ok: true };
  }

  /** Une déconnexion ne met jamais le duel en pause : on note seulement la présence. */
  setConnected(playerId: string, connected: boolean): void {
    const k = this.participantIndex(playerId);
    if (k < 0 || this.state.participants[k].connected === connected) return;
    this.state.participants[k].connected = connected;
    if (!this.isFinished) this.onChange(this);
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Résultat ---------------------------------------------------------------------------

  revealedQuestions(): DuelQuestion[] {
    return this.state.questions.slice(0, this.state.revealed);
  }

  scored(k: number) {
    const s = this.state;
    const questions = this.revealedQuestions();
    return scoreAnswers(questions, s.answers[k].slice(0, s.revealed) as PlayerAnswer[]);
  }

  outcomeFor(k: number): DuelOutcome {
    const s = this.state;
    const other = 1 - k;
    if (s.participants[k].forfeited) return 'loss';
    if (s.participants[other].forfeited) return 'win';
    return duelOutcome(totals(this.scored(k)), totals(this.scored(other)));
  }

  // ---- Vue d'un joueur --------------------------------------------------------------------

  private view(k: number, includeCurrent: boolean): ParticipantView {
    const s = this.state;
    const p = s.participants[k];
    const answers = this.scored(k);
    return {
      id: p.playerId,
      name: p.name,
      color: p.color,
      isBot: p.isBot,
      connected: p.isBot || p.connected,
      forfeited: p.forfeited,
      answers,
      points: totals(answers).points,
      answeredCurrent: includeCurrent && s.phase === 'answering' && !!s.answers[k][s.index],
    };
  }

  /** Vue du duel pour un joueur : il est toujours `me`. Rien de secret avant la révélation. */
  snapshotFor(playerId: string): Omit<DuelSnapshot, 'result'> {
    const s = this.state;
    const k = this.participantIndex(playerId);
    const other = 1 - k;
    const q = s.questions[s.index];
    const showChoices = s.phase === 'answering' || s.phase === 'reveal';
    const reveal = s.phase === 'reveal';
    return {
      duelId: s.id,
      themeId: s.themeId,
      phase: s.phase,
      index: s.index,
      questionCount: s.questions.length,
      serverNow: this.now(),
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      question:
        s.phase === 'intro' || s.phase === 'finished'
          ? null
          : { id: q.id, text: q.text, ...(q.image ? { image: q.image } : {}), choices: showChoices ? q.choices : [] },
      correctIndex: reveal ? q.correctIndex : null,
      myChoice: s.phase === 'answering' || reveal ? (s.answers[k][s.index]?.choice ?? null) : null,
      opponentChoice: reveal ? (s.answers[other][s.index]?.choice ?? null) : null,
      me: this.view(k, true),
      opponent: this.view(other, true),
    };
  }
}
