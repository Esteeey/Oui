import { THEMES, getTheme } from './catalog';
import type { DuelOutcome } from './types';

/**
 * Défis du jour : 3 objectifs par joueur et par jour, tirés au sort de façon reproductible (même joueur, même
 * jour → mêmes objectifs), avec une récompense en XP versée dès que l'objectif est atteint. Ils changent à minuit.
 */

/** Fuseau horaire du changement de jour (minuit). À AJUSTER si l'app vise d'autres pays. */
export const QUEST_TIME_ZONE = 'Europe/Paris';

export type QuestKind = 'win_theme' | 'play' | 'correct' | 'fast' | 'score';

export interface Quest {
  id: string;
  kind: QuestKind;
  label: string;
  goal: number;
  /** XP versée quand l'objectif est atteint (ajoutée à l'XP totale). */
  reward: number;
  themeId?: string;
}

export interface QuestView extends Quest {
  progress: number;
  done: boolean;
}

export interface DailyQuests {
  /** Jour, au format AAAA-MM-JJ, dans le fuseau `QUEST_TIME_ZONE`. */
  day: string;
  /** Prochain minuit (ms) : nouveaux objectifs. */
  resetsAt: number;
  quests: QuestView[];
}

/** Ce qu'un match terminé apporte aux objectifs. */
export interface QuestEvent {
  themeId: string;
  outcome: DuelOutcome;
  /** Partie jouée jusqu'au bout (pas d'abandon). */
  finished: boolean;
  correct: number;
  /** Bonnes réponses données en moins de `FAST_ANSWER_MS`. */
  fast: number;
  score: number;
}

export const FAST_ANSWER_MS = 3000;

/** Modèles d'objectifs, du plus simple au plus exigeant. À AJUSTER : objectifs et récompenses. */
const TEMPLATES: { kind: QuestKind; goal: number; reward: number; label: (theme: string) => string }[] = [
  { kind: 'play', goal: 3, reward: 50, label: () => 'Joue 3 matchs' },
  { kind: 'correct', goal: 15, reward: 60, label: () => 'Donne 15 bonnes réponses' },
  { kind: 'fast', goal: 5, reward: 70, label: () => 'Réponds juste en moins de 3 s, 5 fois' },
  { kind: 'win_theme', goal: 2, reward: 100, label: (theme) => `Gagne 2 matchs en ${theme}` },
  { kind: 'score', goal: 100, reward: 80, label: () => 'Marque au moins 100 points dans un match' },
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Les 3 objectifs du jour d'un joueur : toujours un objectif de victoire dans un thème, plus deux autres. */
export function dailyQuests(userId: string, day: string, themeIds: string[] = THEMES.map((t) => t.id)): Quest[] {
  const seed = hash(`${userId}:${day}`);
  const themes = themeIds.filter((id) => getTheme(id));
  const themeId = themes.length ? themes[seed % themes.length] : THEMES[0].id;
  const others = TEMPLATES.filter((t) => t.kind !== 'win_theme');
  const first = others[(seed >>> 4) % others.length];
  const rest = others.filter((t) => t !== first);
  const second = rest[(seed >>> 8) % rest.length];
  const win = TEMPLATES.find((t) => t.kind === 'win_theme')!;
  return [first, second, win].map((t) => ({
    id: t.kind === 'win_theme' ? `${t.kind}:${themeId}` : t.kind,
    kind: t.kind,
    goal: t.goal,
    reward: t.reward,
    label: t.label(getTheme(themeId)?.name ?? themeId),
    ...(t.kind === 'win_theme' ? { themeId } : {}),
  }));
}

/** Avancée apportée par un match à un objectif (0 si rien). */
export function questIncrement(q: Quest, e: QuestEvent): number {
  switch (q.kind) {
    case 'play':
      return e.finished ? 1 : 0;
    case 'correct':
      return e.correct;
    case 'fast':
      return e.fast;
    case 'win_theme':
      return e.outcome === 'win' && e.themeId === q.themeId ? 1 : 0;
    case 'score':
      return e.score >= q.goal ? q.goal : 0;
  }
}

function localParts(now: number, timeZone: string): { y: number; m: number; d: number; offsetMs: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const asUtc = Date.UTC(y, m - 1, d, Number(parts.hour), Number(parts.minute), Number(parts.second));
  return { y, m, d, offsetMs: asUtc - Math.floor(now / 1000) * 1000 };
}

/** Jour courant (AAAA-MM-JJ) dans le fuseau donné. */
export function questDay(now: number, timeZone = QUEST_TIME_ZONE): string {
  const { y, m, d } = localParts(now, timeZone);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Prochain minuit (ms) dans le fuseau donné. */
export function nextMidnight(now: number, timeZone = QUEST_TIME_ZONE): number {
  const { y, m, d, offsetMs } = localParts(now, timeZone);
  return Date.UTC(y, m - 1, d + 1) - offsetMs;
}
