import type { DuelOutcome } from './types';

/**
 * Récompenses XP d'un duel. Calculées et appliquées UNIQUEMENT par le serveur.
 *
 * - Bonus fin : +20 si le joueur a réellement terminé le duel (présent à la fin, sans abandon).
 * - Bonus victoire : +40 pour le gagnant ayant terminé (règle existante conservée pour l'égalité : +15).
 * - Bonus boost : règle XP existante liée à la performance, inchangée :
 *   10 XP par bonne réponse, +30 pour un sans-faute.
 * - Abandon volontaire : aucun XP.
 */
export const REWARDS = {
  finish: 20,
  victory: 40,
  draw: 15,
  perCorrect: 10,
  perfect: 30,
} as const;

export interface Rewards {
  finishBonus: number;
  victoryBonus: number;
  boostBonus: number;
  total: number;
}

export interface RewardInput {
  outcome: DuelOutcome;
  /** Présent à la fin du duel et sans abandon. */
  finished: boolean;
  /** Abandon volontaire. */
  forfeited: boolean;
  correct: number;
  questions: number;
}

export const NO_REWARDS: Rewards = { finishBonus: 0, victoryBonus: 0, boostBonus: 0, total: 0 };

export function computeRewards({ outcome, finished, forfeited, correct, questions }: RewardInput): Rewards {
  if (forfeited) return NO_REWARDS;
  const finishBonus = finished ? REWARDS.finish : 0;
  const victoryBonus = !finished ? 0 : outcome === 'win' ? REWARDS.victory : outcome === 'draw' ? REWARDS.draw : 0;
  const boostBonus = correct * REWARDS.perCorrect + (correct === questions ? REWARDS.perfect : 0);
  return { finishBonus, victoryBonus, boostBonus, total: finishBonus + victoryBonus + boostBonus };
}
