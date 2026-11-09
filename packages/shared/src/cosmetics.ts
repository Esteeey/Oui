import { getTheme } from './catalog';

/** Niveaux de thème qui débloquent les 5 titres d'un thème. Le dernier titre est le plus prestigieux. */
export const THEME_TITLE_LEVELS = [1, 10, 25, 50, 100] as const;

export type ThemeTitles = readonly [string, string, string, string, string];

/** Titres d'un thème sans liste propre (thème créé sans titres dans l'admin). */
export const GENERIC_THEME_TITLES: ThemeTitles = ['Débutant', 'Amateur', 'Passionné', 'Expert', 'Érudit'];

const THEME_TITLES: Record<string, ThemeTitles> = {
  'cg-melange': ['Touche-à-tout', 'Fouineur', 'Tête bien faite', 'Puits de science', 'Génie universel'],
  'geo-capitales': ['Touriste', 'Globe-trotteur', 'Cartographe', 'Ambassadeur', 'Maître du Monde'],
  'geo-drapeaux': ['Porte-fanion', 'Gardien du mât', 'Vexillologue', 'Porte-étendard', 'Seigneur des Bannières'],
  'sci-essentiels': ['Apprenti chimiste', 'Blouse blanche', 'Chercheur', 'Docteur ès sciences', 'Génie des Sciences'],
  'cine-grands-films': ['Mangeur de pop-corn', 'Cinéphile', 'Critique', 'Réalisateur', 'Légende du 7e art'],
  'sports-jo': ['Spectateur', 'Qualifié', 'Finaliste', 'Porte-drapeau', 'Légende des Jeux'],
  'hist-grandes-dates': ['Écolier', 'Chroniqueur', 'Archiviste', 'Historien', 'Mémoire des Siècles'],
  'nature-animaux': ['Promeneur de chien', 'Garde forestier', 'Soigneur', 'Zoologue', 'Roi des Animaux'],
  'music-hits': ['Chanteur de douche', 'Roi du karaoké', 'Disquaire', 'Producteur', 'Disque de Diamant'],
  'gaming-cult': ['Noob', 'Joueur du dimanche', 'Speedrunner', 'Boss de fin', 'Dieu du Pixel'],
  'food-world': ['Goûteur', 'Commis', 'Sous-chef', 'Chef étoilé', 'Palais d’Or'],
  'tech-inventions': ['Bricoleur', 'Bidouilleur', 'Ingénieur', 'Inventeur', 'Génie visionnaire'],
  'nature-faune': ['Ami des bêtes', 'Pisteur', 'Naturaliste', 'Grand Explorateur', 'Gardien de la Faune'],
  'culture-logique': ['Tête en l’air', 'Déchiffreur', 'Stratège', 'Sphinx', 'Cerveau Suprême'],
  'culture-celebrites': ['Lecteur de potins', 'Paparazzi', 'Invité VIP', 'Star du tapis rouge', 'Icône Mondiale'],
  'culture-divertissement': ['Zappeur', 'Spectateur assidu', 'Animateur', 'Showman', 'Roi du Spectacle'],
  'culture-familial': ['Petit dernier', 'Cousin malin', 'Tonton je-sais-tout', 'Sage de la famille', 'Chef de Clan'],
  'histoire-antique': ['Plébéien', 'Légionnaire', 'Centurion', 'Sénateur', 'Empereur'],
  'histoire-moderne': ['Retardataire', 'Gardien des dates', 'Annaliste', 'Mémorialiste', 'Maître du Temps'],
  'loisirs-passe-temps': ['Flâneur', 'Bon vivant', 'Collectionneur', 'Maître artisan', 'Roi des Loisirs'],
  humanites: ['Gribouilleur', 'Esthète', 'Mécène', 'Philosophe', 'Maître des Arts'],
  'litterature-auteurs': ['Feuilleteur', 'Rat de bibliothèque', 'Critique littéraire', 'Académicien', 'Plume d’Or'],
  'litterature-oeuvres': ['Lecteur de résumés', 'Liseur', 'Conteur', 'Bibliothécaire', 'Gardien des Récits'],
  'cinema-acteurs': ['Figurant', 'Second rôle', 'Tête d’affiche', 'Star d’Hollywood', 'Monstre Sacré'],
  'musique-artistes': ['Groupie', 'Musicien de rue', 'Soliste', 'Virtuose', 'Maestro'],
  'musique-cultures': ['Siffloteur', 'Tambourineur', 'Mélomane', 'Chef d’orchestre', 'Oreille Absolue'],
  personnalites: ['Commère', 'Confident', 'Biographe', 'Éminence grise', 'Légende vivante'],
  'mythes-religions': ['Simple mortel', 'Initié', 'Oracle', 'Demi-dieu', 'Divinité Suprême'],
  'sports-equipes': ['Remplaçant', 'Titulaire', 'Capitaine', 'Sélectionneur', 'Légende du Sport'],
  'logos-marques': ['Zappeur de pubs', 'Graphiste', 'Œil de lynx', 'Directeur artistique', 'Roi des Logos'],
};

