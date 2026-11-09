import { describe, expect, it } from 'vitest';
import {
  MAX_DUEL_POINTS,
  QUESTIONS,
  RULES,
  THEMES,
  LEVEL_THRESHOLDS,
  duelOutcome,
  formatSeconds,
  levelFromXp,
  points,
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

describe('points()', () => {
  it('cas de la spécification', () => {
    expect(points(1, true, 0.4)).toBe(20);
    expect(points(1, true, 3.7)).toBe(17);
    expect(points(1, true, 9.9)).toBe(11);
    expect(points(1, false, 1)).toBe(0);
    expect(points(7, true, 0.2)).toBe(40);
  });
  it('refuse un temps écoulé négatif', () => {
    expect(() => points(1, true, -0.1)).toThrow();
    expect(() => points(1, false, -1)).toThrow();
  });
  it('scoreAnswer utilise points() (index de question à partir de 0)', () => {
    expect(scoreAnswer({ choice: 2, responseMs: 400 }, 2, 0).points).toBe(20);
    expect(scoreAnswer({ choice: 1, responseMs: 3_700 }, 1, 0).points).toBe(17);
    expect(scoreAnswer({ choice: 0, responseMs: 1_000 }, 1, 0).points).toBe(0);
    expect(scoreAnswer({ choice: null, responseMs: RULES.answerTimeMs }, 1, 6).points).toBe(0);
    expect(scoreAnswer({ choice: 0, responseMs: 200 }, 0, 6).points).toBe(40);
  });
  it('donne 160 points pour un sans-faute parfait', () => {
    const questions = prepareDuel(questionsOf('cg-melange'), 1);
    const answers = questions.map((q) => ({ choice: q.correctIndex, responseMs: 0 }));
    expect(totals(scoreAnswers(questions, answers)).points).toBe(MAX_DUEL_POINTS);
    expect(MAX_DUEL_POINTS).toBe(160);
  });
});

describe('résultat du duel', () => {
  it('victoire au score le plus haut, égalité à scores égaux', () => {
    expect(duelOutcome({ points: 120, correct: 5, totalResponseMs: 0 }, { points: 100, correct: 6, totalResponseMs: 0 })).toBe('win');
    expect(duelOutcome({ points: 90, correct: 6, totalResponseMs: 0 }, { points: 100, correct: 5, totalResponseMs: 0 })).toBe('loss');
    expect(duelOutcome({ points: 100, correct: 5, totalResponseMs: 9_000 }, { points: 100, correct: 6, totalResponseMs: 1_000 })).toBe('draw');
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
  it('limite le temps de lecture entre 1,5 et 3 s, ou utilise celui de la question', () => {
    expect(readingTimeMs('')).toBe(1_500);
    expect(readingTimeMs('x'.repeat(500))).toBe(3_000);
    expect(readingTimeMs('Texte', false, 2.2)).toBe(2_200);
    expect(readingTimeMs('Texte', false, 9)).toBe(3_000);
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
  it('aucun énoncé trop long n’est servi en duel', () => {
    for (const theme of THEMES) {
      const pool = questionsOf(theme.id);
      expect(pool.length).toBeGreaterThanOrEqual(RULES.questionsPerDuel);
      for (const q of pool) expect(q.text.length).toBeLessThanOrEqual(RULES.maxQuestionLength);
    }
  });
});

describe('progression', () => {
  it('seuils de niveau : seuil(n) = 100 × n^1,5', () => {
    expect(LEVEL_THRESHOLDS.slice(0, 5)).toEqual([0, 100, 283, 520, 800]);
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(283);
  });
  it('calcule le niveau à partir de l’XP', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, current: 0, needed: 100 });
    expect(levelFromXp(150)).toMatchObject({ level: 2, current: 50, needed: 183 });
    expect(levelFromXp(283).level).toBe(3);
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

import { computeRewards, xp } from './rewards';

describe('xp()', () => {
  const base = { score: 120, xpStart: 1_000, finished: true, forfeited: false };
  it('victoire : score + 40 + 100', () => {
    expect(xp({ ...base, outcome: 'win' })).toMatchObject({
      scorePoints: 120, finishBonus: 40, victoryBonus: 100, boostBonus: 0, xpGained: 260, xpBonus: 0, xpFinal: 1_260,
    });
  });
  it('égalité : score + 40 + 50 ; défaite : score + 40', () => {
    expect(xp({ ...base, outcome: 'draw' }).xpGained).toBe(210);
    expect(xp({ ...base, outcome: 'loss' }).xpGained).toBe(160);
  });
  it('boost ×2 : XP gagnée doublée, bonus = base', () => {
    expect(xp({ ...base, outcome: 'win', multiplier: 2 })).toMatchObject({ xpGained: 520, xpBonus: 260, xpFinal: 1_520 });
    expect(xp({ ...base, outcome: 'loss', score: 33, multiplier: 1.5 })).toMatchObject({ xpGained: 110, xpBonus: 37 });
  });
  it('abandon du joueur : score 0, XP 0', () => {
    for (const outcome of ['win', 'loss'] as const) {
      expect(xp({ ...base, outcome, finished: false, forfeited: true })).toMatchObject({ scorePoints: 0, xpGained: 0, xpFinal: 1_000 });
    }
  });
  it('abandon de l’adversaire : le joueur gagne avec bonus fin 40 + victoire 100', () => {
    expect(xp({ ...base, score: 30, finished: false, outcome: 'loss', opponentForfeited: true })).toMatchObject({
      finishBonus: 40, victoryBonus: 100, xpGained: 170,
    });
  });
  it('erreur (absent à la fin) : pas de bonus fin', () => {
    expect(computeRewards({ outcome: 'win', score: 50, finished: false, forfeited: false })).toEqual({
      scorePoints: 50, finishBonus: 0, victoryBonus: 100, boostBonus: 0, total: 150,
    });
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

import { botAnswer, botSkill } from './bot';

describe('bot', () => {
  const q = { id: 'q', text: 'Q', choices: ['a', 'b', 'c', 'd'], correctIndex: 2, difficulty: 2 as const };
  it('sa force dépend du niveau du joueur', () => {
    expect(botSkill(1)).toBe(0);
    expect(botSkill(30)).toBe(1);
    expect(botSkill(100)).toBe(1);
  });
  it('plus rapide et plus précis contre un joueur de haut niveau', () => {
    const rng = () => 0.7;
    const weak = botAnswer(q, rng, 1);
    const strong = botAnswer(q, rng, 30);
    expect(strong.responseMs).toBeLessThan(weak.responseMs);
    expect(weak.choice).not.toBe(2);
    expect(strong.choice).toBe(2);
  });
});

import { dailyQuests, nextMidnight, questDay, questIncrement, type Quest } from './quests';

describe('défis du jour', () => {
  it('3 objectifs reproductibles par joueur et par jour, dont une victoire dans un thème', () => {
    const a = dailyQuests('u1', '2026-11-05');
    expect(a).toHaveLength(3);
    expect(dailyQuests('u1', '2026-11-05')).toEqual(a);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    const win = a.find((q) => q.kind === 'win_theme')!;
    expect(win.label).toMatch(/^Gagne 2 matchs en /);
    expect(a.every((q) => q.reward > 0)).toBe(true);
    expect(dailyQuests('u1', '2026-11-05', ['sports-jo']).find((q) => q.kind === 'win_theme')!.themeId).toBe('sports-jo');
  });

  it('avancée apportée par un match', () => {
    const e = { themeId: 'sports-jo', outcome: 'win' as const, finished: true, correct: 6, fast: 2, score: 120 };
    const q = (kind: Quest['kind'], goal: number, themeId?: string): Quest => ({ id: kind, kind, label: '', goal, reward: 10, themeId });
    expect(questIncrement(q('play', 3), e)).toBe(1);
    expect(questIncrement(q('play', 3), { ...e, finished: false })).toBe(0);
    expect(questIncrement(q('correct', 15), e)).toBe(6);
    expect(questIncrement(q('fast', 5), e)).toBe(2);
    expect(questIncrement(q('win_theme', 2, 'sports-jo'), e)).toBe(1);
    expect(questIncrement(q('win_theme', 2, 'geo-capitales'), e)).toBe(0);
    expect(questIncrement(q('score', 100), e)).toBe(100);
    expect(questIncrement(q('score', 100), { ...e, score: 99 })).toBe(0);
  });

  it('jour et prochain minuit à Paris', () => {
    // 5 novembre 2026, 23 h 30 à Paris (UTC+1) = 22 h 30 UTC.
    const t = Date.UTC(2026, 10, 5, 22, 30);
    expect(questDay(t)).toBe('2026-11-05');
    expect(nextMidnight(t)).toBe(Date.UTC(2026, 10, 5, 23, 0));
    expect(questDay(Date.UTC(2026, 10, 5, 23, 10))).toBe('2026-11-06');
    // Heure d'été : minuit à Paris = 22 h UTC.
    expect(nextMidnight(Date.UTC(2026, 6, 1, 12, 0))).toBe(Date.UTC(2026, 6, 1, 22, 0));
  });
});
