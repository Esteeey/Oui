import { RULES } from './rules';
import type { DuelOutcome, DuelQuestion, PlayerAnswer, ScoredAnswer } from './types';

const MAX_SECONDS = RULES.answerTimeMs / 1000;

/**
 * Points d'une réponse : 2 par seconde restante du chrono (seconde entamée comptée), soit 20 au plus
 * et 2 au moins pour une bonne réponse. La dernière question compte double.
 */
export function scoreAnswer(answer: PlayerAnswer, correctIndex: number, questionIndex: number): ScoredAnswer {
  const correct = answer.choice !== null && answer.choice === correctIndex;
  if (!correct) {
    return { ...answer, correct, points: 0 };
  }
  const elapsed = Math.min(Math.max(answer.responseMs, 0), RULES.answerTimeMs);
  const seconds = Math.min(MAX_SECONDS, Math.max(1, Math.ceil((RULES.answerTimeMs - elapsed) / 1000)));
  const multiplier = questionIndex === RULES.questionsPerDuel - 1 ? RULES.lastQuestionMultiplier : 1;
  return { ...answer, correct, points: seconds * RULES.pointsPerSecond * multiplier };
}

/** Score toute une série de réponses, dans l'ordre des questions. */
export function scoreAnswers(questions: DuelQuestion[], answers: PlayerAnswer[]): ScoredAnswer[] {
  return answers.map((answer, i) => scoreAnswer(answer, questions[i].correctIndex, i));
}

export interface DuelTotals {
  points: number;
  correct: number;
  totalResponseMs: number;
}

export function totals(answers: ScoredAnswer[]): DuelTotals {
  return answers.reduce<DuelTotals>(
    (acc, a) => ({
      points: acc.points + a.points,
      correct: acc.correct + (a.correct ? 1 : 0),
      totalResponseMs: acc.totalResponseMs + a.responseMs,
    }),
    { points: 0, correct: 0, totalResponseMs: 0 },
  );
}

/**
 * Résultat du point de vue du joueur A.
 * Départage : points, puis nombre de bonnes réponses, puis temps de réponse total le plus court.
 */
export function duelOutcome(a: DuelTotals, b: DuelTotals): DuelOutcome {
  if (a.points !== b.points) return a.points > b.points ? 'win' : 'loss';
  if (a.correct !== b.correct) return a.correct > b.correct ? 'win' : 'loss';
  if (a.totalResponseMs !== b.totalResponseMs) {
    return a.totalResponseMs < b.totalResponseMs ? 'win' : 'loss';
  }
  return 'draw';
}

/** Score d'un sans-faute instantané : 6 × 20 + 40 = 160. */
export const MAX_DUEL_POINTS =
  MAX_SECONDS * RULES.pointsPerSecond * (RULES.questionsPerDuel - 1 + RULES.lastQuestionMultiplier);
