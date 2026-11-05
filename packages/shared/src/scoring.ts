import { RULES } from './rules';
import type { DuelOutcome, DuelQuestion, PlayerAnswer, ScoredAnswer } from './types';

/**
 * Points d'une manche (fonction pure). `round` va de 1 à 7 ; `elapsedSeconds` est le temps écoulé depuis le
 * début du chrono, en secondes décimales. Bonne réponse : 10 + (10 − secondes entières écoulées), donc de
 * 11 à 20 ; la manche 7 compte double. Mauvaise réponse ou pas de réponse : 0. Score maximal : 160.
 */
export function points(round: number, correct: boolean, elapsedSeconds: number): number {
  if (!(elapsedSeconds >= 0)) throw new RangeError('Le temps écoulé ne peut pas être négatif.');
  if (!correct) return 0;
  let p = 10 + Math.max(0, 10 - Math.floor(elapsedSeconds));
  if (round === RULES.questionsPerDuel) p *= RULES.lastQuestionMultiplier;
  return p;
}

/** Score une réponse (index de question à partir de 0) avec {@link points}. */
export function scoreAnswer(answer: PlayerAnswer, correctIndex: number, questionIndex: number): ScoredAnswer {
  const correct = answer.choice !== null && answer.choice === correctIndex;
  const elapsed = Math.min(Math.max(answer.responseMs, 0), RULES.answerTimeMs);
  return { ...answer, correct, points: points(questionIndex + 1, correct, elapsed / 1000) };
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

/** Résultat du point de vue du joueur A : victoire si son score est plus haut, égalité si les scores sont égaux. */
export function duelOutcome(a: DuelTotals, b: DuelTotals): DuelOutcome {
  if (a.points === b.points) return 'draw';
  return a.points > b.points ? 'win' : 'loss';
}

export interface SpeedSummary {
  correct: number;
  total: number;
  /** Temps moyen des bonnes réponses (ms), `null` sans bonne réponse. */
  averageMs: number | null;
  /** Bonne réponse la plus rapide (ms), `null` sans bonne réponse. */
  fastestMs: number | null;
}

/** Rapidité d'un joueur : les temps ne comptent que les bonnes réponses (une erreur rapide n'est pas un exploit). */
export function speedSummary(answers: ScoredAnswer[]): SpeedSummary {
  const times = answers.filter((a) => a.correct).map((a) => a.responseMs);
  return {
    correct: times.length,
    total: answers.length,
    averageMs: times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null,
    fastestMs: times.length ? Math.min(...times) : null,
  };
}

/** Durée en secondes à la française : 3200 → « 3,2 s ». */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

const OUTCOME_WORD: Record<DuelOutcome, string> = { win: 'Victoire', loss: 'Défaite', draw: 'Égalité' };

/**
 * Texte de partage d'un résultat : thème, score, une case par question (✅ bonne, ❌ fausse, ⏱️ sans réponse)
 * et rapidité. Rien d'autre que le pseudo de l'adversaire, déjà public.
 */
export function shareResultText(r: {
  outcome: DuelOutcome;
  themeName: string;
  myPoints: number;
  opponentPoints: number;
  opponentName: string;
  answers: ScoredAnswer[];
}): string {
  const grid = r.answers.map((a) => (a.choice === null ? '⏱️' : a.correct ? '✅' : '❌')).join('');
  const speed = speedSummary(r.answers);
  return [
    `Qu1z · ${r.themeName}`,
    `${OUTCOME_WORD[r.outcome]} ${r.myPoints} – ${r.opponentPoints} contre ${r.opponentName}`,
    grid,
    `${speed.correct}/${speed.total} bonnes réponses${speed.averageMs !== null ? ` · ${formatSeconds(speed.averageMs)} en moyenne` : ''}`,
    'Viens me défier !',
  ].join('\n');
}

/** Score d'un sans-faute instantané : 6 × 20 + 40 = 160. */
export const MAX_DUEL_POINTS = 20 * (RULES.questionsPerDuel - 1 + RULES.lastQuestionMultiplier);
