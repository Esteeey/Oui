import { createServer, type Server } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

import type { ClientMessage, ServerMessage } from '@qu1z/shared';

import { createApi } from './api';
import { Game, type GameOptions } from './game';
import { Challenges } from './challenges';
import { Discovery } from './discovery';
import { Messaging } from './messaging';
import { Groups } from './groups';
import { Moderation, requestNetwork } from './moderation';
import { AccountDeletion } from './account-deletion';
import { Accounts, emailSenderFromEnv, type EmailSender } from './accounts';
import { Push, type PushSender } from './push';
import { gifProviderFromEnv, type GifProvider } from './gifs';
import { Media, MemoryStore, type MediaStore } from './media';
import { Notifier } from './notifier';
import { Social } from './social';
import { ThemeCatalog } from './theme-catalog';
import { LiveInvitations } from './live-invitations';
import { WebPush } from './web-push';

const HEARTBEAT_MS = 10_000;

export interface GameServer {
  game: Game;
  social: Social;
  notifier: Notifier;
  challenges: Challenges;
  discovery: Discovery;
  messaging: Messaging;
  media: Media;
  groups: Groups;
  moderation: Moderation;
  accounts: Accounts;
  push: Push;
  liveInvitations: LiveInvitations;
  webPush: WebPush;
  http: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Serveur HTTP + WebSocket. Chaque connexion WebSocket commence par `hello` (jeton du compte).
 * Un joueur peut avoir plusieurs connexions ; il est « déconnecté » quand la dernière se ferme.
 */
export interface ServerOptions extends Omit<GameOptions, 'send'> {
  /** Stockage des médias (par défaut : en mémoire ; `index.ts` utilise le disque ou un stockage objet). */
  mediaStore?: MediaStore;
  /** Catalogue de GIF (par défaut : GIPHY_API_KEY ou TENOR_API_KEY ; sinon aucun). */
  gifs?: GifProvider | null;
  /** Envoi des e-mails (par défaut : Resend si RESEND_API_KEY, sinon la console). */
  email?: EmailSender;
  /** Messagerie, publications et groupes réservés aux comptes avec e-mail vérifié. */
  requireVerifiedEmail?: boolean;
  /** Notifications push (par défaut : aucune ; index.ts branche Expo). */
  pushSender?: PushSender | null;
}

/** Nettoyage des médias jamais rattachés. */
const ORPHAN_SWEEP_MS = 60 * 60 * 1000;

export async function startServer(port: number, options: ServerOptions): Promise<GameServer> {
  const sockets = new Map<string, Set<WebSocket>>();
  const foregroundSockets = new Map<string, Set<WebSocket>>();
  const isForeground = (id: string) => (foregroundSockets.get(id)?.size ?? 0) > 0;

  const send = (playerId: string, message: ServerMessage) => {
    const data = JSON.stringify(message);
    for (const ws of sockets.get(playerId) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };

  const mediaStore = options.mediaStore ?? new MemoryStore();
  const themeCatalog = new ThemeCatalog(options.repo.db, mediaStore);
  await themeCatalog.load();
  const game = new Game({ ...options, send });
  await game.restore();
  const notifier = new Notifier(game.repo.db, send);
  game.notifier = notifier;
  const media = new Media(game.repo.db, mediaStore, game.limiter);
  const gifs = options.gifs === undefined ? gifProviderFromEnv() : options.gifs;
  const social = new Social(game.repo.db, game.limiter, notifier, media, (id) => game.isOnline(id));
  const challenges = new Challenges(game.repo.db, game, notifier);
  const discovery = new Discovery(game.repo.db);
  const messaging = new Messaging(game.repo.db, game.limiter, (id) => game.isOnline(id), send, media, gifs);
  const groups = new Groups(game.repo.db, game.limiter, messaging, media);
  // Bannissement : toutes les connexions du joueur sont fermées immédiatement.
  const disconnect = (userId: string) => {
    for (const ws of sockets.get(userId) ?? []) {
      ws.send(JSON.stringify({ type: 'error', code: 'banned', message: 'Ce compte a été banni.' } satisfies ServerMessage));
      ws.close();
    }
  };
  const push = new Push(game.repo.db, options.pushSender ?? null, (id) => game.isOnline(id), isForeground);
  const webPush = new WebPush(game.repo.db, isForeground);
  const liveInvitations = new LiveInvitations(game.repo.db, game, send, push, webPush);
  notifier.push = push;
  messaging.push = push;
  messaging.notifier = notifier;
  const moderation = new Moderation(game.repo.db, game.limiter, social, messaging, notifier, (userId) => {
    disconnect(userId);
    // Un compte banni ne reçoit plus de push et toutes ses sessions sont fermées.
    void push.removeAll(userId);
    void game.repo.db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  });
  // Suppression de compte : connexions fermées, preuves de modération purgées au bout de 6 mois.
  const deletion = new AccountDeletion(game.repo.db, media.store, (userId) => {
    for (const ws of sockets.get(userId) ?? []) ws.close();
  });
  const accounts = new Accounts(game.repo.db, game.limiter, options.email ?? emailSenderFromEnv(), options.requireVerifiedEmail ?? false);
  const api = createApi(game, social, notifier, challenges, discovery, messaging, media, gifs, groups, moderation, accounts, push, deletion, themeCatalog, liveInvitations, webPush);
  const sweep = setInterval(() => {
    void media.cleanupOrphans().catch((err) => console.error('Nettoyage des médias', err));
    void deletion.purgeExpired().catch((err) => console.error('Purge des comptes supprimés', err));
  }, ORPHAN_SWEEP_MS);
  sweep.unref();
  const invitationSweep = setInterval(() => void liveInvitations.expire().catch((err) => console.error('Expiration des invitations', err)), 5_000);
  invitationSweep.unref();
  const http = createServer((req, res) => void api(req, res));
  const wss = new WebSocketServer({ server: http, maxPayload: 8 * 1024 });

  wss.on('connection', (ws, req) => {
    // Indice anti-contournement : empreinte du réseau (jamais l'adresse en clair).
    const network = requestNetwork(req);
    let playerId: string | null = null;
    let helloStarted = false;
    let alive = true;
    // Les messages d'un même client sont traités dans l'ordre de réception.
    let chain: Promise<void> = Promise.resolve();
    ws.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, HEARTBEAT_MS);

    const handle = async (msg: ClientMessage) => {
      if (msg.type === 'hello') {
        if (helloStarted) return;
        helloStarted = true;
        const outcome = await game.hello(typeof msg.token === 'string' ? msg.token : undefined);
        if ('error' in outcome) {
          const message = outcome.error === 'banned' ? 'Ce compte a été banni.' : 'Connecte-toi pour jouer.';
          ws.send(JSON.stringify({ type: 'error', code: outcome.error, message } satisfies ServerMessage));
          ws.close();
          return;
        }
        const id = outcome.user.id;
        playerId = id;
        await game.repo.db.query('UPDATE users SET last_network_hash = $2 WHERE id = $1', [id, network]);
        const set = sockets.get(id) ?? new Set();
        set.add(ws);
        sockets.set(id, set);
        ws.send(
          JSON.stringify({ type: 'welcome', playerId: id, token: outcome.token, profile: await game.profile(id) } satisfies ServerMessage),
        );
        if (set.size === 1) game.setOnline(id, true);
        await game.resync(id);
        const pending = await liveInvitations.list(id);
        for (const invitation of pending.invitations.filter((x) => x.status === 'pending')) ws.send(JSON.stringify({ type: 'duelInvitation', invitation } satisfies ServerMessage));
        return;
      }
      if (!playerId) return;
      if (msg.type === 'activity') {
        const set = foregroundSockets.get(playerId) ?? new Set<WebSocket>();
        if (msg.foreground) { set.add(ws); foregroundSockets.set(playerId, set); }
        else { set.delete(ws); if (!set.size) foregroundSockets.delete(playerId); }
        return;
      }
      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
      switch (msg.type) {
        case 'play':
          return game.play(playerId, str(msg.themeId), msg.mode === 'pvp' ? 'pvp' : 'bot');
        case 'cancelQueue':
          return game.cancelQueue(playerId);
        case 'answer':
          return game.answer(playerId, str(msg.duelId), num(msg.index), num(msg.choice), msg.elapsedMs === undefined ? undefined : num(msg.elapsedMs));
        case 'forfeit':
          return game.forfeit(playerId, str(msg.duelId));
        case 'duelChat':
          return game.duelChat(playerId, str(msg.duelId), str(msg.text));
        case 'duelChatHistory':
          return game.duelChatHistory(playerId, str(msg.duelId));
        case 'ackResult':
          return game.ackResult(playerId, str(msg.duelId));
        default:
          return;
      }
    };

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      chain = chain.then(() => handle(msg)).catch((err) => console.error('Message refusé', err));
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      // On attend la fin du traitement en cours (par exemple un `hello` pas encore enregistré).
      void chain.then(() => {
        if (!playerId) return;
        const set = sockets.get(playerId);
        const foreground = foregroundSockets.get(playerId);
        foreground?.delete(ws);
        if (foreground && foreground.size === 0) foregroundSockets.delete(playerId);
        set?.delete(ws);
        if (set && set.size === 0) {
          sockets.delete(playerId);
          game.setOnline(playerId, false);
        }
      });
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    game,
    social,
    notifier,
    challenges,
    discovery,
    messaging,
    media,
    groups,
    moderation,
    accounts,
    push,
    liveInvitations,
    webPush,
    http,
    port: typeof address === 'object' && address ? address.port : port,
    close: async () => {
      clearInterval(sweep);
      clearInterval(invitationSweep);
      game.dispose();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await game.flush();
    },
  };
}
