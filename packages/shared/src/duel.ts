import { RULES } from './rules';
import type { DuelQuestion, Question } from './types';

/** Générateur pseudo-aléatoire reproductible (mulberry32) : un même seed donne le même duel. */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Prépare les 7 questions d'un duel : tirage dans le thème, du plus facile au plus difficile,
 * propositions mélangées. Les deux joueurs reçoivent exactement ce résultat.
 */
export function prepareDuel(pool: readonly Question[], seed: number): DuelQuestion[] {
  if (pool.length < RULES.questionsPerDuel) {
    throw new Error(`Il faut au moins ${RULES.questionsPerDuel} questions dans le thème.`);
  }
  const rng = createRng(seed);
  const picked = shuffle(pool, rng)
    .slice(0, RULES.questionsPerDuel)
    .sort((a, b) => a.difficulty - b.difficulty);

  return picked.map((q) => {
    const order = shuffle([0, 1, 2, 3], rng);
    return {
      id: q.id,
      text: q.text,
      choices: order.map((i) => q.choices[i]),
      correctIndex: order.indexOf(0),
      difficulty: q.difficulty,
    };
  });
}
