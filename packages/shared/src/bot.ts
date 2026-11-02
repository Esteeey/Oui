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

/** Adversaires de démonstration (joués par le bot) que l'on peut défier depuis l'application. */
export const DEMO_OPPONENTS: Record<string, { name: string; color: string }> = {
  lina: { name: 'Lina', color: '#FF8FB1' },
  malik: { name: 'Malik', color: '#7AB8FF' },
  chloe: { name: 'Chloé', color: '#B68CFF' },
  yanis: { name: 'Yanis', color: '#FFB547' },
  ines: { name: 'Inès', color: '#5FE3D0' },
  theo: { name: 'Théo', color: '#9BE15D' },
  sarah: { name: 'Sarah', color: '#FF7A59' },
  hugo: { name: 'Hugo', color: '#E7C26B' },
};
