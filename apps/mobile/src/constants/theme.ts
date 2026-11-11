/**
 * Identité visuelle QuizX : fond pastel très clair, cartes blanches, textes bleu nuit, rose vif réservé aux actions.
 * L'écran de duel et celui des résultats gardent leurs propres couleurs (fond noir).
 */
const CLASSIC = {
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
  textSoft: '#6E6A7B',
  /** Violet des filtres, des icônes de publication et de l'action « Suivre ». */
  violetInk: '#5B17B0',
  /** Texte et icônes posés sur l'accent ou une couleur vive. */
  onAccent: '#FFFFFF',
  /** Rose vif : actions principales et éléments actifs. */
  accent: '#FC0266',
  /** Même rose pour les textes posés sur fond clair. */
  accentInk: '#FC0266',
  /** Même rose pour les fonds pleins. */
  accentFill: '#FC0266',
  /** Violet : rangs et visuels de duel. */
  secondary: '#7B2FFF',
  /** Turquoise : informations positives, version lisible en texte. */
  infoInk: '#007A64',
  /** Contour commun à toutes les photos de profil. */
  avatarRing: '#FBA6E0',
  navy: '#0E0F2B',
  /** Couleurs des joueurs dans le jeu (avatars du duel et des résultats). */
  player: '#FF6B57',
  opponent: '#13B5A3',
  correct: '#15803D',
  wrong: '#E11D48',
  warning: '#F5B800',
  gold: '#E0A100',
  /** Or assombri pour les textes sur fond clair (contraste). */
  goldInk: '#8F6A00',
  /** Or vif du bandeau et des décorations de rang. */
  goldBright: '#FFC928',
  goldDeep: '#C98A00',
};

type Palette = { [K in keyof typeof CLASSIC]: string };

/** Palette d'origine, figée : le profil et le duel la gardent quel que soit le thème choisi. */
export const ClassicColors: Readonly<Palette> = Object.freeze({ ...CLASSIC });

/** Palette « Lagon » : turquoise, bleu profond et rose flashy, à plat. */
const LAGON: Partial<Palette> = {
  background: '#E8F6F7',
  surface: '#FFFFFF',
  surfaceRaised: '#D3EEF0',
  border: '#CDE5E9',
  text: '#0B3C5D',
  ink: '#0B3C5D',
  textMuted: '#4F7183',
  textSoft: '#6E93A3',
  violetInk: '#0B3C5D',
  accent: '#FF2E88',
  accentInk: '#D3166E',
  accentFill: '#FF2E88',
  avatarRing: '#7FD1D9',
  navy: '#0B3C5D',
};

export type AppThemeId = 'classic' | 'lagon' | 'arene';
export const APP_THEME_KEY = 'qu1z.appTheme';
let currentTheme: AppThemeId = 'arene';
export const appThemeId = () => currentTheme;
/** Thème « Arène » : palette Lagon + touches de jeu (relief, barre d'XP, titres Lilita One). */
export const isArena = () => currentTheme === 'arene';

/** Couleurs de l'app (hors profil et duel). Modifiées une seule fois, au démarrage, par `applyAppTheme`. */
export const Colors: Palette = { ...CLASSIC };

/** Applique la palette enregistrée ; à appeler avant le chargement des écrans (voir `index.js`). */
export function applyAppTheme(id: string | null | undefined): void {
  currentTheme = id === 'lagon' || id === 'classic' ? id : 'arene';
  Object.assign(Colors, CLASSIC, currentTheme === 'classic' ? {} : LAGON);
}

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

/** Couleurs du logo : à changer ici seulement, elles s'appliquent partout. */
export const LogoColors = { top: Colors.accent, bottom: Colors.secondary } as const;

export const MaxContentWidth = 560;
/** Hauteur de la barre de navigation, hors zone de sécurité du téléphone. */
export const NavBarLift = 6;
export const NavBarHeight = 66 + NavBarLift;

/** Police embarquée des scores (Inter Black, licence OFL) et Poppins pour le reste de l'interface. */
export const Fonts = {
  score: 'Inter_900Black',
  regular: 'Poppins_400Regular',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
  /** Titres du thème Arène (Lilita One, licence OFL). */
  display: 'LilitaOne_400Regular',
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
