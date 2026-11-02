import type { ReactNode } from 'react';

import { INITIAL_RATING, type DuelRecord, type ThemeStats } from '@qu1z/shared';

import { useGameServer } from '@/state/game-server';

export type { DuelRecord, ThemeStats };

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

interface ProgressState {
  playerName: string;
  stats: Record<string, ThemeStats>;
  history: DuelRecord[];
  lastDuel: DuelRecord | null;
}

/** Conservé pour la compatibilité : la progression vient désormais du serveur de jeu. */
export function ProgressProvider({ children }: { children: ReactNode }) {
  return children;
}

/** Progression du joueur, telle qu'enregistrée par le serveur (XP, cote, statistiques, historique). */
export function useProgress(): ProgressState {
  const { profile } = useGameServer();
  const history = profile?.history ?? [];
  return {
    playerName: profile?.name ?? 'Invité',
    stats: profile?.stats ?? {},
    history,
    lastDuel: history[0] ?? null,
  };
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
