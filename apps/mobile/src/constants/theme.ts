/**
 * Identité visuelle QuizX : fond pastel très clair, cartes blanches, textes bleu nuit, rose vif réservé aux actions.
 * L'écran de duel et celui des résultats gardent leurs propres couleurs (fond noir).
 */
export const Colors = {
  background: '#F7F5FB',
  surface: '#FFFFFF',
  surfaceRaised: '#F4F0FF',
  /** Fond des profils, sous le fondu de la couverture. */
  profileBackground: '#E6E3F9',
  /** Cartes posées sur le fond des profils. */
  profileCard: '#F5F1FC',
  border: '#E4E2EC',
  text: '#0E0F2B',
  /** Violet très sombre des titres et pseudos du fil. */
  ink: '#250A44',
  textMuted: '#5D6B6B',
  /** Gris de la date d'une publication et du champ « Quoi de neuf ? ». */
  textSoft: '#8A8696',
  /** Violet des filtres, des icônes de publication et de l'action « Suivre ». */
  violetInk: '#5B17B0',
  /** Texte et icônes posés sur l'accent ou une couleur vive. */
  onAccent: '#FFFFFF',
  /** Rose vif : actions principales et éléments actifs. */
  accent: '#FF007A',
  /** Rose vif assombri pour les petits textes sur fond blanc (contraste). */
  accentInk: '#D6006A',
  /** Violet : rangs et visuels de duel. */
  secondary: '#7B2FFF',
  /** Turquoise : informations positives, version lisible en texte. */
  infoInk: '#00A886',
  /** Contour commun à toutes les photos de profil. */
  avatarRing: '#FBA6E0',
  navy: '#0E0F2B',
  /** Couleurs des joueurs dans le jeu (avatars du duel et des résultats). */
  player: '#FF6B57',
  opponent: '#13B5A3',
  correct: '#16A34A',
  wrong: '#E11D48',
  warning: '#F5B800',
  gold: '#E0A100',
  /** Or vif du bandeau et des décorations de rang. */
  goldBright: '#FFC928',
  goldDeep: '#C98A00',
} as const;

/** Dégradés (du début à la fin) : réservés aux visuels de duel. */
export const Gradients = {
  accent: [Colors.accent, Colors.accent],
  banner: ['#4A1FB8', '#7B2FFF', '#C81FB0'],
} as const;

/** Ombre presque imperceptible des cartes. */
export const Shadow = { boxShadow: '0 2px 10px rgba(14, 15, 43, 0.05)' } as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const MaxContentWidth = 560;
/** Hauteur de la barre de navigation, hors zone de sécurité du téléphone. */
export const NavBarHeight = 66;

/** Police embarquée des scores (Inter Black, licence OFL) et Poppins pour le reste de l'interface. */
export const Fonts = {
  score: 'Inter_900Black',
  regular: 'Poppins_400Regular',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

/** Famille Poppins correspondant à une graisse (Android n'applique pas `fontWeight` à une police embarquée). */
export function fontForWeight(weight: string | number | undefined): string {
  switch (String(weight ?? '400')) {
    case '900':
    case '800':
      return Fonts.extraBold;
    case '700':
    case 'bold':
      return Fonts.bold;
    case '600':
    case '500':
      return Fonts.semiBold;
    default:
      return Fonts.regular;
  }
}
