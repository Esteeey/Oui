import { describe, expect, it } from 'vitest';
import {
  MAX_DUEL_POINTS,
  QUESTIONS,
  RULES,
  THEMES,
  duelOutcome,
  duelXp,
  formatSeconds,
  levelFromXp,
  shareResultText,
  speedSummary,
  prepareDuel,
  questionsOf,
  readingTimeMs,
  scoreAnswer,
  scoreAnswers,
  totals,
  xpForLevel,
} from './index';

describe('barème', () => {
  it('donne 20 points pour une réponse dans la première seconde', () => {
    expect(scoreAnswer({ choice: 2, responseMs: 0 }, 2, 0).points).toBe(20);
    expect(scoreAnswer({ choice: 2, responseMs: 999 }, 2, 0).points).toBe(20);
  });
  it('donne 2 points par seconde restante', () => {
    expect(scoreAnswer({ choice: 1, responseMs: 1_000 }, 1, 0).points).toBe(18);
    expect(scoreAnswer({ choice: 1, responseMs: 5_500 }, 1, 0).points).toBe(10);
  });
  it('donne au moins 2 points pour une bonne réponse en fin de chrono', () => {
    expect(scoreAnswer({ choice: 1, responseMs: 9_900 }, 1, 0).points).toBe(2);
    expect(scoreAnswer({ choice: 1, responseMs: RULES.answerTimeMs }, 1, 0).points).toBe(2);
  });
  it('donne 0 pour une mauvaise réponse ou sans réponse', () => {
    expect(scoreAnswer({ choice: 0, responseMs: 1_000 }, 1, 0).points).toBe(0);
    expect(scoreAnswer({ choice: null, responseMs: RULES.answerTimeMs }, 1, 6).points).toBe(0);
  });
  it('double les points de la dernière question', () => {
    expect(scoreAnswer({ choice: 0, responseMs: 0 }, 0, 6).points).toBe(40);
    expect(scoreAnswer({ choice: 0, responseMs: 5_500 }, 0, 6).points).toBe(20);
  });
  it('donne 160 points pour un sans-faute parfait', () => {
    const questions = prepareDuel(questionsOf('cg-melange'), 1);
    const answers = questions.map((q) => ({ choice: q.correctIndex, responseMs: 0 }));
    expect(totals(scoreAnswers(questions, answers)).points).toBe(MAX_DUEL_POINTS);
    expect(MAX_DUEL_POINTS).toBe(160);
  });
});

describe('résultat du duel', () => {
  it('départage aux points, puis aux bonnes réponses, puis au temps', () => {
    expect(duelOutcome({ points: 120, correct: 5, totalResponseMs: 0 }, { points: 100, correct: 6, totalResponseMs: 0 })).toBe('win');
    expect(duelOutcome({ points: 100, correct: 5, totalResponseMs: 0 }, { points: 100, correct: 6, totalResponseMs: 0 })).toBe('loss');
    expect(duelOutcome({ points: 100, correct: 5, totalResponseMs: 9_000 }, { points: 100, correct: 5, totalResponseMs: 10_000 })).toBe('win');
    expect(duelOutcome({ points: 100, correct: 5, totalResponseMs: 9_000 }, { points: 100, correct: 5, totalResponseMs: 9_000 })).toBe('draw');
  });

  it('rapidité : seules les bonnes réponses comptent', () => {
    const answers = [
      { choice: 1, responseMs: 2_000, correct: true, points: 18 },
      { choice: 0, responseMs: 500, correct: false, points: 0 },
      { choice: null, responseMs: 10_000, correct: false, points: 0 },
      { choice: 2, responseMs: 4_500, correct: true, points: 12 },
    ];
    expect(speedSummary(answers)).toEqual({ correct: 2, total: 4, averageMs: 3_250, fastestMs: 2_000 });
    expect(speedSummary([answers[1]])).toEqual({ correct: 0, total: 1, averageMs: null, fastestMs: null });
    expect(formatSeconds(3_250)).toBe('3,3 s');
  });

  it('texte de partage : score, grille par question et temps moyen', () => {
    const text = shareResultText({
      outcome: 'win',
      themeName: 'Capitales du monde',
      myPoints: 98,
      opponentPoints: 64,
      opponentName: 'Lea',
      answers: [
        { choice: 1, responseMs: 2_000, correct: true, points: 18 },
        { choice: 0, responseMs: 3_000, correct: false, points: 0 },
        { choice: null, responseMs: 10_000, correct: false, points: 0 },
      ],
    });
    expect(text.split('\n')).toEqual([
      'Qu1z · Capitales du monde',
      'Victoire 98 – 64 contre Lea',
      '✅❌⏱️',
      '1/3 bonnes réponses · 2,0 s en moyenne',
      'Viens me défier !',
    ]);
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

describe('questions illustrées', () => {
  it('garde l’illustration dans le duel préparé', () => {
    const duel = prepareDuel(questionsOf('geo-drapeaux'), 5);
    expect(duel.every((q) => q.image?.startsWith('flags/'))).toBe(true);
  });
  it('ajoute du temps de lecture pour une image', () => {
    expect(readingTimeMs('Court', true)).toBe(readingTimeMs('Court') + RULES.imageReadingBonusMs);
  });
});

import { computeRewards } from './rewards';

describe('récompenses', () => {
  const base = { correct: 4, questions: 7 };
  it('gagnant ayant terminé : +20 fin, +40 victoire, boost 40', () => {
    expect(computeRewards({ ...base, outcome: 'win', finished: true, forfeited: false })).toEqual({
      finishBonus: 20, victoryBonus: 40, boostBonus: 40, total: 100,
    });
  });
  it('perdant ayant terminé : +20 fin seulement (plus le boost)', () => {
    expect(computeRewards({ ...base, outcome: 'loss', finished: true, forfeited: false })).toMatchObject({
      finishBonus: 20, victoryBonus: 0,
    });
  });
  it('abandon : aucun XP, gagnant ou perdant', () => {
    for (const outcome of ['win', 'loss'] as const) {
      expect(computeRewards({ ...base, outcome, finished: false, forfeited: true }).total).toBe(0);
    }
  });
  it('absent à la fin (déconnecté) : ni fin ni victoire, boost conservé', () => {
    expect(computeRewards({ ...base, outcome: 'win', finished: false, forfeited: false })).toEqual({
      finishBonus: 0, victoryBonus: 0, boostBonus: 40, total: 40,
    });
  });
  it('sans-faute : boost 70 + 30', () => {
    expect(computeRewards({ correct: 7, questions: 7, outcome: 'win', finished: true, forfeited: false }).boostBonus).toBe(100);
  });
});

import { PSEUDO_PATTERN, extractMentions } from './social';

describe('social', () => {
  it('valide les pseudos', () => {
    for (const ok of ['Joueur_1234', 'Lina', 'Chloé.B', 'abc']) expect(PSEUDO_PATTERN.test(ok)).toBe(true);
    for (const ko of ['ab', 'avec espace', 'x'.repeat(21), '<script>', 'a@b']) expect(PSEUDO_PATTERN.test(ko)).toBe(false);
  });
  it('repère les mentions sans doublon et sans les adresses e-mail', () => {
    expect(extractMentions('Bravo @Lina et @lina ! Écris à moi@mail.fr, @Chloé.B')).toEqual(['lina', 'chloé.b']);
    expect(extractMentions('@ab trop court')).toEqual([]);
  });
});
