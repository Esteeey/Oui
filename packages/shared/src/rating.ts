import type { DuelOutcome } from './types';

/**
 * Cote de compétition par thème.
 * Prototype : Elo simple. La version en ligne passera à Glicko-2 (voir la conception).
 */
export const INITIAL_RATING = 1000;
const K = 32;

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

export function ratingDelta(rating: number, opponent: number, outcome: DuelOutcome): number {
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  return Math.round(K * (score - expectedScore(rating, opponent)));
}

export interface Division {
  id: 'bronze' | 'argent' | 'or' | 'platine' | 'diamant' | 'maitre';
  name: string;
  color: string;
  min: number;
}

export const DIVISIONS: Division[] = [
  { id: 'bronze', name: 'Bronze', color: '#C98A5A', min: 0 },
  { id: 'argent', name: 'Argent', color: '#B9C2D0', min: 1100 },
  { id: 'or', name: 'Or', color: '#FFC94A', min: 1250 },
  { id: 'platine', name: 'Platine', color: '#5FE3D0', min: 1400 },
  { id: 'diamant', name: 'Diamant', color: '#7AB8FF', min: 1550 },
  { id: 'maitre', name: 'Maître', color: '#D58BFF', min: 1700 },
];

export function divisionFor(rating: number): Division {
  return [...DIVISIONS].reverse().find((d) => rating >= d.min) ?? DIVISIONS[0];
}
