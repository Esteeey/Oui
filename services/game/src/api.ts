import type { IncomingMessage, ServerResponse } from 'node:http';

import { MEDIA_MAX_BYTES, SOUND_MAX_BYTES, THEMES, seasonOf, weekOf, type LeaderboardPeriod, type LeaderboardScope, type Restriction } from '@qu1z/shared';

import { randomUUID } from 'node:crypto';

import type { Challenges } from './challenges';
import type { LiveInvitations } from './live-invitations';
import type { WebPush } from './web-push';
import type { Discovery } from './discovery';
import type { GifProvider } from './gifs';
import type { Groups } from './groups';
import type { Media } from './media';
import { requestNetwork, type Moderation } from './moderation';
import type { AccountDeletion } from './account-deletion';
import type { Accounts } from './accounts';
import type { Push } from './push';
import type { Messaging } from './messaging';
import type { Game } from './game';
import { Medals } from './medals';
import type { Notifier } from './notifier';
import { SocialError, type Social } from './social';
import { GameSounds } from './sounds';
import { AnimationSettings } from './animation-settings';
import { ThemeCatalog } from './theme-catalog';

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

/** Corps binaire (image, son). La taille est vérifiée pendant la lecture, sans tout charger d'abord. */
async function readRaw(req: IncomingMessage, maxBytes = MEDIA_MAX_BYTES): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (declared > maxBytes) throw new SocialError(413, 'too_large');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new SocialError(413, 'too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const BANNED_ALLOWED: [string, RegExp][] = [
  ['GET', /^\/api\/me$/],
  ['GET', /^\/api\/me\/sanctions$/],
  ['POST', /^\/api\/me\/sanctions\/[^/]+\/appeal$/],
  // Le droit à l'effacement vaut aussi pour un compte banni (les preuves de modération restent conservées).
  ['POST', /^\/api\/me\/delete$/],
];

/** Actions refusées pendant une suspension, selon les restrictions choisies par la modération. */
const RESTRICTED: [string, RegExp, Restriction][] = [
  ['POST', /^\/api\/messages\/requests$/, 'messages'],
  ['POST', /^\/api\/messages\/[^/]+$/, 'messages'],
  ['POST', /^\/api\/groups$/, 'messages'],
  ['POST', /^\/api\/groups\/[^/]+\/invitations$/, 'messages'],
  ['POST', /^\/api\/groups\/invitations\/[^/]+\/accept$/, 'messages'],
  ['POST', /^\/api\/media$/, 'messages'],
  ['POST', /^\/api\/posts$/, 'posts'],
  ['POST', /^\/api\/posts\/[^/]+\/comments$/, 'posts'],
  ['POST', /^\/api\/users\/[^/]+\/follow$/, 'interactions'],
  ['PUT', /^\/api\/posts\/[^/]+\/like$/, 'interactions'],
  ['PUT', /^\/api\/messages\/reactions\/[^/]+$/, 'interactions'],
  ['POST', /^\/api\/challenges$/, 'interactions'],
  ['PATCH', /^\/api\/me\/profile$/, 'interactions'],
  ['POST', /^\/api\/me\/avatar$/, 'interactions'],
  ['POST', /^\/api\/me\/cover$/, 'interactions'],
];

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new SocialError(400, 'invalid_id');
  return value;
}

