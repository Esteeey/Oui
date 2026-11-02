import { createServer, type Server } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

import type { ClientMessage, ServerMessage } from '@qu1z/shared';

import { Game, type GameOptions } from './game';

const HEARTBEAT_MS = 10_000;

export interface GameServer {
  game: Game;
  http: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Serveur WebSocket. Chaque connexion commence par `hello` (jeton du compte invité).
 * Un joueur peut avoir plusieurs connexions ; il est « déconnecté » quand la dernière se ferme.
 */
export async function startServer(port: number, options: Omit<GameOptions, 'send'> = {}): Promise<GameServer> {
  const sockets = new Map<string, Set<WebSocket>>();

  const send = (playerId: string, message: ServerMessage) => {
    const data = JSON.stringify(message);
    for (const ws of sockets.get(playerId) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };

  const game = new Game({ ...options, send });
  const http = createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'content-type': 'text/plain' });
    res.end(req.url === '/health' ? 'ok' : 'not found');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 8 * 1024 });

  wss.on('connection', (ws) => {
    let playerId: string | null = null;
    let alive = true;
    ws.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, HEARTBEAT_MS);

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

      if (msg.type === 'hello') {
        if (playerId) return;
        const { player, token } = game.hello(typeof msg.token === 'string' ? msg.token : undefined);
        playerId = player.id;
        const set = sockets.get(playerId) ?? new Set();
        set.add(ws);
        sockets.set(playerId, set);
        ws.send(JSON.stringify({ type: 'welcome', playerId, token, profile: game.profile(playerId) } satisfies ServerMessage));
        if (set.size === 1) game.setOnline(playerId, true);
        game.resync(playerId);
        return;
      }
      if (!playerId) return;
      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
      switch (msg.type) {
        case 'play':
          return game.play(playerId, str(msg.themeId), msg.mode === 'pvp' ? 'pvp' : 'bot', str(msg.opponentId) || undefined);
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
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      if (!playerId) return;
      const set = sockets.get(playerId);
      set?.delete(ws);
      if (set && set.size === 0) {
        sockets.delete(playerId);
        game.setOnline(playerId, false);
      }
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    game,
    http,
    port: typeof address === 'object' && address ? address.port : port,
    close: async () => {
      game.dispose();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
