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
  /** Photo de profil (chemin `/media/…` ou URL absolue). */
  avatar: string | null;
  stats: Record<string, ThemeStats>;
  history: DuelRecord[];
}

export type DuelPhase = 'intro' | 'reading' | 'answering' | 'reveal' | 'finished';

export interface ParticipantView {
  id: string;
  name: string;
  color: string | null;
  /** Photo de profil (URL), `null` sans photo. */
  avatar: string | null;
  /** Photo de couverture (URL), fond de sa moitié de l'écran « VS » ; `null` sans photo. */
  cover: string | null;
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
  /**
   * Mon temps de réponse (ms), mesuré par le serveur, une fois ma réponse enregistrée (ou le temps écoulé) :
   * la barre de temps se fige à cette position. Absent d'un serveur plus ancien.
   */
  myResponseMs?: number | null;
  /**
   * Temps de réponse de l'adversaire (ms), dès qu'il a répondu (sans dire quoi) : sa moitié de la barre
   * de temps se fige à cette position. Absent d'un serveur plus ancien.
   */
  opponentResponseMs?: number | null;
  opponentChoice: number | null;
  /**
   * Duel issu d'un défi asynchrone. Manche 1 : l'invitant joue seul (l'ami rejouera plus tard les mêmes
   * questions) ; manche 2 : l'ami joue contre l'enregistrement de l'invitant.
   */
  challenge?: { id: string; leg: 1 | 2 } | null;
  me: ParticipantView;
  opponent: ParticipantView;
  result: DuelResult | null;
}


export type ClientMessage =
  | { type: 'hello'; token?: string }
  | { type: 'play'; themeId: string; mode: 'bot' | 'pvp' }
  | { type: 'cancelQueue' }
  /** `elapsedMs` : temps écoulé mesuré par le téléphone depuis le début du chrono (contrôlé, refusé hors de 0 à 10 s). */
  | { type: 'answer'; duelId: string; index: number; choice: number; elapsedMs?: number }
  | { type: 'forfeit'; duelId: string }
  /** Mini chat de fin de match : message à l'adversaire du duel, ou demande des messages déjà échangés. */
  | { type: 'duelChat'; duelId: string; text: string }
  | { type: 'duelChatHistory'; duelId: string }
  | { type: 'ackResult'; duelId: string };

export interface DuelChatMessage {
  from: string;
  text: string;
  at: number;
}

/** Longueur maximale d'un message du mini chat de fin de match. */
export const DUEL_CHAT_MAX_LENGTH = 140;
/** Réponses rapides du mini chat. */
export const QUICK_CHAT = ['GG !', 'Bien joué !', 'Revanche ?', 'Trop fort 😅', 'La prochaine fois !'] as const;

export type ServerMessage =
  /** Messages du mini chat de fin de match (nouveaux, ou tous à la demande). */
  | { type: 'duelChat'; duelId: string; messages: DuelChatMessage[] }
  | { type: 'welcome'; playerId: string; token: string; profile: Profile }
  | { type: 'profile'; profile: Profile }
  | { type: 'queued'; themeId: string; since: number }
  | { type: 'queueCancelled' }
  | { type: 'duel'; snapshot: DuelSnapshot }
  | { type: 'error'; code: string; message: string }
  /** Messagerie modifiée (message, réaction, lecture, demande) : le client recharge ce qui est affiché. */
  | { type: 'messages'; conversationId?: string }
  /** Une notification a été ajoutée ou mise à jour : le client recharge le centre. */
  | { type: 'notification'; unread?: number };
