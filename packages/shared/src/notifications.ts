import type { UserSummary } from './social';

/** Catégories de notifications (réglages par catégorie). */
export type NotificationCategory = 'challenges' | 'follows' | 'community' | 'progression' | 'ranking' | 'system' | 'friends_online';

export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string }[] = [
  { id: 'challenges', label: 'Défis' },
  { id: 'follows', label: 'Abonnements' },
  { id: 'community', label: 'Communauté' },
  { id: 'progression', label: 'Progression' },
  { id: 'ranking', label: 'Classements' },
  { id: 'system', label: 'Annonces' },
  { id: 'friends_online', label: 'Connexions des personnes suivies' },
];

export const MAX_NOTIFICATIONS = 50;

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'follow_request'
  | 'follow_accepted'
  | 'new_follower'
  | 'level_up'
  | 'theme_level_up'
  | 'title_unlocked'
  | 'challenge_received'
  | 'challenge_accepted'
  | 'challenge_declined'
  | 'rematch_request'
  | 'opponent_forfeit'
  | 'duel_finished'
  | 'rank_top100'
  | 'rank_top10'
  | 'rank_first'
  | 'rank_lost_first'
  | 'rank_left_top10'
  | 'announcement'
  | 'friend_online'
  | 'sanction'
  | 'appeal_decision'
  | 'report_closed';

export interface NotificationView {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  /** Derniers acteurs (au plus 3), du plus récent au plus ancien. */
  actors: UserSummary[];
  /** Nombre total d'acteurs regroupés (ex. 15 pour « Thomas et 14 autres »). */
  actorCount: number;
  /** Détails utiles à l'affichage et à l'ouverture (postId, themeId, niveau, duelId…). */
  data: Record<string, string | number | boolean | null>;
  read: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationPrefs {
  /** Notifications push par catégorie. Le centre de notifications, lui, garde tout. */
  push: Record<NotificationCategory, boolean>;
  /** Être prévenu quand une personne suivie se connecte (désactivé par défaut). */
  friendsOnline: boolean;
  /** Masquer le contenu des messages dans les aperçus push. */
  hideMessagePreviews: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: {
    challenges: true,
    follows: true,
    community: true,
    progression: true,
    ranking: true,
    system: true,
    friends_online: false,
  },
  friendsOnline: false,
  hideMessagePreviews: false,
};

export interface ChallengeView {
  id: string;
  from: UserSummary;
  to: UserSummary;
  themeId: string;
  kind: 'challenge' | 'rematch';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  incoming: boolean;
  createdAt: number;
  duelId: string | null;
}
