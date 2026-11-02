import type { IncomingMessage, ServerResponse } from 'node:http';

import { THEMES } from '@qu1z/shared';

import type { Game } from './game';
import { SocialError, type Social } from './social';

const MAX_BODY = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new SocialError(413, 'too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SocialError(400, 'bad_request');
  return parsed;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new SocialError(400, 'invalid_id');
  return value;
}

type Handler = (ctx: { userId: string; params: string[]; query: URLSearchParams; body: () => Promise<Record<string, unknown>> }) => Promise<unknown>;

/**
 * API HTTP. Authentification : `Authorization: Bearer <jeton>`.
 * Chaque route vérifie elle-même les droits (blocages, confidentialité) : rien ne repose sur l'interface.
 */
export function createApi(game: Game, social: Social) {
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/me$/, async ({ userId }) => {
      const user = (await game.repo.user(userId))!;
      return { profile: await game.profile(userId), role: user.role, status: user.status, titles: social.titles(user.xp) };
    }],

    // Profils
    ['GET', /^\/api\/users\/([^/]+)$/, async ({ userId, params }) => social.profile(userId, uuid(params[0]))],
    ['PATCH', /^\/api\/me\/profile$/, async ({ userId, body }) => social.updateProfile(userId, await body())],
    ['GET', /^\/api\/users\/([^/]+)\/stats$/, async ({ userId, params }) => {
      const target = uuid(params[0]);
      const profile = await social.profile(userId, target);
      if (!profile.canSeeContent) throw new SocialError(403, 'private');
      const p = await game.profile(target);
      return { stats: p.stats, history: p.history.slice(0, 10) };
    }],

    // Abonnements
    ['POST', /^\/api\/users\/([^/]+)\/follow$/, async ({ userId, params }) => social.follow(userId, uuid(params[0]))],
    ['DELETE', /^\/api\/users\/([^/]+)\/follow$/, async ({ userId, params }) => social.unfollow(userId, uuid(params[0]))],
    ['DELETE', /^\/api\/me\/followers\/([^/]+)$/, async ({ userId, params }) => social.removeFollower(userId, uuid(params[0]))],
    ['GET', /^\/api\/me\/follow-requests$/, async ({ userId }) => ({ requests: await social.followRequests(userId) })],
    ['POST', /^\/api\/me\/follow-requests\/([^/]+)\/accept$/, async ({ userId, params }) => social.acceptRequest(userId, uuid(params[0]))],
    ['POST', /^\/api\/me\/follow-requests\/([^/]+)\/decline$/, async ({ userId, params }) => social.declineRequest(userId, uuid(params[0]))],
    ['GET', /^\/api\/users\/([^/]+)\/(followers|following)$/, async ({ userId, params, query }) => ({
      users: await social.followList(userId, uuid(params[0]), params[1] as 'followers' | 'following', query.get('q') ?? undefined),
    })],

    // Blocages
    ['GET', /^\/api\/blocks$/, async ({ userId }) => ({ blocked: await game.repo.blockedBy(userId) })],
    ['POST', /^\/api\/blocks$/, async ({ userId, body }) => {
      const target = uuid((await body()).userId);
      if (target === userId) throw new SocialError(400, 'self');
      if (!(await game.repo.user(target))) throw new SocialError(404, 'unknown_user');
      if (!game.limiter.allow('block', userId)) throw new SocialError(429, 'rate_limited');
      await social.block(userId, target);
      return { ok: true };
    }],
    ['DELETE', /^\/api\/blocks\/([^/]+)$/, async ({ userId, params }) => {
      await game.repo.unblock(userId, uuid(params[0]));
      return { ok: true };
    }],

    // Thèmes
    ['GET', /^\/api\/themes$/, async ({ userId }) => ({ themes: await social.themeInfo(userId, THEMES.map((t) => t.id)) })],
    ['PUT', /^\/api\/themes\/([^/]+)\/subscription$/, async ({ userId, params }) => social.setThemeSubscription(userId, params[0], true)],
    ['DELETE', /^\/api\/themes\/([^/]+)\/subscription$/, async ({ userId, params }) => social.setThemeSubscription(userId, params[0], false)],

    // Publications et fils
    ['GET', /^\/api\/feed$/, async ({ userId, query }) => ({ items: await social.homeFeed(userId, Number(query.get('before')) || undefined) })],
    ['GET', /^\/api\/themes\/([^/]+)\/posts$/, async ({ userId, params, query }) => ({
      posts: await social.themeFeed(userId, params[0], Number(query.get('before')) || undefined),
    })],
    ['GET', /^\/api\/users\/([^/]+)\/posts$/, async ({ userId, params, query }) => {
      const target = uuid(params[0]);
      if (!(await social.profile(userId, target)).canSeeContent) throw new SocialError(403, 'private');
      return { posts: await social.wall(userId, target, Number(query.get('before')) || undefined) };
    }],
    ['POST', /^\/api\/posts$/, async ({ userId, body }) => {
      const b = await body();
      const target =
        b.target === 'theme' ? { kind: 'theme' as const, themeId: String(b.themeId ?? '') } : { kind: 'profile' as const };
      return social.createPost(userId, target, b.text);
    }],
    ['GET', /^\/api\/posts\/([^/]+)$/, async ({ userId, params }) => social.post(userId, uuid(params[0]))],
    ['PUT', /^\/api\/posts\/([^/]+)\/like$/, async ({ userId, params }) => social.setLike(userId, uuid(params[0]), true)],
    ['DELETE', /^\/api\/posts\/([^/]+)\/like$/, async ({ userId, params }) => social.setLike(userId, uuid(params[0]), false)],
    ['GET', /^\/api\/posts\/([^/]+)\/comments$/, async ({ userId, params }) => ({ comments: await social.comments(userId, uuid(params[0])) })],
    ['POST', /^\/api\/posts\/([^/]+)\/comments$/, async ({ userId, params, body }) => {
      const b = await body();
      return social.addComment(userId, uuid(params[0]), b.text, b.parentId ? uuid(b.parentId) : undefined);
    }],

    // Classements
    ['GET', /^\/api\/leaderboard$/, async ({ userId, query }) => ({
      rows: await social.leaderboard(userId, query.get('theme') || null, query.get('scope') === 'following' ? 'following' : 'world'),
    })],
  ];

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });

    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = token ? await game.authenticate(token) : null;
    if (!user) return json(res, 401, { error: 'unauthorized' });
    if (!game.limiter.allow('http', user.id)) return json(res, 429, { error: 'rate_limited' });

    for (const [method, pattern, handler] of routes) {
      const match = url.pathname.match(pattern);
      if (!match || req.method !== method) continue;
      try {
        const result = await handler({
          userId: user.id,
          params: match.slice(1).map(decodeURIComponent),
          query: url.searchParams,
          body: () => readBody(req),
        });
        return json(res, 200, result ?? { ok: true });
      } catch (err) {
        if (err instanceof SocialError) return json(res, err.status, { error: err.code });
        if (err instanceof SyntaxError) return json(res, 400, { error: 'bad_request' });
        console.error(err);
        return json(res, 500, { error: 'server_error' });
      }
    }
    return json(res, 404, { error: 'not_found' });
  };
}
