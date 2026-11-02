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
  /** Affichage de la bonne réponse et du choix de l'adversaire. */
  revealMs: 2_000,
  /** Présentation des deux joueurs avant la première question. */
  introMs: 2_500,

  basePoints: 60,
  maxSpeedBonus: 40,
  /** Le bonus de série s'applique à partir de la N-ième bonne réponse consécutive. */
  streakFrom: 3,
  streakBonus: 10,
} as const;

export function readingTimeMs(text: string): number {
  const ms = RULES.minReadingMs + text.length * RULES.readingMsPerChar;
  return Math.min(RULES.maxReadingMs, Math.max(RULES.minReadingMs, ms));
}
