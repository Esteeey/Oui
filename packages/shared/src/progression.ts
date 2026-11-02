import type { DuelOutcome } from './types';

export const XP = {
  perCorrect: 10,
  win: 40,
  draw: 15,
  perfect: 30,
} as const;

export const MAX_LEVEL = 100;

export function duelXp(outcome: DuelOutcome, correct: number, questions: number): number {
  let xp = correct * XP.perCorrect;
  if (outcome === 'win') xp += XP.win;
  if (outcome === 'draw') xp += XP.draw;
  if (correct === questions) xp += XP.perfect;
  return xp;
}

/** XP totale nécessaire pour atteindre un niveau : 0, 100, 300, 600, 1000… */
export function xpForLevel(level: number): number {
  const l = Math.min(Math.max(level, 1), MAX_LEVEL);
  return 50 * (l - 1) * l;
}

export interface LevelInfo {
  level: number;
  /** XP gagnée depuis le début du niveau actuel. */
  current: number;
  /** XP nécessaire pour passer au niveau suivant (0 au niveau maximal). */
  needed: number;
  progress: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  if (level === MAX_LEVEL) return { level, current: 0, needed: 0, progress: 1 };
  const start = xpForLevel(level);
  const needed = xpForLevel(level + 1) - start;
  const current = xp - start;
  return { level, current, needed, progress: current / needed };
}

const TITLES: [number, string][] = [
  [50, 'Érudit'],
  [25, 'Expert'],
  [10, 'Passionné'],
  [5, 'Amateur'],
  [1, 'Débutant'],
];

export function titleForLevel(level: number): string {
  return TITLES.find(([min]) => level >= min)?.[1] ?? 'Débutant';
}
