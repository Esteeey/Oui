import { createContext, use, useState, type ReactNode } from 'react';

import { INITIAL_RATING, type DuelOutcome, type DuelQuestion, type ScoredAnswer } from '@qu1z/shared';

/** Statistiques d'un joueur dans un thème. */
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

export interface DuelRecord {
  id: string;
  playedAt: number;
  themeId: string;
  /** Joueur de démonstration affronté, ou `null` pour le bot d'entraînement. */
  opponentId: string | null;
  opponentName: string;
  questions: DuelQuestion[];
  player: ScoredAnswer[];
  opponent: ScoredAnswer[];
  outcome: DuelOutcome;
  xpBefore: number;
  xpGained: number;
  ratingBefore: number;
  ratingDelta: number;
}

interface ProgressState {
  playerName: string;
  stats: Record<string, ThemeStats>;
  history: DuelRecord[];
  lastDuel: DuelRecord | null;
  recordDuel: (record: DuelRecord) => void;
}

export const EMPTY_STATS: ThemeStats = {
  xp: 0,
  rating: INITIAL_RATING,
  duels: 0,
  wins: 0,
  draws: 0,
  correct: 0,
  answered: 0,
  totalCorrectResponseMs: 0,
};

const ProgressContext = createContext<ProgressState | null>(null);

/**
 * Progression du joueur, gardée en mémoire pour le prototype.
 * Elle sera enregistrée sur le serveur quand les comptes seront en place.
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Record<string, ThemeStats>>({});
  const [history, setHistory] = useState<DuelRecord[]>([]);

  const recordDuel = (record: DuelRecord) => {
    setHistory((h) => [record, ...h]);
    setStats((prev) => {
      const s = prev[record.themeId] ?? EMPTY_STATS;
      const correctAnswers = record.player.filter((a) => a.correct);
      return {
        ...prev,
        [record.themeId]: {
          xp: s.xp + record.xpGained,
          rating: s.rating + record.ratingDelta,
          duels: s.duels + 1,
          wins: s.wins + (record.outcome === 'win' ? 1 : 0),
          draws: s.draws + (record.outcome === 'draw' ? 1 : 0),
          correct: s.correct + correctAnswers.length,
          answered: s.answered + record.player.length,
          totalCorrectResponseMs:
            s.totalCorrectResponseMs + correctAnswers.reduce((t, a) => t + a.responseMs, 0),
        },
      };
    });
  };

  return (
    <ProgressContext
      value={{ playerName: 'Invité', stats, history, lastDuel: history[0] ?? null, recordDuel }}>
      {children}
    </ProgressContext>
  );
}

export function useProgress(): ProgressState {
  const ctx = use(ProgressContext);
  if (!ctx) throw new Error('useProgress doit être utilisé dans <ProgressProvider>.');
  return ctx;
}

export function useThemeStats(themeId: string): ThemeStats {
  return useProgress().stats[themeId] ?? EMPTY_STATS;
}

export function totalXp(stats: Record<string, ThemeStats>): number {
  return Object.values(stats).reduce((t, s) => t + s.xp, 0);
}

/** Cote globale : moyenne des 3 meilleurs thèmes joués. */
export function globalRating(stats: Record<string, ThemeStats>): number {
  const ratings = Object.values(stats)
    .map((s) => s.rating)
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (ratings.length === 0) return INITIAL_RATING;
  return Math.round(ratings.reduce((t, r) => t + r, 0) / ratings.length);
}

export function bestWinStreak(history: DuelRecord[]): number {
  let best = 0;
  let current = 0;
  for (const duel of [...history].reverse()) {
    current = duel.outcome === 'win' ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}