type Handler = (ctx: {
  userId: string;
  params: string[];
  query: URLSearchParams;
  body: () => Promise<Record<string, unknown>>;
  /** Corps binaire ; `maxBytes` : plafond (par défaut celui des images). */
  raw: (maxBytes?: number) => Promise<Buffer>;
  token: string;
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
  groups: Groups,
  moderation: Moderation,
  accounts: Accounts,
  push: Push,
  deletion: AccountDeletion,
  themeCatalog: ThemeCatalog,
  liveInvitations: LiveInvitations,
  webPush: WebPush,
) {
  const medals = new Medals(game.repo.db);
  const sounds = new GameSounds(game.repo.db);
  const animations = new AnimationSettings(game.repo.db);
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/me$/, async ({ userId }) => {
      const user = (await game.repo.user(userId))!;
      return { profile: await game.profile(userId), role: user.role, status: user.status, ...(await social.cosmetics(userId, user.xp)) };
    }],

    ['GET', /^\/api\/me\/themes\/([^/]+)\/question-progress$/, async ({ userId, params }) => ({
      seenQuestions: await game.repo.seenQuestionCount(userId, params[0]),
    })],

    // Profils
    ['GET', /^\/api\/users\/([^/]+)$/, async ({ userId, params }) => social.profile(userId, uuid(params[0]))],
    // Médailles : mêmes règles que le reste du contenu du profil (blocage : introuvable ; profil privé : abonnés seulement).
    ['GET', /^\/api\/users\/([^/]+)\/medals$/, async ({ userId, params }) => {
      const target = uuid(params[0]);
      const profile = await social.profile(userId, target);
      if (!profile.canSeeContent) throw new SocialError(403, 'private');
      return { medals: await medals.of(target) };
    }],
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

    // Compte e-mail (connexion sans mot de passe) et appareils
    ['GET', /^\/api\/me\/account$/, async ({ userId }) => accounts.account(userId)],
    ['POST', /^\/api\/me\/delete$/, async ({ userId, body }) => deletion.delete(userId, (await body()).confirm)],
    ['POST', /^\/api\/auth\/email\/start$/, async ({ userId, body }) => accounts.start(userId, (await body()).email)],
    ['POST', /^\/api\/auth\/email\/verify$/, async ({ userId, body }) => {
      const b = await body();
      return accounts.verify(userId, b.email, b.code);
    }],
    ['POST', /^\/api\/auth\/logout$/, async ({ userId, token, body }) => {
      const b = await body();
      return accounts.logout(userId, token, typeof b.pushToken === 'string' ? b.pushToken : undefined);
    }],
    ['PUT', /^\/api\/me\/push-tokens$/, async ({ userId, body }) => {
      const b = await body();
      return push.register(userId, b.token, b.platform);
    }],
    ['DELETE', /^\/api\/me\/push-tokens$/, async ({ userId, body }) => push.unregister(userId, String((await body()).token ?? ''))],

    // Signalements, sanctions et appels (joueurs)
    ['POST', /^\/api\/reports$/, async ({ userId, body }) => {
      const b = await body();
      return moderation.report(userId, { targetType: b.targetType, targetId: uuid(b.targetId), reason: b.reason, details: b.details });
    }],
    ['GET', /^\/api\/me\/sanctions$/, async ({ userId }) => ({ sanctions: await moderation.mySanctions(userId) })],
    ['POST', /^\/api\/me\/sanctions\/([^/]+)\/appeal$/, async ({ userId, params, body }) => {
      const b = await body();
      return moderation.appeal(userId, uuid(params[0]), b.text, b.evidence);
    }],

    // Panneau de modération (rôles moderator et admin, vérifiés dans le service)
    ['GET', /^\/api\/mod\/reports$/, async ({ userId, query }) => ({
      reports: await moderation.listReports(userId, (query.get('status') as 'open') || 'open'),
    })],
    ['GET', /^\/api\/mod\/reports\/([^/]+)$/, async ({ userId, params }) => moderation.reportDetail(userId, uuid(params[0]))],
    ['POST', /^\/api\/mod\/reports\/([^/]+)\/status$/, async ({ userId, params, body }) => {
      const b = await body();
      return moderation.setReportStatus(userId, uuid(params[0]), b.status as 'open', b.resolution);
    }],
    ['POST', /^\/api\/mod\/remove$/, async ({ userId, body }) => {
      const b = await body();
      const type = b.type === 'post' || b.type === 'comment' ? b.type : 'message';
      return moderation.removeContent(userId, type, uuid(b.id), b.reportId ? uuid(b.reportId) : undefined);
    }],
    ['GET', /^\/api\/mod\/groups\/([^/]+)$/, async ({ userId, params }) => moderation.groupView(userId, uuid(params[0]))],
    ['POST', /^\/api\/mod\/groups\/([^/]+)\/exclusions$/, async ({ userId, params, body }) => {
      const b = await body();
      const hours = b.hours === null || b.hours === undefined ? null : Number(b.hours);
      return moderation.groupExclude(userId, uuid(params[0]), uuid(b.userId), hours, b.reportId ? uuid(b.reportId) : undefined);
    }],
    ['POST', /^\/api\/mod\/groups\/([^/]+)\/close$/, async ({ userId, params, body }) => {
      const b = await body();
      return moderation.closeGroup(userId, uuid(params[0]), b.reportId ? uuid(b.reportId) : undefined);
    }],
    ['POST', /^\/api\/mod\/sanctions$/, async ({ userId, body }) => {
      const b = await body();
      return moderation.sanction(userId, {
        userId: uuid(b.userId),
        level: b.level,
        reason: b.reason,
        hours: b.hours,
        restrictions: b.restrictions,
        reportId: b.reportId ? uuid(b.reportId) : undefined,
      });
    }],
    ['POST', /^\/api\/mod\/sanctions\/([^/]+)\/revoke$/, async ({ userId, params, body }) =>
      moderation.revokeSanction(userId, uuid(params[0]), (await body()).reason)],
    ['GET', /^\/api\/mod\/appeals$/, async ({ userId, query }) => ({
      appeals: await moderation.listAppeals(userId, (query.get('status') as 'open') || 'open'),
    })],
    ['POST', /^\/api\/mod\/appeals\/([^/]+)$/, async ({ userId, params, body }) => {
      const b = await body();
      return moderation.decideAppeal(userId, uuid(params[0]), b.status as 'accepted', b.decision);
    }],
    ['GET', /^\/api\/mod\/log$/, async ({ userId, query }) => ({
      entries: await moderation.journal(userId, query.get('target') ? uuid(query.get('target')) : undefined),
    })],
    ['PUT', /^\/api\/admin\/users\/([^/]+)\/role$/, async ({ userId, params, body }) => moderation.setStaffRole(userId, uuid(params[0]), (await body()).role)],

    // Médias : le fichier est envoyé brut (corps de la requête), puis rattaché par son id.
    ['POST', /^\/api\/media$/, async ({ userId, query, raw }) => {
      const asked = query.get('purpose');
      const purpose = asked === 'post' || asked === 'group' ? asked : 'message';
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
    ['POST', /^\/api\/me\/cover$/, async ({ userId, raw }) => {
      const uploaded = await media.upload(userId, 'cover', await raw());
      return media.setCover(userId, uploaded.id);
    }],
    ['DELETE', /^\/api\/me\/cover$/, async ({ userId }) => media.setCover(userId, null)],
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

    ['GET', /^\/api\/theme-catalog$/, async () => ({ themes: await themeCatalog.list() })],
    ['POST', /^\/api\/admin\/themes$/, async ({ userId, body }) => themeCatalog.create(userId, await body())],
    ['PUT', /^\/api\/admin\/themes\/([^/]+)\/(icon|cover)$/, async ({ userId, params, raw }) => themeCatalog.setAsset(userId, params[0], params[1] as 'icon' | 'cover', await raw(MEDIA_MAX_BYTES))],
    ['POST', /^\/api\/admin\/themes\/([^/]+)\/publish$/, async ({ userId, params }) => ({ theme: await themeCatalog.publish(userId, params[0]) })],
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
      return social.createPost(userId, target, b.text, b.mediaId ? uuid(b.mediaId) : undefined, b.stickerId);
    }],
    ['GET', /^\/api\/posts\/([^/]+)$/, async ({ userId, params }) => social.post(userId, uuid(params[0]))],
    ['PUT', /^\/api\/posts\/([^/]+)\/like$/, async ({ userId, params }) => social.setLike(userId, uuid(params[0]), true)],
    ['DELETE', /^\/api\/posts\/([^/]+)\/like$/, async ({ userId, params }) => social.setLike(userId, uuid(params[0]), false)],
    ['GET', /^\/api\/posts\/([^/]+)\/comments$/, async ({ userId, params }) => ({ comments: await social.comments(userId, uuid(params[0])) })],
    ['POST', /^\/api\/posts\/([^/]+)\/comments$/, async ({ userId, params, body }) => {
      const b = await body();
      return social.addComment(userId, uuid(params[0]), b.text, b.parentId ? uuid(b.parentId) : undefined, b.mediaId ? uuid(b.mediaId) : undefined);
    }],
    ['GET', /^\/api\/posts\/([^/]+)\/likers$/, async ({ userId, params }) => ({ likers: await social.recentLikers(userId, uuid(params[0])) })],
    ['PUT', /^\/api\/comments\/([^/]+)\/like$/, async ({ userId, params }) => social.setCommentLike(userId, uuid(params[0]), true)],
    ['DELETE', /^\/api\/comments\/([^/]+)\/like$/, async ({ userId, params }) => social.setCommentLike(userId, uuid(params[0]), false)],

    // Recherche globale, mentions, Découvrir
    ['GET', /^\/api\/search$/, async ({ userId, query }) => {
      if (!game.limiter.allow('search', userId)) throw new SocialError(429, 'rate_limited');
      return discovery.search(userId, query.get('q') ?? '');
    }],
    ['GET', /^\/api\/search\/mentions$/, async ({ userId, query }) => ({
      users: await discovery.mentionSuggestions(userId, query.get('q') ?? ''),
    })],
    ['GET', /^\/api\/discover$/, async ({ userId }) => ({ users: await discovery.discover(userId) })],
    ['GET', /^\/api\/people$/, async ({ userId }) => discovery.people(userId)],

    // Messagerie privée (séparée du centre de notifications)
    ['GET', /^\/api\/messages$/, async ({ userId }) => ({ conversations: await messaging.inbox(userId) })],
    ['GET', /^\/api\/messages\/requests$/, async ({ userId }) => ({ requests: await messaging.requests(userId) })],
    ['POST', /^\/api\/messages\/requests$/, async ({ userId, body }) => {
      const b = await body();
      return messaging.request(userId, uuid(b.userId), b.text);
    }],
    ['POST', /^\/api\/messages\/requests\/([^/]+)\/accept$/, async ({ userId, params }) => messaging.acceptRequest(userId, uuid(params[0]))],
    ['POST', /^\/api\/messages\/requests\/([^/]+)\/decline$/, async ({ userId, params }) => messaging.declineRequest(userId, uuid(params[0]))],
    // Groupes (dans la même messagerie)
    ['POST', /^\/api\/groups$/, async ({ userId, body }) => {
      const b = await body();
      const ids = Array.isArray(b.userIds) ? b.userIds.slice(0, 99).map(uuid) : [];
      return groups.create(userId, b.name, ids);
    }],
    ['GET', /^\/api\/groups\/invitations$/, async ({ userId }) => ({ invitations: await groups.invitations(userId) })],
    ['POST', /^\/api\/groups\/invitations\/([^/]+)\/accept$/, async ({ userId, params }) => groups.accept(userId, uuid(params[0]))],
    ['POST', /^\/api\/groups\/invitations\/([^/]+)\/decline$/, async ({ userId, params }) => groups.decline(userId, uuid(params[0]))],
    ['PUT', /^\/api\/groups\/pins\/([^/]+)$/, async ({ userId, params }) => groups.setPinned(userId, uuid(params[0]), true)],
    ['DELETE', /^\/api\/groups\/pins\/([^/]+)$/, async ({ userId, params }) => groups.setPinned(userId, uuid(params[0]), false)],
    ['GET', /^\/api\/groups\/([^/]+)$/, async ({ userId, params }) => groups.detail(userId, uuid(params[0]))],
    ['PATCH', /^\/api\/groups\/([^/]+)$/, async ({ userId, params, body }) => {
      const b = await body();
      return groups.update(userId, uuid(params[0]), {
        name: b.name,
        avatarMediaId: b.avatarMediaId === undefined ? undefined : b.avatarMediaId === null ? null : uuid(b.avatarMediaId),
      });
    }],
    ['DELETE', /^\/api\/groups\/([^/]+)$/, async ({ userId, params, body }) => {
      // Suppression définitive : confirmation explicite obligatoire.
      if ((await body()).confirm !== true) throw new SocialError(400, 'confirmation_required');
      return groups.delete(userId, uuid(params[0]));
    }],
    ['POST', /^\/api\/groups\/([^/]+)\/invitations$/, async ({ userId, params, body }) => groups.invite(userId, uuid(params[0]), uuid((await body()).userId))],
    ['DELETE', /^\/api\/groups\/([^/]+)\/invitations\/([^/]+)$/, async ({ userId, params }) =>
      groups.cancelInvitation(userId, uuid(params[0]), uuid(params[1]))],
    ['POST', /^\/api\/groups\/([^/]+)\/leave$/, async ({ userId, params }) => groups.leave(userId, uuid(params[0]))],
    ['POST', /^\/api\/groups\/([^/]+)\/transfer$/, async ({ userId, params, body }) => groups.transfer(userId, uuid(params[0]), uuid((await body()).userId))],
    ['PUT', /^\/api\/groups\/([^/]+)\/members\/([^/]+)\/role$/, async ({ userId, params, body }) => {
      const role = (await body()).role;
      if (role !== 'admin' && role !== 'member') throw new SocialError(400, 'invalid_role');
      return groups.setRole(userId, uuid(params[0]), uuid(params[1]), role);
    }],
    ['DELETE', /^\/api\/groups\/([^/]+)\/members\/([^/]+)$/, async ({ userId, params }) => groups.remove(userId, uuid(params[0]), uuid(params[1]))],
    ['POST', /^\/api\/groups\/([^/]+)\/exclusions$/, async ({ userId, params, body }) => {
      const b = await body();
      const hours = b.hours === null || b.hours === undefined ? null : Number(b.hours);
      return groups.remove(userId, uuid(params[0]), uuid(b.userId), { hours, reason: b.reason });
    }],
    ['DELETE', /^\/api\/groups\/([^/]+)\/exclusions\/([^/]+)$/, async ({ userId, params }) => groups.liftExclusion(userId, uuid(params[0]), uuid(params[1]))],

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
    ['GET', /^\/api\/me\/web-push-key$/, async () => ({ publicKey: webPush.publicKey })],
    ['PUT', /^\/api\/me\/web-push$/, async ({ userId, body }) => {
      const b = await body();
      return webPush.register(userId, b.subscription, null);
    }],
    ['DELETE', /^\/api\/me\/web-push$/, async ({ userId, body }) => {
      const b = await body();
      await webPush.remove(userId, String(b.endpoint ?? ''));
    }],
    ['GET', /^\/api\/notifications$/, async ({ userId }) => ({
      notifications: await notifier.list(userId),
      unread: await notifier.unread(userId),
    })],
    ['POST', /^\/api\/notifications\/read-all$/, async ({ userId }) => notifier.markAllRead(userId)],
    ['POST', /^\/api\/notifications\/([^/]+)\/read$/, async ({ userId, params }) => notifier.markRead(userId, uuid(params[0]))],
    ['GET', /^\/api\/me\/notification-preferences$/, async ({ userId }) => notifier.prefs(userId)],
    ['PATCH', /^\/api\/me\/notification-preferences$/, async ({ userId, body }) => notifier.setPrefs(userId, await body())],

    // Défis
    ['GET', /^\/api\/live-invitations$/, async ({ userId }) => liveInvitations.list(userId)],
    ['POST', /^\/api\/live-invitations$/, async ({ userId, body }) => {
      const b = await body();
      return liveInvitations.create(userId, uuid(b.userId), String(b.themeId ?? ''));
    }],
    ['POST', /^\/api\/live-invitations\/([^/]+)\/(accept|decline|cancel)$/, async ({ userId, params }) =>
      liveInvitations.respond(userId, uuid(params[0]), params[1] as 'accept' | 'decline' | 'cancel')],
    ['GET', /^\/api\/challenges$/, async ({ userId }) => ({ challenges: await challenges.list(userId) })],
    ['GET', /^\/api\/users\/([^/]+)\/can-challenge$/, async ({ userId, params }) => ({
      canChallenge: await challenges.canChallenge(userId, uuid(params[0])),
    })],
    ['POST', /^\/api\/challenges$/, async ({ userId, body }) => {
      const b = await body();
      return challenges.create(userId, uuid(b.userId), String(b.themeId ?? ''), b.rematchOf ? uuid(b.rematchOf) : undefined);
    }],
    ['GET', /^\/api\/challenges\/([0-9a-f-]{36})$/, async ({ userId, params }) => challenges.view(userId, uuid(params[0]))],
    ['POST', /^\/api\/challenges\/([^/]+)\/accept$/, async ({ userId, params }) => challenges.accept(userId, uuid(params[0]))],
    ['POST', /^\/api\/challenges\/([^/]+)\/decline$/, async ({ userId, params }) => challenges.decline(userId, uuid(params[0]))],
    ['POST', /^\/api\/challenges\/([^/]+)\/cancel$/, async ({ userId, params }) => challenges.cancel(userId, uuid(params[0]))],

    // Sons du jeu : remplacements choisis par un administrateur (l'appli garde ses sons d'origine pour le reste).
    ['GET', /^\/api\/sounds$/, async () => ({ sounds: await sounds.overrides() })],
    ['GET', /^\/api\/admin\/sounds$/, async ({ userId }) => ({ sounds: await sounds.list(userId) })],
    ['PUT', /^\/api\/admin\/sounds\/([^/]+)$/, async ({ userId, params, query, raw }) =>
      sounds.set(userId, params[0], await raw(SOUND_MAX_BYTES), query.get('name'))],
    ['DELETE', /^\/api\/admin\/sounds\/([^/]+)$/, async ({ userId, params }) => sounds.reset(userId, params[0])],

    // Animations : réglées par un administrateur, lues par tous les joueurs.
    ['GET', /^\/api\/animations$/, async () => animations.read()],
    ['PUT', /^\/api\/admin\/animations\/([^/]+)$/, async ({ userId, params, body }) => animations.update(userId, params[0], await body())],
    ['DELETE', /^\/api\/admin\/animations\/([^/]+)$/, async ({ userId, params }) => animations.reset(userId, params[0])],

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

    // Défis du jour : 3 objectifs, leur avancée et le prochain minuit.
    ['GET', /^\/api\/quests$/, async ({ userId }) => game.quests.list(userId)],

    // Classements
    ['GET', /^\/api\/leaderboard$/, async ({ userId, query }) => {
      const p = query.get('period');
      const period: LeaderboardPeriod = p === 'season' || p === 'week' ? p : 'rating';
      if (period === 'season') await medals.closeFinishedSeasons();
      const s = query.get('scope');
      const scope: LeaderboardScope = s === 'following' || s === 'country' || s === 'region' || s === 'nearby' ? s : 'world';
      const board = await social.leaderboard(userId, query.get('theme') || null, scope, Number(query.get('limit')) || 100, period);
      return {
        ...board,
        ...(period === 'season' ? { season: seasonOf(Date.now()) } : {}),
        ...(period === 'week' ? { week: weekOf(Date.now()) } : {}),
      };
    }],
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
    // Sons remplacés par l'administration (adresse versionnée : `?v=` change à chaque remplacement).
    if (req.method === 'GET' && url.pathname.startsWith('/sounds/')) {
      const file = await sounds.file(url.pathname.slice('/sounds/'.length)).catch(() => null);
      if (!file) return json(res, 404, { error: 'not_found' });
      res.writeHead(200, {
        'content-type': file.contentType,
        'content-length': file.data.length,
        'cache-control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      });
      return void res.end(file.data);
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });

    // Inscription et connexion : seules routes ouvertes sans jeton (il n'y a pas de compte invité).
    if (req.method === 'POST' && (url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login')) {
      try {
        const body = await readBody(req);
        const result =
          url.pathname === '/api/auth/register'
            ? await accounts.register(requestNetwork(req), body)
            : await accounts.login(requestNetwork(req), body.email, body.password);
        return json(res, 200, result);
      } catch (err) {
        if (err instanceof SocialError) return json(res, err.status, { error: err.code });
        if (err instanceof SyntaxError) return json(res, 400, { error: 'bad_request' });
        console.error(err);
        return json(res, 500, { error: 'server_error' });
      }
    }

    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = token ? await game.authenticate(token, { allowBanned: true }) : null;
    if (!user) return json(res, 401, { error: 'unauthorized' });
    // Compte banni : accès interdit, sauf pour consulter ses sanctions et faire appel.
    if (user.status === 'banned' && !BANNED_ALLOWED.some(([m, re]) => m === req.method && re.test(url.pathname))) {
      return json(res, 403, { error: 'banned' });
    }
    // Messagerie, publications et groupes : e-mail vérifié exigé (si activé), pour que le bannissement soit efficace.
    if (
      accounts.emailRequired &&
      RESTRICTED.some(([m, re, r]) => m === req.method && re.test(url.pathname) && (r === 'messages' || r === 'posts')) &&
      !(await accounts.hasVerifiedEmail(user.id))
    ) {
      return json(res, 403, { error: 'email_required' });
    }
    // Suspension : les fonctionnalités restreintes par l'équipe de modération sont refusées.
    const restriction = RESTRICTED.find(([m, re]) => m === req.method && re.test(url.pathname))?.[2];
    if (restriction && (await moderation.restrictions(user.id)).restricted.has(restriction)) {
      const { until } = await moderation.restrictions(user.id);
      return json(res, 403, { error: 'suspended', until });
    }
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
          raw: (maxBytes) => readRaw(req, maxBytes),
          token,
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
