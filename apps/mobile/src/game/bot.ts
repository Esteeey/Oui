import { RULES, type DuelQuestion, type PlayerAnswer } from '@qu1z/shared';

/**
 * Adversaire d'entraînement du prototype, affiché comme tel.
 * Il sera remplacé par de vrais joueurs (matchmaking) et par les Fantômes.
 */
export const BOT_NAME = "Bot d'entraînement";

const SUCCESS_BY_DIFFICULTY = { 1: 0.85, 2: 0.65, 3: 0.45 } as const;

export function botAnswer(question: DuelQuestion): PlayerAnswer {
  const correct = Math.random() < SUCCESS_BY_DIFFICULTY[question.difficulty];
  const responseMs = Math.round(1_500 + Math.random() * 6_500);
  if (Math.random() < 0.05) {
    return { choice: null, responseMs: RULES.answerTimeMs };
  }
  if (correct) return { choice: question.correctIndex, responseMs };
  const wrong = [0, 1, 2, 3].filter((i) => i !== question.correctIndex);
  return { choice: wrong[Math.floor(Math.random() * wrong.length)], responseMs };
}
