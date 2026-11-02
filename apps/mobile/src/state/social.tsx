import { createContext, use, useState, type ReactNode } from 'react';

import { INITIAL_CHALLENGES, INITIAL_FRIENDS, INITIAL_REQUESTS, NOTIFICATIONS, type Challenge } from '@/demo/data';

interface SocialState {
  friends: string[];
  requests: string[];
  challenges: Challenge[];
  liked: Set<string>;
  unreadNotifications: number;
  acceptRequest: (id: string) => void;
  declineRequest: (id: string) => void;
  addFriend: (id: string) => void;
  removeFriend: (id: string) => void;
  completeChallenge: (id: string) => void;
  toggleLike: (postId: string) => void;
  markNotificationsRead: () => void;
}

const SocialContext = createContext<SocialState | null>(null);

/** État social du prototype (en mémoire), initialisé avec les données de démonstration. */
export function SocialProvider({ children }: { children: ReactNode }) {
  const [friends, setFriends] = useState(INITIAL_FRIENDS);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [challenges, setChallenges] = useState(INITIAL_CHALLENGES);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [unreadNotifications, setUnread] = useState(NOTIFICATIONS.length);

  const value: SocialState = {
    friends,
    requests,
    challenges,
    liked,
    unreadNotifications,
    acceptRequest: (id) => {
      setRequests((r) => r.filter((x) => x !== id));
      setFriends((f) => (f.includes(id) ? f : [...f, id]));
    },
    declineRequest: (id) => setRequests((r) => r.filter((x) => x !== id)),
    addFriend: (id) => setFriends((f) => (f.includes(id) ? f : [...f, id])),
    removeFriend: (id) => setFriends((f) => f.filter((x) => x !== id)),
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