export function themeTitles(themeId: string): ThemeTitles {
  return getTheme(themeId)?.titles ?? THEME_TITLES[themeId] ?? GENERIC_THEME_TITLES;
}

/** Nombre de titres débloqués à ce niveau de thème (0 à 5). */
export function themeTitleTier(level: number): number {
  return THEME_TITLE_LEVELS.filter((min) => level >= min).length;
}

/** Titres débloqués dans un thème, du plus prestigieux au moins prestigieux. */
export function unlockedThemeTitles(themeId: string, level: number): string[] {
  return themeTitles(themeId).slice(0, themeTitleTier(level)).reverse();
}

export function themeTitleForLevel(themeId: string, level: number): string {
  return unlockedThemeTitles(themeId, level)[0] ?? themeTitles(themeId)[0];
}

export type DecorId = 'gris' | 'jaune' | 'vert' | 'bleu' | 'etoiles' | 'lauriers' | 'couronne-or' | 'couronne-rouge' | 'ailes' | 'diamant';

export interface Decor {
  id: DecorId;
  name: string;
  /** `theme` : ce niveau atteint dans n'importe quel thème. */
  unlock: { kind: 'account' | 'theme'; level: number };
}

/** Décors du titre, du moins rare au plus rare. */
export const DECORS: readonly Decor[] = [
  { id: 'gris', name: 'Gris', unlock: { kind: 'account', level: 1 } },
  { id: 'jaune', name: 'Jaune', unlock: { kind: 'account', level: 5 } },
  { id: 'vert', name: 'Vert rayé', unlock: { kind: 'account', level: 10 } },
  { id: 'bleu', name: 'Bleu', unlock: { kind: 'account', level: 20 } },
  { id: 'etoiles', name: 'Violet étoilé', unlock: { kind: 'theme', level: 25 } },
  { id: 'lauriers', name: 'Framboise et lauriers', unlock: { kind: 'account', level: 35 } },
  { id: 'couronne-or', name: 'Couronne d’or', unlock: { kind: 'account', level: 50 } },
  { id: 'couronne-rouge', name: 'Couronne rouge', unlock: { kind: 'theme', level: 50 } },
  { id: 'ailes', name: 'Ailes violettes', unlock: { kind: 'account', level: 75 } },
  { id: 'diamant', name: 'Diamant', unlock: { kind: 'theme', level: 100 } },
];

/** Décors débloqués, du moins rare au plus rare. */
export function unlockedDecors(accountLevel: number, bestThemeLevel: number): DecorId[] {
  return DECORS.filter((d) => (d.unlock.kind === 'account' ? accountLevel : bestThemeLevel) >= d.unlock.level).map((d) => d.id);
}

/** Conditions pour obtenir une banderole, comptées depuis le début jusqu'à la fin du mois concerné. À AJUSTER. */
export const BANNER_MIN_DUELS = 20;
export const BANNER_MIN_PLAYERS = 10;

export interface ProfileBanner {
  /** « current:{thème} » pour le mois en cours, « {AAAA-MM}:{thème} » pour un mois terminé. */
  key: string;
  themeId: string;
  themeName: string;
  /** Mois gagné (« Novembre 2026 ») ; absent pendant le mois en cours. */
  season: string | null;
}
