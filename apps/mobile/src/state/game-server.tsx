import { router, usePathname } from 'expo-router';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Modal, Platform, Pressable, Text, Vibration, View } from 'react-native';

import { getTheme, RULES, registerTheme, type LiveInvitation, type NotificationPrefs, type Theme, type DuelChatMessage, type DuelSnapshot, type Profile, type ServerMessage } from '@qu1z/shared';

import { api, invalidateAll } from '@/net/api';
import { registerForPush } from '@/net/push';
import { GameConnection, gameServerUrl, type ConnectionStatus } from '@/net/game-connection';
import { playSound } from '@/audio/sounds';
import { Colors, Radius, Spacing } from '@/constants/theme';

export interface DuelRequest {
  themeId: string;
  mode: 'bot' | 'pvp';
}

interface GameServerState {
  status: ConnectionStatus;
  catalogVersion: number;
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
  refreshInvitePrefs: () => Promise<void>;
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
            api<{ themes: Theme[] }>('GET', '/api/theme-catalog').then(({ themes }) => { themes.forEach(registerTheme); setCatalogVersion((v) => v + 1); }).catch(() => {});
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

  const value: GameServerState = {
    status,
    catalogVersion,
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
    refreshInvitePrefs: async () => {
      const p = await api<NotificationPrefs>('GET', '/api/me/notification-preferences');
      const next = { duelInvites: p.duelInvites, duelInviteSound: p.duelInviteSound, duelInviteVibration: p.duelInviteVibration };
      invitePrefsRef.current = next; setInvitePrefs(next);
    },
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
      <LiveInvitationModal invitations={liveInvitations} enabled={invitePrefs.duelInvites} clockOffset={clockOffset}
        onDismiss={(id) => setLiveInvitations((all) => all.filter((x) => x.id !== id))}
        onRespond={async (invitation, action) => {
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
        }} />
      <DuelNavigator duel={duel} />
    </GameServerContext>
  );
}

function LiveInvitationModal({ invitations, enabled, clockOffset, onRespond, onDismiss }: { invitations: LiveInvitation[]; enabled: boolean; clockOffset: number; onRespond: (i: LiveInvitation, action: 'accept' | 'decline' | 'cancel') => Promise<void>; onDismiss: (id: string) => void }) {
  const pending = invitations.filter((i) => i.status === 'pending' && i.expiresAt > Date.now() + clockOffset);
  const invitation = pending.filter((i) => !i.incoming).at(-1) ?? (enabled ? pending.filter((i) => i.incoming).at(-1) : undefined);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!invitation) return; const tick = () => setSeconds(Math.max(0, Math.ceil((invitation.expiresAt - (Date.now() + clockOffset)) / 1000))); tick(); const t = setInterval(tick, 500); return () => clearInterval(t); }, [invitation?.id, invitation?.expiresAt, clockOffset]);
  const theme = invitation ? getTheme(invitation.themeId) : null;
  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    if (!invitation || busy) return;
    setBusy(true); setError('');
    try { await onRespond(invitation, action); } catch { setError('Cette invitation n’est plus disponible.'); }
    finally { setBusy(false); }
  };
  return <Modal transparent visible={!!invitation} animationType="fade" onRequestClose={() => invitation && onDismiss(invitation.id)} statusBarTranslucent>
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg, backgroundColor: 'rgba(8,12,25,0.62)' }}>
      {invitation && <View style={{ width: '100%', maxWidth: 380, padding: Spacing.lg, gap: Spacing.md, borderRadius: Radius.md, backgroundColor: '#171522', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer l’invitation" onPress={() => onDismiss(invitation.id)} hitSlop={10} style={{ position: 'absolute', zIndex: 1, top: 8, right: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#c7c4d0', fontSize: 26, lineHeight: 30 }}>×</Text></Pressable>
        <View style={{ alignItems: 'center', gap: Spacing.sm }}>
          {invitation.sender.avatar ? <Image source={{ uri: invitation.sender.avatar }} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: Colors.accent }} /> : <View style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent }}><Text style={{ color: '#fff', fontSize: 28 }}>{invitation.sender.pseudo.slice(0, 1).toUpperCase()}</Text></View>}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 22, textAlign: 'center' }}>{invitation.incoming ? `${invitation.sender.pseudo} te défie !` : `Invitation envoyée à ${invitation.receiver.pseudo}`}</Text>
          <Text style={{ color: '#c7c4d0', textAlign: 'center' }}>{invitation.incoming ? `${invitation.sender.title ?? `Niveau ${invitation.sender.level}`} · ${theme?.name ?? 'Duel'}` : `En attente de réponse · ${theme?.name ?? 'Duel'}`}</Text>
          <Text style={{ color: '#f2a5c9', fontWeight: '600' }}>Expire dans {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
        </View>
        {!!error && <Text style={{ color: '#ff7284', textAlign: 'center' }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          {invitation.incoming ? <>
            <Pressable disabled={busy} onPress={() => void respond('decline')} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#625c70' }}><Text style={{ color: '#eee', fontWeight: '700' }}>REFUSER</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void respond('accept')} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.accent, opacity: busy ? 0.6 : 1 }}><Text style={{ color: '#fff', fontWeight: '800' }}>ACCEPTER</Text></Pressable>
          </> : <Pressable disabled={busy} onPress={() => void respond('cancel')} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#625c70' }}><Text style={{ color: '#eee', fontWeight: '700' }}>ANNULER L’INVITATION</Text></Pressable>}
        </View>
      </View>}
    </View>
  </Modal>;
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
