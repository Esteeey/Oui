export const MAX_LEVEL = 100;

/**
 * Seuils de niveau (À AJUSTER) : `LEVEL_THRESHOLDS[n]` est l'XP totale à atteindre pour passer du niveau n
 * au niveau n + 1, soit seuil(n) = 100 × n^1,5 arrondi (100, 283, 520, 800…). L'index 0 vaut 0 (niveau 1 de départ).
 * Le tableau peut être remplacé par d'autres valeurs, tant qu'elles restent croissantes.
 */
export const LEVEL_THRESHOLDS: readonly number[] = Array.from({ length: MAX_LEVEL }, (_, n) => (n === 0 ? 0 : Math.round(100 * n ** 1.5)));

/** XP totale nécessaire pour atteindre un niveau : 0 (niveau 1), 100 (niveau 2), 283 (niveau 3)… */
export function xpForLevel(level: number): number {
  const l = Math.min(Math.max(level, 1), MAX_LEVEL);
  return LEVEL_THRESHOLDS[l - 1];
}

export interface LevelInfo {
  level: number;
  /** XP gagnée depuis le début du niveau actuel. */
  current: number;
  /** XP nécessaire pour passer au niveau suivant (0 au niveau maximal). */
  needed: number;
  progress: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  if (level === MAX_LEVEL) return { level, current: 0, needed: 0, progress: 1 };
  const start = xpForLevel(level);
  const needed = xpForLevel(level + 1) - start;
  const current = xp - start;
  return { level, current, needed, progress: current / needed };
}

const TITLES: [number, string][] = [
  [50, 'Érudit'],
  [25, 'Expert'],
  [10, 'Passionné'],
  [5, 'Amateur'],
  [1, 'Débutant'],
];

/** Titres débloqués à un niveau global donné (du plus récent au plus ancien). */
export function unlockedTitles(level: number): string[] {
  return TITLES.filter(([min]) => level >= min).map(([, title]) => title);
}

export function titleForLevel(level: number): string {
  return TITLES.find(([min]) => level >= min)?.[1] ?? 'Débutant';
}
