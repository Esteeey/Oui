/**
 * Identité visuelle Qu1z : fond clair, bandeau bleu nuit et rose, accent rose.
 * L'écran de duel et celui des résultats gardent leurs propres couleurs (fond noir).
 */
export const Colors = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceRaised: '#EDEFF5',
  border: '#E3E6EE',
  text: '#121A33',
  textMuted: '#6B7290',
  /** Texte et icônes posés sur l'accent, le bandeau ou une couleur vive. */
  onAccent: '#FFFFFF',
  accent: '#E5155F',
  navy: '#14294A',
  /** Couleurs des joueurs dans le jeu (avatars du duel et des résultats). */
  player: '#FF6B57',
  opponent: '#13B5A3',
  correct: '#16A34A',
  wrong: '#E11D48',
  gold: '#E0A100',
} as const;

/** Dégradés (du début à la fin). */
export const Gradients = {
  header: ['#0B2342', '#123A63', '#1A4C7C'],
  accent: ['#FF3B83', '#D80F58'],
  banner: ['#15284A', '#3A2E5C', '#E5155F'],
} as const;

/** Ombre douce des cartes. */
export const Shadow = { boxShadow: '0 2px 12px rgba(18, 26, 51, 0.07)' } as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const Radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

export const MaxContentWidth = 560;
