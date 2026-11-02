import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Game } from './game';

const MAX_BODY = 16 * 1024;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * API HTTP (lectures, actions hors temps réel). Authentification : `Authorization: Bearer <jeton>`.
 * Chaque route vérifie elle-même les droits ; rien ne repose sur l'interface.
 */
export function createApi(game: Game) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });

    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = token ? await game.authenticate(token) : null;
    if (!user) return json(res, 401, { error: 'unauthorized' });
    if (!game.limiter.allow('http', user.id)) return json(res, 429, { error: 'rate_limited' });

    try {
      // GET /api/me : mon profil de jeu et mon rôle.
      if (req.method === 'GET' && url.pathname === '/api/me') {
        return json(res, 200, { profile: await game.profile(user.id), role: user.role, status: user.status });
      }
      // GET /api/blocks : joueurs que j'ai bloqués.
      if (req.method === 'GET' && url.pathname === '/api/blocks') {
        return json(res, 200, { blocked: await game.repo.blockedBy(user.id) });
      }
      // POST /api/blocks { userId } / DELETE /api/blocks/:userId
      if (req.method === 'POST' && url.pathname === '/api/blocks') {
        const body = (await readBody(req)) as { userId?: unknown };
        const target = typeof body.userId === 'string' ? body.userId : '';
        if (!UUID.test(target) || target === user.id) return json(res, 400, { error: 'invalid_user' });
        if (!(await game.repo.user(target))) return json(res, 404, { error: 'unknown_user' });
        if (!game.limiter.allow('block', user.id)) return json(res, 429, { error: 'rate_limited' });
        await game.repo.block(user.id, target);
        return json(res, 200, { ok: true });
      }
      const unblock = url.pathname.match(/^\/api\/blocks\/([^/]+)$/);
      if (req.method === 'DELETE' && unblock) {
        if (!UUID.test(unblock[1])) return json(res, 400, { error: 'invalid_user' });
        await game.repo.unblock(user.id, unblock[1]);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'not_found' });
    } catch (err) {
      if (err instanceof SyntaxError || (err as Error).message === 'too_large') return json(res, 400, { error: 'bad_request' });
      console.error(err);
      return json(res, 500, { error: 'server_error' });
    }
  };
}
