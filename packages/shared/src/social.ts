import type { MediaView } from './media';

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
}

export type PostTarget = { kind: 'profile' } | { kind: 'theme'; themeId: string };

export interface PostView {
  id: string;
  author: UserSummary;
  target: PostTarget;
  text: string;
  /** Photo jointe (facultative ; le texte peut alors être vide). */
  media: MediaView | null;
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

export interface LeaderboardRow {
  rank: number;
  user: UserSummary;
  rating: number;
  isMe: boolean;
}

export interface ThemeInfo {
  themeId: string;
  subscribers: number;
  subscribed: boolean;
}
