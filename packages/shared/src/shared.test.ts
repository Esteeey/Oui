import { describe, expect, it } from 'vitest';
import {
  MAX_DUEL_POINTS,
  QUESTIONS,
  RULES,
  THEMES,
  duelOutcome,
  duelXp,
  levelFromXp,
  prepareDuel,
  questionsOf,
  readingTimeMs,
  scoreAnswer,
  scoreAnswers,
  totals,
  xpForLevel,
} from './index';

describe('barème', () => {
  it('donne 100 points pour une réponse instantanée', () => {
    expect(scoreAnswer({ choice: 2, responseMs: 0 }, 2, 0).points).toBe(100);
  });
  it('donne 60 + 20 à mi-temps', () => {
    expect(scoreAnswer({ choice: 1, responseMs: 5_000 }, 1, 0).points).toBe(80);
  });
  it('donne 60 juste avant la fin du chrono', () => {
    expect(scoreAnswer({ choice: 1, responseMs: RULES.answerTimeMs }, 1, 0).points).toBe(60);
  });
  it('donne 0 pour une mauvaise réponse ou sans réponse, et casse la série', () => {
    expect(scoreAnswer({ choice: 0, responseMs: 1_000 }, 1, 4)).toMatchObject({ points: 0, streak: 0 });
    expect(scoreAnswer({ choice: null, responseMs: RULES.answerTimeMs }, 1, 4).points).toBe(0);
  });
  it('ajoute le bonus de série à partir de la 3e bonne réponse consécutive', () => {
    expect(scoreAnswer({ choice: 0, responseMs: 0 }, 0, 1).points).toBe(100);
    expect(scoreAnswer({ choice: 0, responseMs: 0 }, 0, 2).points).toBe(110);
  });
  it('atteint le maximum théorique avec 7 réponses parfaites', () => {
    const questions = prepareDuel(questionsOf('cg-melange'), 1);
    const answers = questions.map((q) => ({ choice: q.correctIndex, responseMs: 0 }));
    expect(totals(scoreAnswers(questions, answers)).points).toBe(MAX_DUEL_POINTS);
    expect(MAX_DUEL_POINTS).toBe(750);
  });
});

describe('résultat du duel', () => {
  it('départage aux points, puis aux bonnes réponses, puis au temps', () => {
    expect(duelOutcome({ points: 500, correct: 5, totalResponseMs: 0 }, { points: 400, correct: 6, totalResponseMs: 0 })).toBe('win');
    expect(duelOutcome({ points: 400, correct: 5, totalResponseMs: 0 }, { points: 400, correct: 6, totalResponseMs: 0 })).toBe('loss');
    expect(duelOutcome({ points: 400, correct: 5, totalResponseMs: 9_000 }, { points: 400, correct: 5, totalResponseMs: 10_000 })).toBe('win');
    expect(duelOutcome({ points: 400, correct: 5, totalResponseMs: 9_000 }, { points: 400, correct: 5, totalResponseMs: 9_000 })).toBe('draw');
  });
});

describe('préparation du duel', () => {
  it('tire 7 questions distinctes, reproductibles avec le même seed', () => {
    const pool = questionsOf('geo-capitales');
    const a = prepareDuel(pool, 42);
    const b = prepareDuel(pool, 42);
    expect(a).toEqual(b);
    expect(a).toHaveLength(RULES.questionsPerDuel);
    expect(new Set(a.map((q) => q.id)).size).toBe(RULES.questionsPerDuel);
  });
  it('garde la bonne réponse au bon index après mélange', () => {
    for (const q of prepareDuel(QUESTIONS.filter((x) => x.themeId === 'sports-jo'), 7)) {
      const source = QUESTIONS.find((x) => x.id === q.id)!;
      expect(q.choices[q.correctIndex]).toBe(source.choices[0]);
    }
  });
  it('trie les questions par difficulté croissante', () => {
    const d = prepareDuel(questionsOf('sci-essentiels'), 3).map((q) => q.difficulty);
    expect(d).toEqual([...d].sort());
  });
  it('limite le temps de lecture entre 1 et 3 s', () => {
    expect(readingTimeMs('')).toBe(1_000);
    expect(readingTimeMs('x'.repeat(500))).toBe(3_000);
  });
});

describe('contenu', () => {
  it('chaque thème a assez de questions et des propositions toutes différentes', () => {
    for (const theme of THEMES) {
      expect(questionsOf(theme.id).length).toBeGreaterThanOrEqual(RULES.questionsPerDuel);
    }
    for (const q of QUESTIONS) {
      expect(new Set(q.choices).size).toBe(4);
    }
  });
});

describe('progression', () => {
  it('calcule l’XP d’un duel', () => {
    expect(duelXp('win', 7, 7)).toBe(70 + 40 + 30);
    expect(duelXp('draw', 3, 7)).toBe(45);
    expect(duelXp('loss', 2, 7)).toBe(20);
  });
  it('calcule le niveau à partir de l’XP', () => {
    expect(xpForLevel(2)).toBe(100);
    expect(levelFromXp(0)).toMatchObject({ level: 1, current: 0, needed: 100 });
    expect(levelFromXp(150)).toMatchObject({ level: 2, current: 50, needed: 200 });
    expect(levelFromXp(10_000_000).level).toBe(100);
  });
});

import { DIVISIONS, divisionFor, ratingDelta } from './rating';

describe('cote', () => {
  it('fait gagner 16 points contre un adversaire de même cote', () => {
    expect(ratingDelta(1000, 1000, 'win')).toBe(16);
    expect(ratingDelta(1000, 1000, 'loss')).toBe(-16);
    expect(ratingDelta(1000, 1000, 'draw')).toBe(0);
  });
  it('récompense davantage une victoire contre plus fort', () => {
    expect(ratingDelta(1000, 1300, 'win')).toBeGreaterThan(ratingDelta(1300, 1000, 'win'));
  });
  it('place la cote dans la bonne division', () => {
    expect(divisionFor(1000).name).toBe('Bronze');
    expect(divisionFor(1250).name).toBe('Or');
    expect(divisionFor(2000).name).toBe('Maître');
    expect(DIVISIONS).toHaveLength(6);
  });
});
