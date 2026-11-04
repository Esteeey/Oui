/** Règles d'un duel Qu1z. Le serveur les applique, le client s'en sert pour l'affichage. */
export const RULES = {
  questionsPerDuel: 7,
  choicesPerQuestion: 4,
  /** Temps pour répondre, une fois les propositions affichées. */
  answerTimeMs: 10_000,
  /** Temps de lecture de l'énoncé seul (selon sa longueur). */
  minReadingMs: 1_000,
  maxReadingMs: 3_000,
  readingMsPerChar: 20,
  /** Temps de lecture supplémentaire pour regarder une illustration. */
  imageReadingBonusMs: 1_000,
  /** Affichage de la bonne réponse et du choix de l'adversaire. */
  revealMs: 2_000,
  /** Fondu au noir à la fin de la révélation, avant la question suivante. */
  transitionMs: 400,
  /** Écran « Manche N » (catégorie, numéro de manche) au début de chaque question, avant l'énoncé. */
  roundCardMs: 2_800,
  /** Présentation des deux joueurs avant la première question. */
  introMs: 3_500,

  /** Points par seconde restante sur une bonne réponse (20 au maximum avec un chrono de 10 s). */
  pointsPerSecond: 2,
  /** Multiplicateur de la dernière question. */
  lastQuestionMultiplier: 2,
} as const;

export function readingTimeMs(text: string, hasImage = false): number {
  const ms = RULES.minReadingMs + text.length * RULES.readingMsPerChar;
  const base = Math.min(RULES.maxReadingMs, Math.max(RULES.minReadingMs, ms));
  return hasImage ? base + RULES.imageReadingBonusMs : base;
}
