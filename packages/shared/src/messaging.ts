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

export interface ConversationSummary {
  id: string;
  kind: 'direct' | 'group';
  /** L'autre participant d'une conversation privée. */
  other: UserSummary | null;
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
  kind: 'text' | 'image' | 'gif' | 'sticker' | 'system';
  text: string | null;
  createdAt: number;
  replyTo: { id: string; senderId: string | null; senderPseudo: string | null; text: string | null } | null;
  reactions: { emoji: string; userIds: string[] }[];
  /** Pour mes messages seulement : « envoyé » ou « lu » (pas de « distribué »). */
  status: 'sent' | 'read' | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: MessageView[];
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
