import { createContext, use, useState, type ReactNode } from 'react';

import type { DuelOutcome, DuelQuestion, ScoredAnswer } from '@qu1z/shared';

/** Statistiques d'un joueur dans un thème. */
export interface ThemeStats {
  xp: number;
  duels: number;
  wins: number;
  draws: number;
  correct: number;
  answered: number;
  totalCorrectResponseMs: number;
}

export interface DuelRecord {
  themeId: string;
  opponentName: string;
  questions: DuelQuestion[];
  player: ScoredAnswer[];
  opponent: ScoredAnswer[];
  outcome: DuelOutcome;
  xpBefore: number;
  xpGained: number;
}

interface ProgressState {
  playerName: string;
  stats: Record<string, ThemeStats>;
  lastDuel: DuelRecord | null;
  lastThemeId: string | null;
  recordDuel: (record: DuelRecord) => void;
}

export const EMPTY_STATS: ThemeStats = {
  xp: 0,
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
  const [lastDuel, setLastDuel] = useState<DuelRecord | null>(null);

  const recordDuel = (record: DuelRecord) => {
    setLastDuel(record);
    setStats((prev) => {
      const s = prev[record.themeId] ?? EMPTY_STATS;
      const correctAnswers = record.player.filter((a) => a.correct);
      return {
        ...prev,
        [record.themeId]: {
          xp: s.xp + record.xpGained,
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
      value={{
        playerName: 'Invité',
        stats,
        lastDuel,
        lastThemeId: lastDuel?.themeId ?? null,
        recordDuel,
      }}>
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
