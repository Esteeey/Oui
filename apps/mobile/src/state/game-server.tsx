import { router, usePathname } from 'expo-router';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import { RULES, type DuelChatMessage, type DuelSnapshot, type Profile, type ServerMessage } from '@qu1z/shared';

import { api, invalidateAll } from '@/net/api';
import { registerForPush } from '@/net/push';
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
  /** Compte banni : l'application ne montre plus que les sanctions et l'appel. */
  banned: boolean;
  /** Aucun compte connecté sur l'appareil : l'application ne montre que la page de connexion. */
  signedOut: boolean;
  /** Dernière demande de duel (pour « Rejouer »). */
  lastRequest: DuelRequest | null;
  /** Notifications non lues (mises à jour en temps réel). */
  unreadNotifications: number;
  /** Mini chat de fin de match, par duel. */
  duelChat: Record<string, DuelChatMessage[]>;
  sendDuelChat: (duelId: string, text: string) => void;
  loadDuelChat: (duelId: string) => void;
  play: (request: DuelRequest) => void;
  cancelQueue: () => void;
  answer: (choice: number) => void;
  forfeit: () => void;
  ackResult: (duelId: string) => void;
  retry: () => void;
  /** Après une connexion ou une déconnexion : reconnexion avec le nouveau jeton. */
  switchAccount: () => void;
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
  const [banned, setBanned] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [lastRequest, setLastRequest] = useState<DuelRequest | null>(null);
  const [unreadNotifications, setUnread] = useState(0);
  const [duelChat, setDuelChat] = useState<Record<string, DuelChatMessage[]>>({});
  const connection = useRef<GameConnection | null>(null);
  /**
   * Réponse envoyée mais pas encore confirmée par le serveur. Un état parti du serveur juste avant
   * qu'il la reçoive (ex. l'adversaire vient de répondre) ne doit pas la faire disparaître :
   * les choix se réactiveraient et la barre de temps repartirait.
   */
  const pendingAnswer = useRef<{ duelId: string; index: number; choice: number; responseMs: number } | null>(null);

  useEffect(() => {
    const handle = (m: ServerMessage) => {
      switch (m.type) {
        case 'welcome':
          // Nouvelle connexion : seul le serveur sait si la réponse envoyée avant la coupure est arrivée.
          pendingAnswer.current = null;
          setSignedOut(false);
          setPlayerId(m.playerId);
          setProfile(m.profile);
          // Rattrapage après (re)connexion : compteur et écrans à jour.
          setTimeout(() => {
            api<{ unread: number }>('GET', '/api/notifications').then((r) => setUnread(r.unread)).catch(() => {});
            invalidateAll();
            // Appareil enregistré pour les push (téléphone uniquement, une fois la permission accordée).
            void registerForPush();
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
          setDuel(withPendingAnswer(m.snapshot, pendingAnswer));
          break;
        case 'duelChat':
          setDuelChat((all) => {
            const known = all[m.duelId] ?? [];
            const key = (x: DuelChatMessage) => `${x.at}:${x.from}:${x.text}`;
            const seen = new Set(known.map(key));
            return { ...all, [m.duelId]: [...known, ...m.messages.filter((x) => !seen.has(key(x)))].slice(-30) };
          });
          break;
        case 'messages':
          // Nouveau message, réaction, lecture ou demande : les écrans de messagerie se rechargent.
          invalidateAll();
          break;
        case 'error':
          if (m.code === 'unauthenticated') {
            setSignedOut(true);
            setPlayerId(null);
            setProfile(null);
            setUnread(0);
            break;
          }
          setLastError(m.message);
          if (m.code === 'banned') {
            setBanned(true);
            connection.current?.stop();
          }
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
    banned,
    signedOut,
    lastRequest,
    unreadNotifications,
    duelChat,
    sendDuelChat: (duelId, text) => {
      send({ type: 'duelChat', duelId, text });
    },
    loadDuelChat: (duelId) => {
      send({ type: 'duelChatHistory', duelId });
    },
    play: (request) => {
      setLastError(null);
      setLastRequest(request);
      send({ type: 'play', ...request });
    },
    cancelQueue: () => send({ type: 'cancelQueue' }),
    answer: (choice) => {
      if (!duel || duel.phase !== 'answering' || duel.myChoice !== null) return;
      // Temps écoulé depuis le début du chrono (0 pendant le délai d'affichage des réponses), plafonné à 10 s.
      const responseMs = Math.min(RULES.answerTimeMs, Math.max(0, Date.now() + clockOffset - duel.phaseStartedAt));
      if (send({ type: 'answer', duelId: duel.duelId, index: duel.index, choice, elapsedMs: responseMs })) {
        // Affichage immédiat du choix, et la barre de temps se fige aussitôt ; le serveur confirme
        // (avec son propre temps de réponse) dans le prochain état.
        pendingAnswer.current = { duelId: duel.duelId, index: duel.index, choice, responseMs };
        setDuel({ ...duel, myChoice: choice, myResponseMs: responseMs });
      }
    },
    forfeit: () => duel && send({ type: 'forfeit', duelId: duel.duelId }),
    ackResult: (duelId) => send({ type: 'ackResult', duelId }),
    retry: () => connection.current?.reconnectNow(),
    switchAccount: () => {
      setDuel(null);
      setQueued(null);
      setLastError(null);
      setBanned(false);
      connection.current?.restart();
    },
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
/** Garde la réponse en attente de confirmation tant que le serveur ne l'a pas prise en compte. */
function withPendingAnswer(
  snap: DuelSnapshot,
  pending: { current: { duelId: string; index: number; choice: number; responseMs: number } | null },
): DuelSnapshot {
  const p = pending.current;
  if (!p) return snap;
  if (p.duelId !== snap.duelId || p.index !== snap.index || snap.phase !== 'answering') {
    pending.current = null; // question suivante, révélation ou autre duel
    return snap;
  }
  if (snap.myChoice !== null) {
    pending.current = null; // confirmée
    return snap;
  }
  return { ...snap, myChoice: p.choice, myResponseMs: p.responseMs };
}

export function remainingMs(duel: DuelSnapshot, clockOffset: number): number {
  // Jamais plus que la durée de la phase : pendant le délai d'affichage des réponses, le chrono reste plein.
  return Math.max(0, Math.min(duel.phaseEndsAt - duel.phaseStartedAt, duel.phaseEndsAt - (Date.now() + clockOffset)));
}
