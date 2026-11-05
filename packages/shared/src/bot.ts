import { RULES } from './rules';
import type { DuelQuestion, PlayerAnswer } from './types';

/** Adversaire d'entraînement, toujours affiché comme tel. */
export const BOT_NAME = "Bot d'entraînement";

const SUCCESS_BY_DIFFICULTY = { 1: 0.85, 2: 0.65, 3: 0.45 } as const;

/** Force du bot de 0 à 1 d'après le niveau du joueur dans le thème (niveau 1 → 0, niveau 30 et plus → 1). */
export function botSkill(level: number): number {
  return Math.min(1, Math.max(0, (level - 1) / 29));
}

/**
 * Réponse du bot. Sa précision et sa vitesse dépendent du niveau du joueur affronté : au niveau 1, il répond
 * entre 1,5 et 8 s avec la réussite de base ; au niveau 30, entre 0,8 et 4 s et réussit nettement plus souvent.
 */
export function botAnswer(question: DuelQuestion, rng: () => number = Math.random, level = 1): PlayerAnswer {
  const skill = botSkill(level);
  if (rng() < 0.05 * (1 - skill)) return { choice: null, responseMs: RULES.answerTimeMs };
  const success = Math.min(0.97, SUCCESS_BY_DIFFICULTY[question.difficulty] * (0.85 + 0.4 * skill));
  const correct = rng() < success;
  const responseMs = Math.round(1_500 - 700 * skill + rng() * (6_500 - 3_300 * skill));
  if (correct) return { choice: question.correctIndex, responseMs };
  const wrong = [0, 1, 2, 3].filter((i) => i !== question.correctIndex);
  return { choice: wrong[Math.floor(rng() * wrong.length)], responseMs };
}
