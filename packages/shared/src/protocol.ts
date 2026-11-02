import type { Rewards } from './rewards';
import type { DuelOutcome, DuelQuestion, ScoredAnswer } from './types';

/** Statistiques d'un joueur dans un thème (tenues par le serveur). */
export interface ThemeStats {
  xp: number;
  rating: number;
  duels: number;
  wins: number;
  draws: number;
  correct: number;
  answered: number;
  totalCorrectResponseMs: number;
}

/** Résumé d'un duel terminé, toujours du point de vue du joueur qui le reçoit. */
export interface DuelRecord {
  id: string;
  playedAt: number;
  themeId: string;
  /** Id du joueur réel affronté, ou `null` pour le bot. */
  opponentId: string | null;
  opponentName: string;
  opponentIsBot: boolean;
  questions: DuelQuestion[];
  player: ScoredAnswer[];
  opponent: ScoredAnswer[];
  outcome: DuelOutcome;
  /** XP du thème avant le duel. */
  xpBefore: number;
  xpGained: number;
  ratingBefore: number;
  ratingDelta: number;
}

export interface Profile {
  id: string;
  name: string;
  /** XP totale du compte. */
  xp: number;
  stats: Record<string, ThemeStats>;
  history: DuelRecord[];
}

export type DuelPhase = 'intro' | 'reading' | 'answering' | 'reveal' | 'finished';

export interface ParticipantView {
  id: string;
  name: string;
  color: string | null;
  isBot: boolean;
  connected: boolean;
  forfeited: boolean;
  /** Réponses des questions déjà révélées. */
  answers: ScoredAnswer[];
  points: number;
  /** A déjà répondu à la question en cours (sans dire quoi). */
  answeredCurrent: boolean;
}

export interface DuelResult {
  outcome: DuelOutcome;
  finished: boolean;
  forfeited: boolean;
  rewards: Rewards;
  /** XP du compte avant et après le duel. */
  accountXpBefore: number;
  accountXpAfter: number;
  record: DuelRecord;
}

/**
 * État d'un duel tel que le voit UN joueur : `me` est toujours lui, `opponent` l'autre.
 * La bonne réponse et le choix de l'adversaire ne sont envoyés qu'à la révélation.
 */
export interface DuelSnapshot {
  duelId: string;
  themeId: string;
  phase: DuelPhase;
  index: number;
  questionCount: number;
  /** Horloge du serveur (ms) : le client calcule son décalage avec. */
  serverNow: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** Énoncé en cours ; `choices` vide pendant la lecture. */
  question: { id: string; text: string; image?: string; choices: string[] } | null;
  correctIndex: number | null;
  myChoice: number | null;
  opponentChoice: number | null;
  me: ParticipantView;
  opponent: ParticipantView;
  result: DuelResult | null;
}

export interface ChatMessage {
  id: string;
  fromId: string;
  text: string;
  at: number;
}

export type ClientMessage =
  | { type: 'hello'; token?: string }
  | { type: 'play'; themeId: string; mode: 'bot' | 'pvp' }
  | { type: 'cancelQueue' }
  | { type: 'answer'; duelId: string; index: number; choice: number }
  | { type: 'forfeit'; duelId: string }
  | { type: 'ackResult'; duelId: string }
  | { type: 'chat'; duelId: string; text: string }
  | { type: 'getChat'; duelId: string };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; token: string; profile: Profile }
  | { type: 'profile'; profile: Profile }
  | { type: 'queued'; themeId: string; since: number }
  | { type: 'queueCancelled' }
  | { type: 'duel'; snapshot: DuelSnapshot }
  | { type: 'chat'; duelId: string; messages: ChatMessage[]; canChat: boolean }
  | { type: 'error'; code: string; message: string }
  /** Une notification a été ajoutée ou mise à jour : le client recharge le centre. */
  | { type: 'notification'; unread?: number };
