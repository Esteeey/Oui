import type { IncomingMessage, ServerResponse } from 'node:http';

import { MEDIA_MAX_BYTES, THEMES } from '@qu1z/shared';

import { randomUUID } from 'node:crypto';

import type { Challenges } from './challenges';
import type { Discovery } from './discovery';
import type { GifProvider } from './gifs';
import type { Media } from './media';
import type { Messaging } from './messaging';
import type { Game } from './game';
import type { Notifier } from './notifier';
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

/** Corps binaire (envoi d'image). La taille est vérifiée pendant la lecture, sans tout charger d'abord. */
async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (declared > MEDIA_MAX_BYTES) throw new SocialError(413, 'too_large');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MEDIA_MAX_BYTES) throw new SocialError(413, 'too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new SocialError(400, 'invalid_id');
  return value;
}

type Handler = (ctx: {
  userId: string;
  params: string[];
  query: URLSearchParams;
  body: () => Promise<Record<string, unknown>>;
  raw: () => Promise<Buffer>;
}) => Promise<unknown>;

/**
 * API HTTP. Authentification : `Authorization: Bearer <jeton>`.
 * Chaque route vérifie elle-même les droits (blocages, confidentialité) : rien ne repose sur l'interface.
 */
export function createApi(
  game: Game,
  social: Social,
  notifier: Notifier,
  challenges: Challenges,
  discovery: Discovery,
  messaging: Messaging,
  media: Media,
  gifs: GifProvider | null,
) {
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/me$/, async ({ userId }) => {
      const user = (await game.repo.user(userId))!;
      return { profile: await game.profile(userId), role: user.role, status: user.status, titles: social.titles(user.xp) };
    }],

    // Profils
    ['GET', /^\/api\/users\/([^/]+)$/, async ({ userId, params }) => social.profile(userId, uuid(params[0]))],
    ['PATCH', /^\/api\/me\/profile$/, async ({ userId, body }) => {
      const result = await social.updateProfile(userId, await body());
      await game.pushProfile(userId);
      return result;
    }],
    ['GET', /^\/api\/users\/([^/]+)\/stats$/, async ({ userId, params }) => {
      const target = uuid(params[0]);
      const profile = await social.profile(userId, target);
      if (!profile.canSeeContent) throw new SocialError(403, 'private');
      const p = await game.profile(target);
      return { stats: p.stats, history: p.history.slice(0, 10) };
    }],

    // Médias : le fichier est envoyé brut (corps de la requête), puis rattaché par son id.
    ['POST', /^\/api\/media$/, async ({ userId, query, raw }) => {
      const purpose = query.get('purpose') === 'post' ? 'post' : 'message';
      return media.upload(userId, purpose, await raw());
    }],
    ['POST', /^\/api\/me\/avatar$/, async ({ userId, raw }) => {
      const uploaded = await media.upload(userId, 'avatar', await raw());
      const result = await media.setAvatar(userId, uploaded.id);
      await game.pushProfile(userId);
      return result;
    }],
    ['DELETE', /^\/api\/me\/avatar$/, async ({ userId }) => {
      const result = await media.setAvatar(userId, null);
      await game.pushProfile(userId);
      return result;
    }],
    ['GET', /^\/api\/gifs$/, async ({ userId, query }) => {
      if (!gifs) return { available: false, gifs: [] };
      if (!game.limiter.allow('gifSearch', userId)) throw new SocialError(429, 'rate_limited');
      const q = (query.get('q') ?? '').trim().slice(0, 50);
      return { available: true, provider: gifs.name, gifs: q ? await gifs.search(q, 24) : await gifs.trending(24) };
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
      await messaging.onBlock(userId, target);
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
      return social.createPost(userId, target, b.text, b.mediaId ? uuid(b.mediaId) : undefined);
    }],
    ['GET', /^\/api\/posts\/([^/]+)$/, async ({ userId, params }) => social.post(userId, uuid(params[0]))],
    ['PUT', /^\/api\/posts\/([^/]+)\/like$/, async ({ userId, params }) => social.setLike(userId, uuid(params[0]), true)],
    ['DELETE', /^\/api\/posts\/([^/]+)\/like$/, async ({ userId, params }) => social.setLike(userId, uuid(params[0]), false)],
    ['GET', /^\/api\/posts\/([^/]+)\/comments$/, async ({ userId, params }) => ({ comments: await social.comments(userId, uuid(params[0])) })],
    ['POST', /^\/api\/posts\/([^/]+)\/comments$/, async ({ userId, params, body }) => {
      const b = await body();
      return social.addComment(userId, uuid(params[0]), b.text, b.parentId ? uuid(b.parentId) : undefined);
    }],

    // Recherche globale, mentions, Découvrir
    ['GET', /^\/api\/search$/, async ({ userId, query }) => {
      if (!game.limiter.allow('search', userId)) throw new SocialError(429, 'rate_limited');
      return discovery.search(userId, query.get('q') ?? '');
    }],
    ['GET', /^\/api\/search\/mentions$/, async ({ userId, query }) => ({
      users: await discovery.mentionSuggestions(userId, query.get('q') ?? ''),
    })],
    ['GET', /^\/api\/discover$/, async ({ userId }) => ({ users: await discovery.discover(userId) })],

    // Messagerie privée (séparée du centre de notifications)
    ['GET', /^\/api\/messages$/, async ({ userId }) => ({ conversations: await messaging.inbox(userId) })],
    ['GET', /^\/api\/messages\/requests$/, async ({ userId }) => ({ requests: await messaging.requests(userId) })],
    ['POST', /^\/api\/messages\/requests$/, async ({ userId, body }) => {
      const b = await body();
      return messaging.request(userId, uuid(b.userId), b.text);
    }],
    ['POST', /^\/api\/messages\/requests\/([^/]+)\/accept$/, async ({ userId, params }) => messaging.acceptRequest(userId, uuid(params[0]))],
    ['POST', /^\/api\/messages\/requests\/([^/]+)\/decline$/, async ({ userId, params }) => messaging.declineRequest(userId, uuid(params[0]))],
    ['GET', /^\/api\/messages\/with\/([^/]+)$/, async ({ userId, params }) => ({ conversationId: await messaging.directWith(userId, uuid(params[0])) })],
    ['PUT', /^\/api\/messages\/reactions\/([^/]+)$/, async ({ userId, params, body }) => messaging.react(userId, uuid(params[0]), String((await body()).emoji ?? ''))],
    ['DELETE', /^\/api\/messages\/reactions\/([^/]+)$/, async ({ userId, params }) => messaging.react(userId, uuid(params[0]), null)],
    ['GET', /^\/api\/messages\/([^/]+)$/, async ({ userId, params, query }) =>
      messaging.conversation(userId, uuid(params[0]), Number(query.get('before')) || undefined)],
    ['POST', /^\/api\/messages\/([^/]+)$/, async ({ userId, params, body }) => {
      const b = await body();
      return messaging.sendMessage(userId, uuid(params[0]), {
        text: b.text,
        mediaId: b.mediaId ? uuid(b.mediaId) : undefined,
        gif: b.gif ?? undefined,
        stickerId: b.stickerId ?? undefined,
        replyToId: b.replyToId ? uuid(b.replyToId) : undefined,
      });
    }],
    ['POST', /^\/api\/messages\/([^/]+)\/read$/, async ({ userId, params }) => messaging.markRead(userId, uuid(params[0]))],
    ['PUT', /^\/api\/messages\/([^/]+)\/pin$/, async ({ userId, params }) => messaging.setPinned(userId, uuid(params[0]), true)],
    ['DELETE', /^\/api\/messages\/([^/]+)\/pin$/, async ({ userId, params }) => messaging.setPinned(userId, uuid(params[0]), false)],
    ['DELETE', /^\/api\/messages\/([^/]+)$/, async ({ userId, params }) => messaging.hide(userId, uuid(params[0]))],

    // Notifications
    ['GET', /^\/api\/notifications$/, async ({ userId }) => ({
      notifications: await notifier.list(userId),
      unread: await notifier.unread(userId),
    })],
    ['POST', /^\/api\/notifications\/read-all$/, async ({ userId }) => notifier.markAllRead(userId)],
    ['POST', /^\/api\/notifications\/([^/]+)\/read$/, async ({ userId, params }) => notifier.markRead(userId, uuid(params[0]))],
    ['GET', /^\/api\/me\/notification-preferences$/, async ({ userId }) => notifier.prefs(userId)],
    ['PATCH', /^\/api\/me\/notification-preferences$/, async ({ userId, body }) => notifier.setPrefs(userId, await body())],

    // Défis
    ['GET', /^\/api\/challenges$/, async ({ userId }) => ({ challenges: await challenges.list(userId) })],
    ['GET', /^\/api\/users\/([^/]+)\/can-challenge$/, async ({ userId, params }) => ({
      canChallenge: await challenges.canChallenge(userId, uuid(params[0])),
    })],
    ['POST', /^\/api\/challenges$/, async ({ userId, body }) => {
      const b = await body();
      return challenges.create(userId, uuid(b.userId), String(b.themeId ?? ''), b.rematchOf ? uuid(b.rematchOf) : undefined);
    }],
    ['POST', /^\/api\/challenges\/([^/]+)\/accept$/, async ({ userId, params }) => challenges.accept(userId, uuid(params[0]))],
    ['POST', /^\/api\/challenges\/([^/]+)\/decline$/, async ({ userId, params }) => challenges.decline(userId, uuid(params[0]))],
    ['POST', /^\/api\/challenges\/([^/]+)\/cancel$/, async ({ userId, params }) => challenges.cancel(userId, uuid(params[0]))],

    // Annonces officielles : publiées uniquement par un administrateur.
    ['POST', /^\/api\/admin\/announcements$/, async ({ userId, body }) => {
      const user = await game.repo.user(userId);
      if (user?.role !== 'admin') throw new SocialError(403, 'forbidden');
      const b = await body();
      const title = String(b.title ?? '').trim();
      const text = String(b.body ?? '').trim();
      const kind = ['maintenance', 'update', 'event', 'feature', 'info'].includes(String(b.kind)) ? String(b.kind) : 'info';
      if (!title || title.length > 120 || !text || text.length > 1000) throw new SocialError(400, 'invalid_text');
      const id = randomUUID();
      await game.repo.db.query('INSERT INTO system_announcements (id, author_id, title, body, kind) VALUES ($1, $2, $3, $4, $5)', [
        id,
        userId,
        title,
        text,
        kind,
      ]);
      const recipients = await notifier.broadcast({ type: 'announcement', category: 'system', data: { announcementId: id, title, kind } });
      return { id, recipients };
    }],
    ['GET', /^\/api\/announcements\/([^/]+)$/, async ({ params }) => {
      const [row] = await game.repo.db.query<{ id: string; title: string; body: string; kind: string; created_at: Date }>(
        'SELECT id, title, body, kind, created_at FROM system_announcements WHERE id = $1',
        [uuid(params[0])],
      );
      if (!row) throw new SocialError(404, 'not_found');
      return { ...row, createdAt: new Date(row.created_at).getTime() };
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
    // Fichiers des médias (adresses impossibles à deviner). En production, servis par le CDN du stockage objet.
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const file = await media.store.get(url.pathname.slice('/media/'.length)).catch(() => null);
      if (!file) return json(res, 404, { error: 'not_found' });
      res.writeHead(200, {
        'content-type': file.contentType,
        'content-length': file.data.length,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      });
      return void res.end(file.data);
    }
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
          raw: () => readRaw(req),
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
