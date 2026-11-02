import { RULES } from './rules';
import type { DuelQuestion, PlayerAnswer } from './types';

/** Adversaire d'entraînement, toujours affiché comme tel. */
export const BOT_NAME = "Bot d'entraînement";

const SUCCESS_BY_DIFFICULTY = { 1: 0.85, 2: 0.65, 3: 0.45 } as const;

export function botAnswer(question: DuelQuestion, rng: () => number = Math.random): PlayerAnswer {
  if (rng() < 0.05) return { choice: null, responseMs: RULES.answerTimeMs };
  const correct = rng() < SUCCESS_BY_DIFFICULTY[question.difficulty];
  const responseMs = Math.round(1_500 + rng() * 6_500);
  if (correct) return { choice: question.correctIndex, responseMs };
  const wrong = [0, 1, 2, 3].filter((i) => i !== question.correctIndex);
  return { choice: wrong[Math.floor(rng() * wrong.length)], responseMs };
}
