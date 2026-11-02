import { router, usePathname } from 'expo-router';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import type { ChatMessage, DuelSnapshot, Profile, ServerMessage } from '@qu1z/shared';

import { api, invalidateAll } from '@/net/api';
import { GameConnection, gameServerUrl, type ConnectionStatus } from '@/net/game-connection';

export interface DuelRequest {
  themeId: string;
  mode: 'bot' | 'pvp';
}

interface GameServerState {
  status: ConnectionStatus;
  playerId: string | null;
  profile: Profile | null;
  /** Dernier état reçu du duel (en cours ou terminé). */
  duel: DuelSnapshot | null;
  /** Décalage horloge serveur − horloge locale (ms). */
  clockOffset: number;
  queued: { themeId: string; since: number } | null;
  lastError: string | null;
  chats: Record<string, { messages: ChatMessage[]; canChat: boolean }>;
  /** Dernière demande de duel (pour « Rejouer »). */
  lastRequest: DuelRequest | null;
  /** Notifications non lues (mises à jour en temps réel). */
  unreadNotifications: number;
  play: (request: DuelRequest) => void;
  cancelQueue: () => void;
  answer: (choice: number) => void;
  forfeit: () => void;
  ackResult: (duelId: string) => void;
  sendChat: (duelId: string, text: string) => void;
  loadChat: (duelId: string) => void;
  retry: () => void;
}

const GameServerContext = createContext<GameServerState | null>(null);

/** Connexion au serveur de jeu, source de vérité du duel, des scores, du chrono et de l'XP. */
export function GameServerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [duel, setDuel] = useState<DuelSnapshot | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [queued, setQueued] = useState<GameServerState['queued']>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [chats, setChats] = useState<GameServerState['chats']>({});
  const [lastRequest, setLastRequest] = useState<DuelRequest | null>(null);
  const [unreadNotifications, setUnread] = useState(0);
  const connection = useRef<GameConnection | null>(null);

  useEffect(() => {
    const handle = (m: ServerMessage) => {
      switch (m.type) {
        case 'welcome':
          setPlayerId(m.playerId);
          setProfile(m.profile);
          // Rattrapage après (re)connexion : compteur et écrans à jour.
          setTimeout(() => {
            api<{ unread: number }>('GET', '/api/notifications').then((r) => setUnread(r.unread)).catch(() => {});
            invalidateAll();
          }, 0);
          break;
        case 'notification':
          if (typeof m.unread === 'number') setUnread(m.unread);
          else api<{ unread: number }>('GET', '/api/notifications').then((r) => setUnread(r.unread)).catch(() => {});
          invalidateAll();
          break;
        case 'profile':
          setProfile(m.profile);
          break;
        case 'queued':
          setQueued({ themeId: m.themeId, since: m.since });
          break;
        case 'queueCancelled':
          setQueued(null);
          break;
        case 'duel':
          setQueued(null);
          setClockOffset(m.snapshot.serverNow - Date.now());
          setDuel(m.snapshot);
          break;
        case 'chat':
          setChats((c) => ({ ...c, [m.duelId]: { messages: m.messages, canChat: m.canChat } }));
          break;
        case 'error':
          setLastError(m.message);
          break;
      }
    };
    const conn = new GameConnection(gameServerUrl(), handle, setStatus);
    connection.current = conn;
    conn.start();
    return () => conn.stop();
  }, []);

  const send = (message: Parameters<GameConnection['send']>[0]) => connection.current?.send(message) ?? false;

  const value: GameServerState = {
    status,
    playerId,
    profile,
    duel,
    clockOffset,
    queued,
    lastError,
    chats,
    lastRequest,
    unreadNotifications,
    play: (request) => {
      setLastError(null);
      setLastRequest(request);
      send({ type: 'play', ...request });
    },
    cancelQueue: () => send({ type: 'cancelQueue' }),
    answer: (choice) => {
      if (!duel || duel.phase !== 'answering' || duel.myChoice !== null) return;
      if (send({ type: 'answer', duelId: duel.duelId, index: duel.index, choice })) {
        // Affichage immédiat du choix ; le serveur confirme (ou corrige) dans le prochain état.
        setDuel({ ...duel, myChoice: choice });
      }
    },
    forfeit: () => duel && send({ type: 'forfeit', duelId: duel.duelId }),
    ackResult: (duelId) => send({ type: 'ackResult', duelId }),
    sendChat: (duelId, text) => send({ type: 'chat', duelId, text }),
    loadChat: (duelId) => send({ type: 'getChat', duelId }),
    retry: () => connection.current?.reconnectNow(),
  };

  return (
    <GameServerContext value={value}>
      {children}
      <DuelNavigator duel={duel} />
    </GameServerContext>
  );
}

/**
 * Après une reconnexion (ou une réouverture de l'application), ramène le joueur
 * sur son duel en cours, ou sur ses résultats s'il s'est terminé entre-temps.
 */
function DuelNavigator({ duel }: { duel: DuelSnapshot | null }) {
  const pathname = usePathname();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!duel) return;
    const key = `${duel.duelId}:${duel.phase === 'finished' ? 'done' : 'live'}`;
    if (handled.current === key) return;
    if (duel.phase !== 'finished') {
      handled.current = key;
      if (!pathname.startsWith('/duel')) {
        router.push({ pathname: '/duel/[themeId]', params: { themeId: duel.themeId, resume: '1' } });
      }
    } else if (duel.result) {
      handled.current = key;
      // Pendant un duel, c'est l'écran de duel qui enchaîne lui-même sur les résultats.
      if (pathname !== '/results' && !pathname.startsWith('/duel')) router.push('/results');
    }
  }, [duel, pathname]);
  return null;
}

export function useGameServer(): GameServerState {
  const ctx = use(GameServerContext);
  if (!ctx) throw new Error('useGameServer doit être utilisé dans <GameServerProvider>.');
  return ctx;
}

/** Temps restant de la phase en cours, d'après l'horloge du serveur (jamais celle du téléphone seule). */
export function remainingMs(duel: DuelSnapshot, clockOffset: number): number {
  return Math.max(0, duel.phaseEndsAt - (Date.now() + clockOffset));
}
