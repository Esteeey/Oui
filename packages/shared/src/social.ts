import type { MediaView, StickerId } from './media';

/** Données sociales échangées entre le serveur et l'application (API HTTP). */

/** Pseudo : 3 à 20 caractères, lettres (accents compris), chiffres, `_`, `.`, `-`, sans espace. */
export const PSEUDO_PATTERN = /^[\p{L}\p{N}_.-]{3,20}$/u;
export const MAX_POST_LENGTH = 280;
export const MAX_COMMENT_LENGTH = 200;
export const MAX_BIO_LENGTH = 160;
export const MAX_MENTIONS = 10;

/** Repère les mentions `@pseudo` d'un texte (sans doublon, au plus MAX_MENTIONS). */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/(^|[^\p{L}\p{N}_.-])@([\p{L}\p{N}_.-]{3,20})/gu)) {
    found.add(m[2].toLowerCase());
    if (found.size >= MAX_MENTIONS) break;
  }
  return [...found];
}

export interface UserSummary {
  id: string;
  pseudo: string;
  title: string | null;
  /** Niveau global (affiché dans certaines listes seulement). */
  level: number;
  /** Photo de profil (chemin `/media/…` ou URL absolue), sinon initiale sur fond coloré. */
  avatar: string | null;
}

export type LiveInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'unavailable';
export interface LiveInvitation {
  id: string;
  sender: UserSummary;
  receiver: UserSummary;
  themeId: string;
  status: LiveInvitationStatus;
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
  matchId: string | null;
  incoming: boolean;
}

/** Joueur d'une section de la page Personnes, avec la raison pour laquelle il est proposé. */
export interface PeopleEntry {
  user: UserSummary;
  /** Nombre de thèmes joués ou suivis en commun (jamais lesquels). */
  commonThemes?: number;
  /** Duels terminés ces 7 derniers jours (comptes publics seulement). */
  duelsThisWeek?: number;
  /** Nombre d'abonnés, ou null si le joueur masque ses abonnés. */
  followers?: number | null;
}

/**
 * Page Personnes : chaque joueur n'apparaît que dans une section, jamais soi-même,
 * un joueur bloqué (dans un sens ou l'autre), banni, déjà suivi ou déjà sollicité.
 */
export interface PeopleSections {
  suggestions: UserSummary[];
  commonThemes: PeopleEntry[];
  active: PeopleEntry[];
  popular: PeopleEntry[];
}

export interface Relationship {
  isMe: boolean;
  /** Je suis abonné à ce joueur. */
  following: boolean;
  /** J'ai une demande d'abonnement en attente vers ce joueur. */
  requested: boolean;
  /** Ce joueur est abonné à moi. */
  followsMe: boolean;
  /** Je l'ai bloqué. */
  blockedByMe: boolean;
}

export interface PublicProfile extends UserSummary {
  bio: string;
  isPrivate: boolean;
  showFollowers: boolean;
  showFollowing: boolean;
  followers: number;
  following: number;
  xp: number;
  relationship: Relationship;
  /** Le visiteur peut voir le contenu (public, lui-même, ou abonné accepté). */
  canSeeContent: boolean;
  canSeeFollowers: boolean;
  canSeeFollowing: boolean;
  /** Photo de couverture (bandeau 3:1 au-dessus de la photo de profil), sinon dégradé. */
  cover: string | null;
  /** Pays choisi manuellement et affiché sur le profil. */
  country?: string | null;
  /** Ville choisie manuellement et affichée sur le profil. */
  city?: string | null;
  /** Région utilisée pour le classement, renvoyée seulement au joueur lui-même. */
  region?: string | null;
  /** Position approximative enregistrée (classement « À proximité »), seulement pour le joueur lui-même. */
  hasLocation?: boolean;
  /** En ligne et dernière activité : pour soi-même, ou si chacun suit l'autre (jamais en cas de blocage). */
  presence?: { online: boolean; lastSeenAt: number | null } | null;
  /** Meilleur thème (le plus d'XP) et rang mondial dans ce thème, si le contenu est visible. */
  best?: { themeId: string; rank: number; players: number } | null;
}

export type PostTarget = { kind: 'profile' } | { kind: 'theme'; themeId: string };

export interface PostView {
  id: string;
  author: UserSummary;
  target: PostTarget;
  text: string;
  /** Photo jointe (facultative ; le texte peut alors être vide). */
  media: MediaView | null;
  /** Sticker du pack Qu1z (à la place d'une photo). */
  sticker: StickerId | null;
  createdAt: number;
  likes: number;
  likedByMe: boolean;
  comments: number;
  mentions: { id: string; pseudo: string }[];
}

export interface CommentView {
  id: string;
  postId: string;
  parentId: string | null;
  author: UserSummary;
  text: string;
  createdAt: number;
  mentions: { id: string; pseudo: string }[];
  likes: number;
  likedByMe: boolean;
  media: MediaView | null;
}

export interface ActivityView {
  id: string;
  user: UserSummary;
  themeId: string;
  createdAt: number;
  event:
    | { kind: 'win'; opponent: string; score: number; opponentScore: number }
    | { kind: 'perfect' }
    | { kind: 'level'; level: number };
}

export type FeedItem = { kind: 'post'; at: number; post: PostView } | { kind: 'activity'; at: number; activity: ActivityView };

/** Amis (joueurs suivis et soi-même), joueurs du même pays, ou tout le monde. */
export type LeaderboardScope = 'following' | 'country' | 'region' | 'nearby' | 'world';
/** XP gagnée cette semaine, XP gagnée pendant la saison (le mois), ou cote (permanente). */
export type LeaderboardPeriod = 'week' | 'season' | 'rating';

/** Rayon du classement « À proximité », en km. À AJUSTER. */
export const NEARBY_KM = 50;
/** Précision gardée pour la position (en degrés, environ 11 km) : jamais la position exacte. */
export const LOCATION_PRECISION_DEG = 0.1;

/** Semaine du classement : du lundi 00:00 UTC au lundi suivant (remise à zéro). À AJUSTER. */
export function weekOf(at: number): { startsAt: number; endsAt: number } {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  const startsAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  return { startsAt, endsAt: startsAt + 7 * 86_400_000 };
}

/** Régions de France (classement « Région »). */
export const REGIONS_FR = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Hauts-de-France',
  'Île-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  "Provence-Alpes-Côte d'Azur",
  'Guadeloupe',
  'Martinique',
  'Guyane',
  'La Réunion',
  'Mayotte',
] as const;

export interface LeaderboardRow {
  rank: number;
  user: UserSummary;
  /** Cote, ou XP de la saison pour le classement de saison. */
  rating: number;
  isMe: boolean;
}

export interface ThemeInfo {
  themeId: string;
  subscribers: number;
  subscribed: boolean;
}
