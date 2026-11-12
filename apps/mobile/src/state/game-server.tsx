import { router, usePathname } from 'expo-router';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Vibration } from 'react-native';

import { RULES, registerTheme, type LiveInvitation, type NotificationPrefs, type Theme, type DuelChatGif, type DuelChatMessage, type StickerId, type DuelSnapshot, type Profile, type ServerMessage } from '@qu1z/shared';

import { api, invalidateAll } from '@/net/api';
import { registerForPush } from '@/net/push';
import { GameConnection, gameServerUrl, type ConnectionStatus } from '@/net/game-connection';
import { playSound } from '@/audio/sounds';

export interface DuelRequest {
  themeId: string;
  mode: 'bot' | 'pvp';
}

interface GameServerState {
  status: ConnectionStatus;
  catalogVersion: number;
  refreshThemeCatalog: () => Promise<void>;
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
  liveInvitations: LiveInvitation[];
  /** Le joueur accepte de recevoir des invitations en direct. */
  invitesEnabled: boolean;
  respondInvitation: (invitation: LiveInvitation, action: 'accept' | 'decline' | 'cancel') => Promise<void>;
  dismissInvitation: (id: string) => void;
  refreshInvitePrefs: () => Promise<void>;
  /** Mini chat de fin de match, par duel. */
  duelChat: Record<string, DuelChatMessage[]>;
  sendDuelChat: (duelId: string, text: string, extra?: { stickerId?: StickerId; gif?: DuelChatGif }) => void;
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
  const [catalogVersion, setCatalogVersion] = useState(0);
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
  const [liveInvitations, setLiveInvitations] = useState<LiveInvitation[]>([]);
  const [invitePrefs, setInvitePrefs] = useState<Pick<NotificationPrefs, 'duelInvites' | 'duelInviteSound' | 'duelInviteVibration'>>({ duelInvites: true, duelInviteSound: true, duelInviteVibration: true });
  const invitePrefsRef = useRef(invitePrefs);
  const soundedInvitations = useRef(new Set<string>());
  const [duelChat, setDuelChat] = useState<Record<string, DuelChatMessage[]>>({});
  const connection = useRef<GameConnection | null>(null);
  /**
   * Réponse envoyée mais pas encore confirmée par le serveur. Un état parti du serveur juste avant
   * qu'il la reçoive (ex. l'adversaire vient de répondre) ne doit pas la faire disparaître :
   * les choix se réactiveraient et la barre de temps repartirait.
   */
  const pendingAnswer = useRef<{ duelId: string; index: number; choice: number; responseMs: number } | null>(null);

  const refreshThemeCatalog = async () => {
    const { themes } = await api<{ themes: Theme[] }>('GET', '/api/theme-catalog');
    themes.forEach(registerTheme);
    setCatalogVersion((version) => version + 1);
  };

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
            api<{ invitations: LiveInvitation[] }>('GET', '/api/live-invitations').then((r) => setLiveInvitations(r.invitations.filter((x) => x.status === 'pending'))).catch(() => {});
            api<NotificationPrefs>('GET', '/api/me/notification-preferences').then((p) => {
              const next = { duelInvites: p.duelInvites, duelInviteSound: p.duelInviteSound, duelInviteVibration: p.duelInviteVibration };
              invitePrefsRef.current = next; setInvitePrefs(next);
            }).catch(() => {});
            refreshThemeCatalog().catch(() => {});
            invalidateAll();
            // Appareil enregistré pour les push (téléphone uniquement, une fois la permission accordée).
            void registerForPush();
          }, 0);
          break;
        case 'duelInvitation':
          setLiveInvitations((all) => {
            if (m.invitation.status !== 'pending') return all.filter((x) => x.id !== m.invitation.id);
            if (m.invitation.incoming && !soundedInvitations.current.has(m.invitation.id)) {
              soundedInvitations.current.add(m.invitation.id);
              void api<NotificationPrefs>('GET', '/api/me/notification-preferences').then((p) => {
                const next = { duelInvites: p.duelInvites, duelInviteSound: p.duelInviteSound, duelInviteVibration: p.duelInviteVibration };
                invitePrefsRef.current = next; setInvitePrefs(next);
                if (next.duelInvites && next.duelInviteSound) playSound('pinPop');
                if (next.duelInvites && next.duelInviteVibration) {
                  if (Platform.OS === 'web') { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(120); }
                  else Vibration.vibrate(120);
                }
              }).catch(() => {});
            }
            return [m.invitation, ...all.filter((x) => x.id !== m.invitation.id)].slice(0, 20);
          });
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
          // Une invitation acceptée ouvre le même duel sur les deux appareils. Fermer
          // immédiatement tout panneau d'invitation, même si son événement de statut
          // terminal arrive après le premier snapshot du duel.
          setLiveInvitations([]);
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

  const dismissInvitation = (id: string) => setLiveInvitations((all) => all.filter((x) => x.id !== id));
  const respondInvitation = async (invitation: LiveInvitation, action: 'accept' | 'decline' | 'cancel') => {
    try {
      await api('POST', `/api/live-invitations/${invitation.id}/${action}`);
      setLiveInvitations((all) => all.filter((x) => x.id !== invitation.id));
    } catch (error) {
      // Le serveur peut avoir traité la réponse même si la requête a perdu sa
      // réponse HTTP. Recharger l'état évite de laisser un panneau obsolète.
      const latest = await api<{ invitations: LiveInvitation[] }>('GET', '/api/live-invitations').catch(() => null);
      if (latest) {
        setLiveInvitations((all) => {
          const current = all.filter((x) => x.id !== invitation.id);
          return [...latest.invitations.filter((x) => x.status === 'pending' && !current.some((y) => y.id === x.id)), ...current];
        });
        if (!latest.invitations.some((x) => x.id === invitation.id && x.status === 'pending')) return;
      }
      throw error;
    }
  };

  const value: GameServerState = {
    status,
    catalogVersion,
    refreshThemeCatalog,
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
    liveInvitations,
    invitesEnabled: invitePrefs.duelInvites,
    respondInvitation,
    dismissInvitation,
    refreshInvitePrefs: async () => {
      const p = await api<NotificationPrefs>('GET', '/api/me/notification-preferences');
      const next = { duelInvites: p.duelInvites, duelInviteSound: p.duelInviteSound, duelInviteVibration: p.duelInviteVibration };
      invitePrefsRef.current = next; setInvitePrefs(next);
    },
    sendDuelChat: (duelId, text, extra) => {
      send({ type: 'duelChat', duelId, text, ...extra });
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

/** Invitation à afficher : celle qu'on a envoyée d'abord, sinon la dernière reçue. */
export function currentInvitation(invitations: LiveInvitation[], enabled: boolean, clockOffset: number): LiveInvitation | undefined {
  const pending = invitations.filter((i) => i.status === 'pending' && i.expiresAt > Date.now() + clockOffset);
  return pending.filter((i) => !i.incoming).at(-1) ?? (enabled ? pending.filter((i) => i.incoming).at(-1) : undefined);
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
