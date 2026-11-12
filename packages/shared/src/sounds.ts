/**
 * Sons du jeu modifiables depuis le panneau d'administration.
 * Chaque identifiant correspond à un moment précis du jeu ; l'appli garde un son d'origine pour chacun.
 */
export const GAME_SOUNDS = [
  { id: 'playMenu', kind: 'effect', label: 'Ouverture du menu Jouer', when: 'À l’ouverture de l’animation du menu Jouer' },
  { id: 'launch', kind: 'effect', label: 'Lancement de partie', when: 'Au démarrage d’un duel ou d’un défi' },
  { id: 'pinPop', kind: 'effect', label: 'Pop d’épingle', when: 'Chaque épingle qui apparaît pendant la recherche' },
  { id: 'versus', kind: 'effect', label: 'Entrée VS', when: 'Choc des deux moitiés de l’intro' },
  { id: 'question', kind: 'effect', label: 'Nouvelle question', when: 'À chaque question' },
  { id: 'choices', kind: 'effect', label: 'Réponses affichées', when: 'Quand les réponses apparaissent et que le chrono démarre' },
  { id: 'bonusRound', kind: 'effect', label: 'Manche bonus', when: 'Dernière question, points ×2' },
  { id: 'answered', kind: 'effect', label: 'Réponse validée', when: 'Quand on touche une réponse' },
  { id: 'tick', kind: 'effect', label: 'Tic-tac', when: 'Les 5 dernières secondes' },
  { id: 'correct', kind: 'effect', label: 'Bonne réponse', when: 'À la révélation' },
  { id: 'wrong', kind: 'effect', label: 'Mauvaise réponse', when: 'À la révélation' },
  { id: 'timeout', kind: 'effect', label: 'Temps écoulé', when: 'Révélation sans réponse' },
  { id: 'opponentCorrect', kind: 'effect', label: 'Adversaire : juste', when: 'Juste après son propre son' },
  { id: 'opponentWrong', kind: 'effect', label: 'Adversaire : faux', when: 'Juste après son propre son' },
  { id: 'endWin', kind: 'effect', label: 'Coup de victoire', when: 'Arrivée sur l’écran de fin' },
  { id: 'endLoss', kind: 'effect', label: 'Coup de défaite', when: 'Arrivée sur l’écran de fin' },
  { id: 'endDraw', kind: 'effect', label: 'Coup d’égalité', when: 'Arrivée sur l’écran de fin' },
  { id: 'xp', kind: 'effect', label: 'XP qui monte', when: 'Écran de fin, si on gagne de l’XP' },
  { id: 'xpTick', kind: 'effect', label: 'Cran d’XP', when: 'Chaque cran qui remplit l’anneau d’XP en fin de partie' },
  { id: 'xpEnd', kind: 'effect', label: 'Fin de la montée d’XP', when: 'Juste après l’XP' },
  { id: 'levelUp', kind: 'effect', label: 'Passage de niveau', when: 'Si le niveau augmente' },
  { id: 'musicSearch', kind: 'music', label: 'Musique de recherche', when: 'En boucle pendant la recherche d’adversaire' },
  { id: 'musicDuel', kind: 'music', label: 'Musique de duel', when: 'En boucle pendant toute la partie' },
  { id: 'musicWin', kind: 'music', label: 'Musique de victoire', when: 'Écran de fin' },
  { id: 'musicLoss', kind: 'music', label: 'Musique de défaite', when: 'Écran de fin' },
  { id: 'musicDraw', kind: 'music', label: 'Musique d’égalité', when: 'Écran de fin' },
] as const;

export type GameSoundId = (typeof GAME_SOUNDS)[number]['id'];

export const isGameSoundId = (id: unknown): id is GameSoundId => GAME_SOUNDS.some((s) => s.id === id);

/** Taille maximale d'un son envoyé (une musique MP3 de quelques minutes). */
export const SOUND_MAX_BYTES = 10 * 1024 * 1024;

/** Formats lus partout (iPhone, Android, navigateur). */
export const SOUND_FORMATS_LABEL = 'WAV, MP3 ou M4A';

/** Son remplacé depuis l'administration. `url` : chemin servi par le serveur de jeu (`/sounds/…`). */
export interface SoundOverride {
  id: GameSoundId;
  url: string;
  contentType: string;
  bytes: number;
  fileName: string | null;
  updatedAt: number;
  updatedBy: string | null;
}
