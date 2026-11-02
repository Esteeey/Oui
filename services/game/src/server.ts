import { createServer, type Server } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

import type { ClientMessage, ServerMessage } from '@qu1z/shared';

import { createApi } from './api';
import { Game, type GameOptions } from './game';
import { Challenges } from './challenges';
import { Discovery } from './discovery';
import { Notifier } from './notifier';
import { Social } from './social';

const HEARTBEAT_MS = 10_000;

export interface GameServer {
  game: Game;
  social: Social;
  notifier: Notifier;
  challenges: Challenges;
  discovery: Discovery;
  http: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Serveur HTTP + WebSocket. Chaque connexion WebSocket commence par `hello` (jeton du compte).
 * Un joueur peut avoir plusieurs connexions ; il est « déconnecté » quand la dernière se ferme.
 */
export async function startServer(port: number, options: Omit<GameOptions, 'send'>): Promise<GameServer> {
  const sockets = new Map<string, Set<WebSocket>>();

  const send = (playerId: string, message: ServerMessage) => {
    const data = JSON.stringify(message);
    for (const ws of sockets.get(playerId) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };

  const game = new Game({ ...options, send });
  await game.restore();
  const notifier = new Notifier(game.repo.db, send);
  game.notifier = notifier;
  const social = new Social(game.repo.db, game.limiter, notifier);
  const challenges = new Challenges(game.repo.db, game, notifier);
  const discovery = new Discovery(game.repo.db);
  const api = createApi(game, social, notifier, challenges, discovery);
  const http = createServer((req, res) => void api(req, res));
  const wss = new WebSocketServer({ server: http, maxPayload: 8 * 1024 });

  wss.on('connection', (ws) => {
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
          ws.send(JSON.stringify({ type: 'error', code: outcome.error, message: 'Ce compte a été banni.' } satisfies ServerMessage));
          ws.close();
          return;
        }
        const id = outcome.user.id;
        playerId = id;
        const set = sockets.get(id) ?? new Set();
        set.add(ws);
        sockets.set(id, set);
        ws.send(
          JSON.stringify({ type: 'welcome', playerId: id, token: outcome.token, profile: await game.profile(id) } satisfies ServerMessage),
        );
        if (set.size === 1) game.setOnline(id, true);
        await game.resync(id);
        return;
      }
      if (!playerId) return;
      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
      switch (msg.type) {
        case 'play':
          return game.play(playerId, str(msg.themeId), msg.mode === 'pvp' ? 'pvp' : 'bot');
        case 'cancelQueue':
          return game.cancelQueue(playerId);
        case 'answer':
          return game.answer(playerId, str(msg.duelId), num(msg.index), num(msg.choice));
        case 'forfeit':
          return game.forfeit(playerId, str(msg.duelId));
        case 'ackResult':
          return game.ackResult(playerId, str(msg.duelId));
        case 'chat':
          return game.chat(playerId, str(msg.duelId), str(msg.text));
        case 'getChat':
          return game.getChat(playerId, str(msg.duelId));
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
    http,
    port: typeof address === 'object' && address ? address.port : port,
    close: async () => {
      game.dispose();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await game.flush();
    },
  };
}
