export type CategoryId =
  | 'culture-generale'
  | 'cinema'
  | 'series'
  | 'jeux-video'
  | 'sports'
  | 'musique'
  | 'histoire'
  | 'geographie'
  | 'sciences'
  | 'automobile'
  | 'gastronomie'
  | 'animaux-nature'
  | 'technologie'
  | 'mode-luxe'
  | 'litterature-bd'
  | 'culture-pop'
  | 'marques';

export interface Category {
  id: CategoryId;
  name: string;
  /** Pictogramme provisoire, en attendant les illustrations originales. */
  icon: string;
  color: string;
}

export interface Theme {
  id: string;
  categoryId: CategoryId;
  name: string;
  description: string;
  iconUrl?: string | null;
  coverUrl?: string | null;
  questionCount?: number;
  /** Les 5 titres du thème, saisis dans l'admin pour un thème créé après coup. */
  titles?: readonly [string, string, string, string, string] | null;
}

export type Difficulty = 1 | 2 | 3;

/** Question telle qu'elle est stockée : la première proposition est la bonne réponse. */
export interface Question {
  id: string;
  themeId: string;
  text: string;
  /** `[bonne réponse, leurre, leurre, leurre]` — mélangées au moment du duel. */
  choices: [string, string, string, string];
  difficulty: Difficulty;
  /**
   * Illustration facultative : une clé d'image embarquée dans l'application
   * (ex. `flags/japon`) ou une adresse `https://` servie par le serveur.
   */
  image?: string;
  /** Temps de lecture de l'énoncé seul, en secondes (1,5 à 3). Absent : calculé d'après la longueur du texte. */
  readingSeconds?: number;
}

/** Question préparée pour un duel : propositions mélangées. */
export interface DuelQuestion {
  id: string;
  text: string;
  choices: string[];
  correctIndex: number;
  difficulty: Difficulty;
  image?: string;
  readingSeconds?: number;
}

export interface PlayerAnswer {
  /** Index choisi, ou `null` si le temps est écoulé. */
  choice: number | null;
  /** Temps de réponse en ms (le temps maximal si pas de réponse). */
  responseMs: number;
}

export interface ScoredAnswer extends PlayerAnswer {
  correct: boolean;
  points: number;
}

export type DuelOutcome = 'win' | 'loss' | 'draw';
