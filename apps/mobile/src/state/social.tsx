import { createContext, use, useState, type ReactNode } from 'react';

import {
  INITIAL_CHALLENGES,
  INITIAL_COMMENTS,
  INITIAL_FOLLOWING,
  INITIAL_FRIENDS,
  INITIAL_POSTS,
  INITIAL_REQUESTS,
  INITIAL_THEME_SUBSCRIPTIONS,
  demoThemeSubscribers,
  NOTIFICATIONS,
  type Challenge,
  type Comment,
  type Post,
  type PostTarget,
} from '@/demo/data';

export const MAX_POST_LENGTH = 280;
export const MAX_COMMENT_LENGTH = 200;

interface SocialState {
  friends: string[];
  requests: string[];
  challenges: Challenge[];
  /** Joueurs suivis : leurs publications de mur arrivent dans l'accueil. */
  following: string[];
  /** Thèmes suivis : leurs publications arrivent dans l'accueil, et on peut y publier. */
  subscribedThemes: string[];
  posts: Post[];
  comments: Comment[];
  liked: Set<string>;
  unreadNotifications: number;
  acceptRequest: (id: string) => void;
  declineRequest: (id: string) => void;
  addFriend: (id: string) => void;
  removeFriend: (id: string) => void;
  toggleFollow: (id: string) => void;
  toggleThemeSubscription: (themeId: string) => void;
  /** Publie au nom du joueur. Refuse un thème non suivi ou un texte vide. */
  publish: (target: PostTarget, text: string) => boolean;
  /** Commente une publication au nom du joueur. */
  addComment: (postId: string, text: string) => boolean;
  completeChallenge: (id: string) => void;
  toggleLike: (postId: string) => void;
  markNotificationsRead: () => void;
}

const SocialContext = createContext<SocialState | null>(null);

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** État social du prototype (en mémoire), initialisé avec les données de démonstration. */
export function SocialProvider({ children }: { children: ReactNode }) {
  const [friends, setFriends] = useState(INITIAL_FRIENDS);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [challenges, setChallenges] = useState(INITIAL_CHALLENGES);
  const [following, setFollowing] = useState(INITIAL_FOLLOWING);
  const [subscribedThemes, setSubscribedThemes] = useState(INITIAL_THEME_SUBSCRIPTIONS);
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [unreadNotifications, setUnread] = useState(NOTIFICATIONS.length);

  const value: SocialState = {
    friends,
    requests,
    challenges,
    following,
    subscribedThemes,
    posts,
    comments,
    liked,
    unreadNotifications,
    acceptRequest: (id) => {
      setRequests((r) => r.filter((x) => x !== id));
      setFriends((f) => (f.includes(id) ? f : [...f, id]));
    },
    declineRequest: (id) => setRequests((r) => r.filter((x) => x !== id)),
    addFriend: (id) => setFriends((f) => (f.includes(id) ? f : [...f, id])),
    removeFriend: (id) => setFriends((f) => f.filter((x) => x !== id)),
    toggleFollow: (id) => setFollowing((f) => toggle(f, id)),
    toggleThemeSubscription: (themeId) => setSubscribedThemes((t) => toggle(t, themeId)),
    publish: (target, text) => {
      const clean = text.trim().slice(0, MAX_POST_LENGTH);
      if (!clean) return false;
      if (target.kind === 'theme' && !subscribedThemes.includes(target.themeId)) return false;
      setPosts((p) => [
        { id: `me-${Date.now()}`, authorId: null, target, text: clean, at: Date.now(), likes: 0 },
        ...p,
      ]);
      return true;
    },
    addComment: (postId, text) => {
      const clean = text.trim().slice(0, MAX_COMMENT_LENGTH);
      if (!clean || !posts.some((p) => p.id === postId)) return false;
      setComments((c) => [...c, { id: `mc-${Date.now()}`, postId, authorId: null, text: clean, at: Date.now() }]);
      return true;
    },
    completeChallenge: (id) => setChallenges((c) => c.filter((x) => x.id !== id)),
    toggleLike: (postId) =>
      setLiked((prev) => {
        const next = new Set(prev);
        if (next.has(postId)) next.delete(postId);
        else next.add(postId);
        return next;
      }),
    markNotificationsRead: () => setUnread(0),
  };

  return <SocialContext value={value}>{children}</SocialContext>;
}

export function useSocial(): SocialState {
  const ctx = use(SocialContext);
  if (!ctx) throw new Error('useSocial doit être utilisé dans <SocialProvider>.');
  return ctx;
}

/** Publications du mur d'un joueur (`null` = soi-même). */
export function wallPosts(posts: Post[], authorId: string | null): Post[] {
  return posts.filter((p) => p.target.kind === 'profile' && p.authorId === authorId);
}

/** Publications du fil d'un thème. */
export function themePosts(posts: Post[], themeId: string): Post[] {
  return posts.filter((p) => p.target.kind === 'theme' && p.target.themeId === themeId);
}

/**
 * Fil d'accueil : mes publications, les murs des personnes suivies,
 * et les fils des thèmes auxquels je suis abonné.
 */
export function homePosts(posts: Post[], following: string[], subscribedThemes: string[]): Post[] {
  return posts.filter((p) => {
    if (p.authorId === null) return true;
    if (p.target.kind === 'profile') return following.includes(p.authorId);
    return subscribedThemes.includes(p.target.themeId);
  });
}

export function commentsOf(comments: Comment[], postId: string): Comment[] {
  return comments.filter((c) => c.postId === postId).sort((a, b) => a.at - b.at);
}

/** Nombre d'abonnés d'un thème, joueur compris s'il y est abonné. */
export function themeSubscriberCount(themeId: string, subscribedThemes: string[]): number {
  return demoThemeSubscribers(themeId) + (subscribedThemes.includes(themeId) ? 1 : 0);
}

export function formatCount(n: number): string {
  return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
}
