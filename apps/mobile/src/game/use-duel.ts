import { useEffect, useReducer, useState } from 'react';

import {
  RULES,
  prepareDuel,
  questionsOf,
  readingTimeMs,
  scoreAnswers,
  totals,
  type DuelQuestion,
  type PlayerAnswer,
} from '@qu1z/shared';

import { botAnswer } from './bot';

export type DuelPhase = 'intro' | 'reading' | 'answering' | 'reveal' | 'finished';

interface DuelState {
  phase: DuelPhase;
  index: number;
  player: (PlayerAnswer | null)[];
  opponent: (PlayerAnswer | null)[];
  answeringStartedAt: number;
}

type Action =
  | { type: 'read'; index: number }
  | { type: 'answering'; at: number }
  | { type: 'player'; answer: PlayerAnswer }
  | { type: 'opponent'; answer: PlayerAnswer }
  | { type: 'timeout' }
  | { type: 'finish' };

const NO_ANSWER: PlayerAnswer = { choice: null, responseMs: RULES.answerTimeMs };

function setAt<T>(list: T[], index: number, value: T): T[] {
  const next = [...list];
  next[index] = value;
  return next;
}

function reducer(state: DuelState, action: Action): DuelState {
  switch (action.type) {
    case 'read':
      return { ...state, phase: 'reading', index: action.index };
    case 'answering':
      return { ...state, phase: 'answering', answeringStartedAt: action.at };
    case 'player':
    case 'opponent': {
      const key = action.type;
      if (state.phase !== 'answering' || state[key][state.index]) return state;
      const next = { ...state, [key]: setAt(state[key], state.index, action.answer) };
      const bothAnswered = next.player[state.index] && next.opponent[state.index];
      return bothAnswered ? { ...next, phase: 'reveal' } : next;
    }
    case 'timeout':
      if (state.phase !== 'answering') return state;
      return {
        ...state,
        phase: 'reveal',
        player: setAt(state.player, state.index, state.player[state.index] ?? NO_ANSWER),
        opponent: setAt(state.opponent, state.index, state.opponent[state.index] ?? NO_ANSWER),
      };
    case 'finish':
      return { ...state, phase: 'finished' };
  }
}

/**
 * Déroulé local d'un duel de 7 questions contre le bot d'entraînement.
 * Le même déroulé sera piloté par le serveur de jeu pour les duels en ligne.
 */
export function useDuel(themeId: string) {
  const [questions] = useState<DuelQuestion[]>(() =>
    prepareDuel(questionsOf(themeId), Math.floor(Math.random() * 2 ** 31)),
  );
  const [state, dispatch] = useReducer(reducer, {
    phase: 'intro',
    index: 0,
    player: Array(questions.length).fill(null),
    opponent: Array(questions.length).fill(null),
    answeringStartedAt: 0,
  });

  const question = questions[state.index];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    switch (state.phase) {
      case 'intro':
        later(RULES.introMs, () => dispatch({ type: 'read', index: 0 }));
        break;
      case 'reading':
        later(readingTimeMs(question.text, !!question.image), () => dispatch({ type: 'answering', at: Date.now() }));
        break;
      case 'answering': {
        const plan = botAnswer(question);
        if (plan.choice !== null) {
          later(plan.responseMs, () => dispatch({ type: 'opponent', answer: plan }));
        }
        later(RULES.answerTimeMs, () => dispatch({ type: 'timeout' }));
        break;
      }
      case 'reveal':
        later(RULES.revealMs, () =>
          dispatch(
            state.index + 1 < questions.length
              ? { type: 'read', index: state.index + 1 }
              : { type: 'finish' },
          ),
        );
        break;
    }
    return () => timers.forEach(clearTimeout);
  }, [state.phase, state.index, question, questions.length]);

  const answer = (choice: number) => {
    const responseMs = Math.min(Date.now() - state.answeringStartedAt, RULES.answerTimeMs);
    dispatch({ type: 'player', answer: { choice, responseMs } });
  };

  // Seules les questions révélées comptent dans les scores affichés.
  const revealedCount =
    state.phase === 'reveal' || state.phase === 'finished' ? state.index + 1 : state.index;
  const revealed = questions.slice(0, revealedCount);
  const player = scoreAnswers(revealed, state.player.slice(0, revealedCount) as PlayerAnswer[]);
  const opponent = scoreAnswers(revealed, state.opponent.slice(0, revealedCount) as PlayerAnswer[]);

  return {
    questions,
    question,
    phase: state.phase,
    index: state.index,
    answeringStartedAt: state.answeringStartedAt,
    playerAnswer: state.player[state.index],
    opponentAnswered: state.opponent[state.index] !== null,
    opponentAnswer: state.opponent[state.index],
    player,
    opponent,
    playerTotals: totals(player),
    opponentTotals: totals(opponent),
    answer,
  };
}
