/**
 * Règles d'un duel Qu1z. Le serveur les applique, le client s'en sert pour l'affichage.
 *
 * Déroulement d'une manche (×7) :
 * 1. « Manche N » pendant `roundCardMs` (2000 ms) ;
 * 2. la question seule pendant son temps de lecture (`readingSeconds` × 1000, entre 1,5 et 3 s) ;
 * 3. les 4 réponses apparaissent, le chrono démarre `choicesLeadMs` (400 ms) plus tard ;
 * 4. chrono de 10 s, le temps écoulé est mesuré depuis le début du chrono ;
 * 5. la manche se termine quand les deux joueurs ont répondu ou quand les 10 s sont écoulées (pas de réponse = faux) ;
 * 6. révélation (bonne réponse en vert, mauvaise en rouge, réponse de l'adversaire) pendant `revealMs` (1000 ms) ;
 * 7. pause de `transitionMs` (500 ms), puis manche suivante.
 */
export const RULES = {
  questionsPerDuel: 7,
  choicesPerQuestion: 4,
  /** Chrono, une fois les propositions affichées et le délai `choicesLeadMs` passé. */
  answerTimeMs: 10_000,
  /** Délai entre l'apparition des 4 réponses et le début du chrono. */
  choicesLeadMs: 400,
  /** Temps de lecture de l'énoncé seul, quand la question ne fixe pas le sien (selon sa longueur). */
  minReadingMs: 1_500,
  maxReadingMs: 3_000,
  readingMsPerChar: 20,
  /** Temps de lecture supplémentaire pour regarder une illustration. */
  imageReadingBonusMs: 1_000,
  /** Affichage de la bonne réponse et du choix de l'adversaire. */
  revealMs: 1_000,
  /** Pause (fondu au noir) après la révélation, avant la manche suivante. */
  transitionMs: 500,
  /** Écran « Manche N » au début de chaque question, avant l'énoncé. */
  roundCardMs: 2_000,
  /** Présentation des deux joueurs avant la première question. */
  introMs: 6_500,

  /** Multiplicateur de la dernière question. */
  lastQuestionMultiplier: 2,
} as const;

/**
 * Temps de lecture de l'énoncé seul (ms). `readingSeconds` est le temps de lecture propre à la question
 * (« tempsDeLecture ») ; sans lui, il est calculé d'après la longueur du texte, entre 1,5 et 3 s.
 */
export function readingTimeMs(text: string, hasImage = false, readingSeconds?: number): number {
  const ms = readingSeconds !== undefined ? readingSeconds * 1000 : RULES.minReadingMs + text.length * RULES.readingMsPerChar;
  const base = Math.min(RULES.maxReadingMs, Math.max(RULES.minReadingMs, ms));
  return hasImage ? base + RULES.imageReadingBonusMs : base;
}
