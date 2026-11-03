import type { Attachment } from './media';
import type { UserSummary } from './social';

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_FIRST_MESSAGE_LENGTH = 1000;
/** Réactions proposées (le serveur accepte tout emoji court). */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

/** Présence : visible seulement en cas d'abonnement réciproque, et jamais en cas de blocage. */
export interface Presence {
  online: boolean;
  lastSeenAt: number | null;
}

export type GroupRole = 'creator' | 'admin' | 'member';
export const MAX_GROUP_MEMBERS = 100;
export const MAX_GROUP_NAME_LENGTH = 50;
export const MAX_PINNED_MESSAGES = 50;

/** Ce que voit un membre d'un groupe dans sa boîte et en tête de conversation. */
export interface GroupInfo {
  name: string;
  avatar: string | null;
  memberCount: number;
  myRole: GroupRole;
}

export interface ConversationSummary {
  id: string;
  kind: 'direct' | 'group';
  /** L'autre participant d'une conversation privée. */
  other: UserSummary | null;
  /** Nom, photo, taille et mon rôle, pour un groupe. */
  group: GroupInfo | null;
  lastMessage: { text: string | null; kind: string; senderId: string | null; createdAt: number } | null;
  /** Messages non lus dans CETTE conversation (pas de compteur global). */
  unread: number;
  pinned: boolean;
  presence: Presence | null;
}

export interface MessageView {
  id: string;
  seq: number;
  senderId: string | null;
  /** Auteur (affiché dans les groupes) ; nul pour un message système. */
  sender: { id: string; pseudo: string; avatar: string | null } | null;
  kind: 'text' | 'image' | 'gif' | 'sticker' | 'system';
  text: string | null;
  /** Photo, GIF ou sticker (messages `image`, `gif`, `sticker`). */
  attachment: Attachment | null;
  createdAt: number;
  replyTo: { id: string; senderId: string | null; senderPseudo: string | null; kind: string; text: string | null } | null;
  reactions: { emoji: string; userIds: string[] }[];
  /** Pour mes messages seulement : « envoyé » ou « lu » (pas de « distribué »). */
  status: 'sent' | 'read' | null;
}

export interface PinnedMessageView {
  messageId: string;
  senderId: string | null;
  senderPseudo: string | null;
  kind: string;
  text: string | null;
  pinnedAt: number;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: MessageView[];
  /** Messages épinglés (groupes), du plus récent au plus ancien. */
  pinned: PinnedMessageView[];
  /** Le joueur peut écrire (pas de blocage, conversation ouverte). */
  canSend: boolean;
}

export interface MessageRequestView {
  id: string;
  from: UserSummary;
  to: UserSummary;
  firstMessage: string | null;
  createdAt: number;
  incoming: boolean;
}

export interface GroupMemberView {
  user: UserSummary;
  role: GroupRole;
  joinedAt: number;
  /** J'ai bloqué ce membre (ses messages me sont masqués). */
  blockedByMe: boolean;
}

/** Fiche d'un groupe. Invitations en attente et exclusions : visibles par le créateur et les administrateurs. */
export interface GroupDetail {
  id: string;
  name: string;
  avatar: string | null;
  myRole: GroupRole;
  members: GroupMemberView[];
  invitations: { id: string; invitee: UserSummary; inviter: UserSummary; createdAt: number }[];
  exclusions: { user: UserSummary; until: number | null }[];
}

export interface GroupInvitationView {
  id: string;
  group: { id: string; name: string; avatar: string | null; memberCount: number };
  inviter: UserSummary;
  createdAt: number;
}

/** Droits d'un rôle (le serveur vérifie toujours ; l'interface s'en sert pour afficher les actions). */
export const groupRights = (role: GroupRole) => ({
  invite: role !== 'member',
  pin: role !== 'member',
  edit: role !== 'member',
  /** Retirer ou exclure : un administrateur ne touche qu'aux membres simples. */
  canRemove: (target: GroupRole) => role === 'creator' ? target !== 'creator' : role === 'admin' && target === 'member',
  manageAdmins: role === 'creator',
  transfer: role === 'creator',
  delete: role === 'creator',
});
