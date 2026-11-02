import { RULES } from './rules';
import type { DuelOutcome, DuelQuestion, PlayerAnswer, ScoredAnswer } from './types';

/** Points d'une réponse : 60 de base + jusqu'à 40 selon la rapidité + bonus de série. */
export function scoreAnswer(
  answer: PlayerAnswer,
  correctIndex: number,
  previousStreak: number,
): ScoredAnswer {
  const correct = answer.choice !== null && answer.choice === correctIndex;
  if (!correct) {
    return { ...answer, correct, points: 0, streak: 0 };
  }
  const elapsed = Math.min(Math.max(answer.responseMs, 0), RULES.answerTimeMs);
  const remaining = RULES.answerTimeMs - elapsed;
  const speedBonus = Math.round((RULES.maxSpeedBonus * remaining) / RULES.answerTimeMs);
  const streak = previousStreak + 1;
  const streakBonus = streak >= RULES.streakFrom ? RULES.streakBonus : 0;
  return { ...answer, correct, points: RULES.basePoints + speedBonus + streakBonus, streak };
}

/** Score toute une série de réponses, dans l'ordre des questions. */
export function scoreAnswers(questions: DuelQuestion[], answers: PlayerAnswer[]): ScoredAnswer[] {
  const scored: ScoredAnswer[] = [];
  let streak = 0;
  answers.forEach((answer, i) => {
    const result = scoreAnswer(answer, questions[i].correctIndex, streak);
    streak = result.streak;
    scored.push(result);
  });
  return scored;
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

export const MAX_DUEL_POINTS =
  RULES.questionsPerDuel * (RULES.basePoints + RULES.maxSpeedBonus) +
  (RULES.questionsPerDuel - RULES.streakFrom + 1) * RULES.streakBonus;
