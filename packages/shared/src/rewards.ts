import type { DuelOutcome } from './types';

/**
 * Récompenses XP d'un duel. Calculées et appliquées UNIQUEMENT par le serveur (le client ne fait que les afficher).
 *
 * - base = score + bonus fin + bonus victoire
 * - bonus fin : 40 (0 si le joueur abandonne ou en cas d'erreur, c'est-à-dire s'il n'a pas terminé le duel)
 * - bonus victoire : 100 pour une victoire, 50 pour une égalité, 0 pour une défaite
 * - si l'adversaire abandonne, le joueur gagne : bonus fin 40 + bonus victoire 100
 * - si le joueur abandonne : score 0, XP 0
 * - XP gagnée = round(base × multiplicateur) ; bonus boost = round((multiplicateur − 1) × base)
 */
export const REWARDS = {
  finish: 40,
  victory: 100,
  draw: 50,
  /** Multiplicateur d'XP par défaut (2 pour un boost « XP double »). */
  multiplier: 1,
} as const;

export interface Rewards {
  /** Score du duel, compté tel quel en XP. */
  scorePoints: number;
  finishBonus: number;
  victoryBonus: number;
  /** XP en plus grâce au multiplicateur. */
  boostBonus: number;
  /** XP gagnée au total (= score + bonus fin + bonus victoire + bonus boost, à l'arrondi près). */
  total: number;
}

export interface RewardInput {
  outcome: DuelOutcome;
  /** Score du joueur dans le duel (0 à 160). */
  score: number;
  /** Présent à la fin du duel, sans abandon ni erreur. */
  finished: boolean;
  /** Abandon volontaire du joueur. */
  forfeited: boolean;
  /** Abandon de l'adversaire : le joueur gagne avec tous les bonus. */
  opponentForfeited?: boolean;
  multiplier?: number;
}

export const NO_REWARDS: Rewards = { scorePoints: 0, finishBonus: 0, victoryBonus: 0, boostBonus: 0, total: 0 };

export function computeRewards({ outcome, score, finished, forfeited, opponentForfeited = false, multiplier = REWARDS.multiplier }: RewardInput): Rewards {
  if (forfeited) return NO_REWARDS;
  if (score < 0) throw new RangeError('Le score ne peut pas être négatif.');
  const won = opponentForfeited || outcome === 'win';
  const finishBonus = finished || opponentForfeited ? REWARDS.finish : 0;
  const victoryBonus = won ? REWARDS.victory : outcome === 'draw' ? REWARDS.draw : 0;
  const base = score + finishBonus + victoryBonus;
  const total = Math.round(base * multiplier);
  const boostBonus = Math.round((multiplier - 1) * base);
  return { scorePoints: score, finishBonus, victoryBonus, boostBonus, total };
}

export interface XpInput extends RewardInput {
  /** XP du joueur avant le duel. */
  xpStart: number;
}

export interface XpResult extends Rewards {
  /** XP gagnée (= total). */
  xpGained: number;
  xpBonus: number;
  /** XP après le duel. */
  xpFinal: number;
}

/** XP d'un duel (fonction pure) : récompenses, XP gagnée, bonus du multiplicateur et XP finale. */
export function xp(input: XpInput): XpResult {
  const r = computeRewards(input);
  return { ...r, xpGained: r.total, xpBonus: r.boostBonus, xpFinal: input.xpStart + r.total };
}
