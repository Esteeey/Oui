import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CommentView, FeedItem, PostView, PublicProfile, UserSummary } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient } from './helpers';

let server: GameServer;
let db: Database;
const clients: TestClient[] = [];

interface U {
  id: string;
  token: string;
  pseudo: string;
}

beforeEach(async () => {
  db = await openDatabase();
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300 });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close();
  await db.close();
});

async function call<T = Record<string, unknown>>(u: U, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function user(pseudo: string): Promise<U> {
  const c = await new TestClient(server.port).connect();
  clients.push(c);
  const u = { id: c.playerId, token: c.token, pseudo };
  expect((await call(u, 'PATCH', '/api/me/profile', { pseudo })).status).toBe(200);
  return u;
}

const ok = async <T,>(p: Promise<{ status: number; body: T }>): Promise<T> => {
  const r = await p;
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};

const post = (u: U, text: string, themeId?: string) =>
  ok(call<PostView>(u, 'POST', '/api/posts', themeId ? { target: 'theme', themeId, text } : { target: 'profile', text }));
const subscribe = (u: U, themeId: string) => ok(call(u, 'PUT', `/api/themes/${themeId}/subscription`));
const themeFeed = async (u: U, themeId: string) => (await ok(call<{ posts: PostView[] }>(u, 'GET', `/api/themes/${themeId}/posts`))).posts;
const comments = async (u: U, postId: string) => (await ok(call<{ comments: CommentView[] }>(u, 'GET', `/api/posts/${postId}/comments`))).comments;
const block = (a: U, b: U) => ok(call(a, 'POST', '/api/blocks', { userId: b.id }));
const profile = (viewer: U, target: U) => call<PublicProfile>(viewer, 'GET', `/api/users/${target.id}`);

describe('profils et pseudo', () => {
  it('pseudo valide et unique (sans tenir compte de la casse)', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    expect((await call(b, 'PATCH', '/api/me/profile', { pseudo: 'thomas' })).status).toBe(409);
    expect((await call(b, 'PATCH', '/api/me/profile', { pseudo: 'a b' })).status).toBe(400);
    expect((await call(b, 'PATCH', '/api/me/profile', { pseudo: '<b>x</b>' })).status).toBe(400);
    void a;
  });

  it('profil : meilleur thème avec rang mondial ; présence seulement pour soi et entre abonnés mutuels', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    const c = await user('Lea');
    for (const [u, theme, xp] of [
      [a, 'geo-capitales', 300],
      [a, 'sports-jo', 50],
      [b, 'geo-capitales', 900],
      [c, 'geo-capitales', 100],
    ] as const) {
      await db.query('INSERT INTO theme_stats (user_id, theme_id, rating, xp, duels) VALUES ($1, $2, 1000, $3, 3)', [u.id, theme, xp]);
    }
    const seen = await ok(profile(c, a));
    expect(seen.best).toEqual({ themeId: 'geo-capitales', rank: 2, players: 3 });
    // Pas d'abonnement mutuel : ni en ligne ni dernière activité.
    expect(seen.presence).toBeNull();
    expect((await ok(profile(a, a))).presence?.online).toBe(true);
    await ok(call(a, 'POST', `/api/users/${b.id}/follow`));
    await ok(call(b, 'POST', `/api/users/${a.id}/follow`));
    expect((await ok(profile(b, a))).presence?.online).toBe(true);
    // Profil privé non suivi : pas de meilleur thème.
    await ok(call(a, 'PATCH', '/api/me/profile', { isPrivate: true }));
    expect((await ok(profile(c, a))).best).toBeNull();
  });

  it('titre équipé : seulement un titre débloqué', async () => {
    const a = await user('Thomas');
    await db.query('INSERT INTO theme_stats (user_id, theme_id, rating, xp, duels) VALUES ($1, $2, 1000, 50, 3)', [a.id, 'geo-capitales']);
    // Niveau 1 en Capitales : le premier titre du thème, et aucun titre d'un autre palier ou d'un autre thème.
    expect((await call(a, 'PATCH', '/api/me/profile', { equippedTitle: 'Maître du Monde' })).status).toBe(403);
    expect((await call(a, 'PATCH', '/api/me/profile', { equippedTitle: 'Noob' })).status).toBe(403);
    expect((await ok(profile(a, a))).autoTitle).toBe('Touriste');
    const p = await ok(call<PublicProfile>(a, 'PATCH', '/api/me/profile', { equippedTitle: 'Touriste' }));
    expect(p.title).toBe('Touriste');
  });

  it('décor : le plus rare débloqué par défaut, seulement un décor débloqué', async () => {
    const a = await user('Thomas');
    await db.query('UPDATE users SET xp = 1200 WHERE id = $1', [a.id]);
    const before = await ok(profile(a, a));
    expect(before.level).toBe(6);
    expect(before.decor).toBe('jaune');
    expect((await call(a, 'PATCH', '/api/me/profile', { equippedDecor: 'diamant' })).status).toBe(403);
    expect((await ok(call<PublicProfile>(a, 'PATCH', '/api/me/profile', { equippedDecor: 'gris' }))).decor).toBe('gris');
  });
});

describe('abonnements', () => {
  it('profil public : abonnement direct, compteurs à jour', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    expect(await ok(call(b, 'POST', `/api/users/${a.id}/follow`))).toEqual({ status: 'following' });
    const p = await ok(profile(b, a));
    expect(p.followers).toBe(1);
    expect(p.relationship.following).toBe(true);
    expect((await ok(profile(a, a))).followers).toBe(1);
  });

  it('profil privé : demande, acceptation individuelle, accès à tout l’historique, retrait sans notification', async () => {
    const owner = await user('Privee');
    const fan = await user('Fan');
    await ok(call(owner, 'PATCH', '/api/me/profile', { isPrivate: true }));
    const old = await post(owner, 'Ancienne publication');

    // Avant acceptation : contenu inaccessible, même par l'API directe.
    expect((await ok(profile(fan, owner))).canSeeContent).toBe(false);
    expect((await call(fan, 'GET', `/api/users/${owner.id}/posts`)).status).toBe(403);
    expect((await call(fan, 'GET', `/api/posts/${old.id}`)).status).toBe(404);

    expect(await ok(call(fan, 'POST', `/api/users/${owner.id}/follow`))).toEqual({ status: 'requested' });
    const requests = await ok(call<{ requests: { user: UserSummary }[] }>(owner, 'GET', '/api/me/follow-requests'));
    expect(requests.requests.map((r) => r.user.id)).toEqual([fan.id]);

    await ok(call(owner, 'POST', `/api/me/follow-requests/${fan.id}/accept`));
    expect((await ok(profile(fan, owner))).canSeeContent).toBe(true);
    const wall = await ok(call<{ posts: PostView[] }>(fan, 'GET', `/api/users/${owner.id}/posts`));
    expect(wall.posts.map((p) => p.text)).toEqual(['Ancienne publication']);

    // Retrait de l'abonné : accès révoqué immédiatement.
    await ok(call(owner, 'DELETE', `/api/me/followers/${fan.id}`));
    expect((await call(fan, 'GET', `/api/users/${owner.id}/posts`)).status).toBe(403);
    // Il peut redemander.
    expect(await ok(call(fan, 'POST', `/api/users/${owner.id}/follow`))).toEqual({ status: 'requested' });
  });

  it('refus d’une demande : aucune trace pour le demandeur sauf la demande disparue', async () => {
    const owner = await user('Privee');
    const fan = await user('Fan');
    await ok(call(owner, 'PATCH', '/api/me/profile', { isPrivate: true }));
    await ok(call(fan, 'POST', `/api/users/${owner.id}/follow`));
    await ok(call(owner, 'POST', `/api/me/follow-requests/${fan.id}/decline`));
    const p = await ok(profile(fan, owner));
    expect(p.relationship).toMatchObject({ following: false, requested: false });
    expect((await call(owner, 'POST', `/api/me/follow-requests/${fan.id}/accept`)).status).toBe(404);
  });

  it('listes masquables, compteurs toujours visibles, recherche dans la liste', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    const c = await user('Pauline');
    await ok(call(b, 'POST', `/api/users/${a.id}/follow`));
    await ok(call(c, 'POST', `/api/users/${a.id}/follow`));
    const list = await ok(call<{ users: UserSummary[] }>(b, 'GET', `/api/users/${a.id}/followers?q=paul`));
    expect(list.users.map((u) => u.pseudo).sort()).toEqual(['Paul', 'Pauline']);
    const exact = await ok(call<{ users: UserSummary[] }>(b, 'GET', `/api/users/${a.id}/followers?q=line`));
    expect(exact.users.map((u) => u.pseudo)).toEqual(['Pauline']);

    await ok(call(a, 'PATCH', '/api/me/profile', { showFollowers: false }));
    expect((await call(b, 'GET', `/api/users/${a.id}/followers`)).status).toBe(403);
    expect((await ok(profile(b, a))).followers).toBe(2);
    expect((await call(a, 'GET', `/api/users/${a.id}/followers`)).status).toBe(200);
  });

  it('double clic sur S’abonner : un seul abonnement', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await Promise.all([1, 2, 3].map(() => call(b, 'POST', `/api/users/${a.id}/follow`)));
    expect((await ok(profile(b, a))).followers).toBe(1);
  });
});

describe('thèmes, publications, fils', () => {
  it('publier dans un thème exige d’y être abonné ; nombre d’abonnés réel', async () => {
    const a = await user('Thomas');
    expect((await call(a, 'POST', '/api/posts', { target: 'theme', themeId: 'sports-jo', text: 'Salut' })).status).toBe(403);
    const info = await subscribe(a, 'sports-jo');
    expect(info).toMatchObject({ subscribers: 1, subscribed: true });
    await post(a, 'Salut le fil JO', 'sports-jo');
    expect((await themeFeed(a, 'sports-jo')).map((p) => p.text)).toEqual(['Salut le fil JO']);
  });

  it('fil d’un thème cadenassé aux non-abonnés ; en suivant, on voit les publications d’avant', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await subscribe(a, 'sports-jo');
    const p = await post(a, 'Avant ton arrivée', 'sports-jo');
    expect((await call(b, 'GET', '/api/themes/sports-jo/posts')).status).toBe(403);
    expect((await call(b, 'GET', `/api/posts/${p.id}`)).status).toBe(404);
    expect((await call(b, 'PUT', `/api/posts/${p.id}/like`)).status).toBe(404);
    expect((await call(b, 'POST', `/api/posts/${p.id}/comments`, { text: 'Coucou' })).status).toBe(404);
    await subscribe(b, 'sports-jo');
    expect((await themeFeed(b, 'sports-jo')).map((x) => x.text)).toEqual(['Avant ton arrivée']);
    await ok(call(b, 'PUT', `/api/posts/${p.id}/like`));
    await ok(call(b, 'POST', `/api/posts/${p.id}/comments`, { text: 'Coucou' }));
    expect((await themeFeed(b, 'sports-jo'))[0]).toMatchObject({ likes: 1, comments: 1 });
  });

  it('publication avec un sticker (seul ou avec du texte, jamais avec une photo)', async () => {
    const a = await user('Thomas');
    await subscribe(a, 'sports-jo');
    const s = await ok(call<PostView>(a, 'POST', '/api/posts', { target: 'theme', themeId: 'sports-jo', text: '', stickerId: 'gg' }));
    expect(s).toMatchObject({ sticker: 'gg', media: null, text: '' });
    expect((await call(a, 'POST', '/api/posts', { target: 'theme', themeId: 'sports-jo', text: 'x', stickerId: 'inconnu' })).status).toBe(400);
    expect((await themeFeed(a, 'sports-jo'))[0].sticker).toBe('gg');
  });

  it('accueil : murs des personnes suivies et thèmes suivis seulement', async () => {
    const me = await user('Moi');
    const followed = await user('Suivi');
    const stranger = await user('Inconnu');
    await ok(call(me, 'POST', `/api/users/${followed.id}/follow`));
    await subscribe(me, 'geo-capitales');
    await subscribe(stranger, 'geo-capitales');
    await subscribe(stranger, 'sports-jo');
    await post(followed, 'Mur du suivi');
    await post(stranger, 'Mur d’un inconnu');
    await post(stranger, 'Dans un thème suivi', 'geo-capitales');
    await post(stranger, 'Dans un thème non suivi', 'sports-jo');
    await post(me, 'Mon mur');
    const items = (await ok(call<{ items: FeedItem[] }>(me, 'GET', '/api/feed'))).items;
    const texts = items.flatMap((i) => (i.kind === 'post' ? [i.post.text] : []));
    expect(texts.sort()).toEqual(['Dans un thème suivi', 'Mon mur', 'Mur du suivi']);
  });

  it('victoire : privée par défaut ; épinglée, elle devient une publication aimable et commentable (sticker compris)', async () => {
    const me = await user('Gagnant');
    const fan = await user('Abonne');
    await ok(call(fan, 'POST', `/api/users/${me.id}/follow`));
    const seed = async (outcome: 'win' | 'loss') => {
      const id = randomUUID();
      const mine = outcome === 'win' ? 20 : 10;
      const record = {
        themeId: 'sports-jo',
        opponentName: 'Rival',
        outcome,
        xpBefore: 0,
        xpGained: 0,
        questions: [{}, {}],
        player: [{ correct: true, points: mine }, { correct: false, points: 0 }],
        opponent: [{ correct: true, points: 30 - mine }, { correct: false, points: 0 }],
      };
      await db.query("INSERT INTO duels (id, theme_id, mode, state, finished_at) VALUES ($1, 'sports-jo', 'pvp', '{}', now())", [id]);
      await db.query('INSERT INTO duel_results (duel_id, user_id, result, xp_awarded) VALUES ($1, $2, $3, 0)', [id, me.id, JSON.stringify({ outcome, record })]);
      return id;
    };
    const win = await seed('win');
    const loss = await seed('loss');
    const feed = async (u: U) => (await ok(call<{ items: FeedItem[] }>(u, 'GET', '/api/feed'))).items;
    const kinds = async (u: U) => (await feed(u)).flatMap((i) => (i.kind === 'activity' ? [i.activity.event.kind] : [])).sort();
    expect(await kinds(me)).toEqual(['loss', 'win']);
    expect(await kinds(fan)).toEqual([]);

    expect((await call(me, 'PUT', `/api/duels/${loss}/pin`)).status).toBe(400);
    expect((await call(fan, 'PUT', `/api/duels/${win}/pin`)).status).toBe(404);
    const pinned = await ok(call<PostView>(me, 'PUT', `/api/duels/${win}/pin`));
    expect(pinned.result).toEqual({ duelId: win, themeId: 'sports-jo', opponent: 'Rival', score: 20, opponentScore: 10 });
    expect((await ok(call<PostView>(me, 'PUT', `/api/duels/${win}/pin`))).id).toBe(pinned.id);
    expect(await kinds(me)).toEqual(['loss']);
    expect((await feed(fan)).some((i) => i.kind === 'post' && i.post.id === pinned.id)).toBe(true);
    const wall = (await ok(call<{ posts: PostView[] }>(fan, 'GET', `/api/users/${me.id}/posts`))).posts;
    expect(wall.map((w) => w.id)).toEqual([pinned.id]);

    expect((await ok(call<PostView>(fan, 'PUT', `/api/posts/${pinned.id}/like`))).likes).toBe(1);
    const c = await ok(call<CommentView>(fan, 'POST', `/api/posts/${pinned.id}/comments`, { text: '', stickerId: 'gg' }));
    expect(c).toMatchObject({ sticker: 'gg', text: '', media: null });
    expect((await call(fan, 'POST', `/api/posts/${pinned.id}/comments`, { text: '', stickerId: 'inconnu' })).status).toBe(400);
    expect((await comments(me, pinned.id)).map((x) => x.sticker)).toEqual(['gg']);

    await ok(call(me, 'DELETE', `/api/duels/${win}/pin`));
    expect((await call(fan, 'GET', `/api/posts/${pinned.id}`)).status).toBe(404);
    expect(await kinds(me)).toEqual(['loss', 'win']);
  });

  it('likes : un seul par joueur, retrait possible', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    const p = await post(a, 'Aimez-moi');
    await Promise.all([1, 2].map(() => call(b, 'PUT', `/api/posts/${p.id}/like`)));
    expect((await ok(call<PostView>(b, 'GET', `/api/posts/${p.id}`))).likes).toBe(1);
    expect((await ok(call<PostView>(b, 'DELETE', `/api/posts/${p.id}/like`))).likes).toBe(0);
  });

  it('commentaires et réponses (un seul niveau)', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    const p = await post(a, 'Question ?');
    const c1 = await ok(call<CommentView>(b, 'POST', `/api/posts/${p.id}/comments`, { text: 'Réponse' }));
    const c2 = await ok(call<CommentView>(a, 'POST', `/api/posts/${p.id}/comments`, { text: 'Merci', parentId: c1.id }));
    const c3 = await ok(call<CommentView>(b, 'POST', `/api/posts/${p.id}/comments`, { text: 'De rien', parentId: c2.id }));
    expect(c2.parentId).toBe(c1.id);
    expect(c3.parentId).toBe(c1.id);
    expect((await ok(call<PostView>(a, 'GET', `/api/posts/${p.id}`))).comments).toBe(3);
  });

  it('mentions @pseudo : résolues, sans soi-même ni personne bloquée', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    const c = await user('Chloe');
    await block(c, a);
    const p = await post(a, 'Coucou @paul, @Chloe et @Thomas');
    expect(p.mentions.map((m) => m.pseudo)).toEqual(['Paul']);
    void b;
  });

  it('profil privé : ses publications de thème sont cachées aux non-abonnés', async () => {
    const priv = await user('Privee');
    const other = await user('Autre');
    await subscribe(priv, 'geo-capitales');
    await ok(call(priv, 'PATCH', '/api/me/profile', { isPrivate: true }));
    await post(priv, 'Publication privée', 'geo-capitales');
    await subscribe(other, 'geo-capitales');
    expect(await themeFeed(other, 'geo-capitales')).toEqual([]);
  });
});

describe('blocage dans les fils (règles du cahier des charges)', () => {
  async function scene() {
    const thomas = await user('Thomas');
    const paul = await user('Paul');
    const toi = await user('Toi');
    for (const u of [thomas, paul, toi]) await subscribe(u, 'sports-jo');
    const p = await post(thomas, 'Thomas parle de foot', 'sports-jo');
    await ok(call(paul, 'POST', `/api/posts/${p.id}/comments`, { text: 'Commentaire de Paul' }));
    return { thomas, paul, toi, p };
  }

  it('si Thomas t’a bloqué : ni sa publication ni ses commentaires', async () => {
    const { thomas, toi, p } = await scene();
    await ok(call(thomas, 'POST', `/api/posts/${p.id}/comments`, { text: 'Commentaire de Thomas' }));
    await block(thomas, toi);
    expect(await themeFeed(toi, 'sports-jo')).toEqual([]);
    expect((await call(toi, 'GET', `/api/posts/${p.id}`)).status).toBe(404);
    expect((await call(toi, 'GET', `/api/posts/${p.id}/comments`)).status).toBe(404);
    expect((await profile(toi, thomas)).status).toBe(404);
  });

  it('si Paul t’a bloqué : tu vois la publication de Thomas, pas le commentaire de Paul', async () => {
    const { paul, toi, p } = await scene();
    await block(paul, toi);
    const feed = await themeFeed(toi, 'sports-jo');
    expect(feed.map((x) => x.text)).toEqual(['Thomas parle de foot']);
    expect(feed[0].comments).toBe(0);
    expect(await comments(toi, p.id)).toEqual([]);
  });

  it('si tu as bloqué Paul : vous ne voyez plus vos commentaires respectifs', async () => {
    const { paul, toi, p } = await scene();
    await ok(call(toi, 'POST', `/api/posts/${p.id}/comments`, { text: 'Mon commentaire' }));
    await block(toi, paul);
    expect((await comments(toi, p.id)).map((c) => c.text)).toEqual(['Mon commentaire']);
    expect((await comments(paul, p.id)).map((c) => c.text)).toEqual(['Commentaire de Paul']);
  });

  it('bloquer supprime les abonnements dans les deux sens, non restaurés au déblocage ; interactions interdites', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await ok(call(a, 'POST', `/api/users/${b.id}/follow`));
    await ok(call(b, 'POST', `/api/users/${a.id}/follow`));
    const pa = await post(a, 'Mur de Thomas');
    await block(a, b);
    expect((await call(b, 'POST', `/api/users/${a.id}/follow`)).status).toBe(403);
    expect((await call(b, 'PUT', `/api/posts/${pa.id}/like`)).status).toBe(404);
    expect((await call(b, 'POST', `/api/posts/${pa.id}/comments`, { text: 'x' })).status).toBe(404);
    await ok(call(a, 'DELETE', `/api/blocks/${b.id}`));
    const p = await ok(profile(a, b));
    expect(p.relationship).toMatchObject({ following: false, followsMe: false, blockedByMe: false });
  });

  it('deux joueurs qui se bloquent mutuellement : tout reste invisible des deux côtés', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await block(a, b);
    await block(b, a);
    expect((await profile(a, b)).status).toBe(404);
    expect((await profile(b, a)).status).toBe(404);
  });
});

describe('classements réels', () => {
  it('monde et abonnements, joueurs bloqués exclus', async () => {
    const me = await user('Moi');
    const top = await user('Champion');
    const blocked = await user('Bloque');
    for (const [u, rating] of [
      [me, 1100],
      [top, 1500],
      [blocked, 1400],
    ] as const) {
      await db.query('INSERT INTO theme_stats (user_id, theme_id, rating) VALUES ($1, $2, $3)', [u.id, 'geo-capitales', rating]);
    }
    await block(me, blocked);
    type Rows = { rows: { user: UserSummary; rank: number; isMe: boolean }[] };
    const world = await ok(call<Rows>(me, 'GET', '/api/leaderboard?theme=geo-capitales&scope=world'));
    expect(world.rows.map((r) => r.user.pseudo)).toEqual(['Champion', 'Moi']);
    const mine = await ok(call<Rows>(me, 'GET', '/api/leaderboard?theme=geo-capitales&scope=following'));
    expect(mine.rows.map((r) => r.user.pseudo)).toEqual(['Moi']);
    await ok(call(me, 'POST', `/api/users/${top.id}/follow`));
    const after = await ok(call<Rows>(me, 'GET', '/api/leaderboard?scope=following'));
    expect(after.rows.map((r) => [r.user.pseudo, r.rank, r.isMe])).toEqual([
      ['Champion', 1, false],
      ['Moi', 2, true],
    ]);
  });

  it('pays : choisi par le joueur, visible de lui seul ; classement de son pays, sans bloqués', async () => {
    const me = await user('Moi');
    const voisin = await user('Voisin');
    const loin = await user('Lointain');
    const blocked = await user('Bloque');
    for (const [u, rating] of [
      [me, 1100],
      [voisin, 1300],
      [loin, 1600],
      [blocked, 1400],
    ] as const) {
      await db.query('INSERT INTO theme_stats (user_id, theme_id, rating) VALUES ($1, $2, $3)', [u.id, 'geo-capitales', rating]);
    }
    type Rows = { rows: { user: UserSummary }[] };
    const country = () => ok(call<Rows>(me, 'GET', '/api/leaderboard?theme=geo-capitales&scope=country'));
    // Sans pays choisi : pas de classement Pays.
    expect((await country()).rows).toEqual([]);

    expect((await call(me, 'PATCH', '/api/me/profile', { country: 'XX' })).status).toBe(400);
    expect((await ok(call<PublicProfile>(me, 'PATCH', '/api/me/profile', { country: 'BE' }))).country).toBe('BE');
    await ok(call(voisin, 'PATCH', '/api/me/profile', { country: 'BE' }));
    await ok(call(blocked, 'PATCH', '/api/me/profile', { country: 'BE' }));
    await ok(call(loin, 'PATCH', '/api/me/profile', { country: 'CA' }));
    await block(blocked, me);
    expect((await country()).rows.map((r) => r.user.pseudo)).toEqual(['Voisin', 'Moi']);
    // Le pays d'un autre joueur n'est jamais renvoyé avec son profil.
    expect('country' in (await ok(call<PublicProfile>(me, 'GET', `/api/users/${voisin.id}`)))).toBe(false);
    // On peut le retirer.
    await ok(call(me, 'PATCH', '/api/me/profile', { country: null }));
    expect((await country()).rows).toEqual([]);
  });

  it('semaine : XP gagnée depuis lundi, ma position même hors du haut du classement ; région et à proximité', async () => {
    const me = await user('Moi');
    const a = await user('Alice');
    const b = await user('Bruno');
    const c = await user('Chloe');
    for (const [u, xp] of [
      [me, 50],
      [a, 300],
      [b, 200],
      [c, 100],
    ] as const) {
      await db.query(
        `INSERT INTO daily_quests (user_id, day, quest_id, position, kind, label, goal, reward, progress, completed_at)
         VALUES ($1, current_date, 'play', 0, 'play', 'Joue 3 matchs', 3, $2, 3, now())`,
        [u.id, xp],
      );
    }
    type Row = { user: UserSummary; rank: number; rating: number; isMe: boolean };
    type Board = { rows: Row[]; me: Row | null; week?: { startsAt: number; endsAt: number } };
    const board = (q: string) => ok(call<Board>(me, 'GET', `/api/leaderboard?period=week${q}`));

    const top2 = await board('&limit=2');
    expect(top2.rows.map((r) => r.user.pseudo)).toEqual(['Alice', 'Bruno']);
    expect(top2.me).toMatchObject({ rank: 4, rating: 50, isMe: true });
    expect(new Date(top2.week!.startsAt).getUTCDay()).toBe(1);
    expect(top2.week!.endsAt - top2.week!.startsAt).toBe(7 * 86_400_000);
    expect(top2.week!.endsAt).toBeGreaterThan(Date.now());
    // Un duel d'un thème ne compte pas les défis du jour.
    expect((await board('&theme=geo-capitales')).rows).toEqual([]);

    // Région : même pays et même région.
    expect((await board('&scope=region')).rows).toEqual([]);
    const mine = await ok(call<PublicProfile>(me, 'PATCH', '/api/me/profile', { country: 'FR', region: 'Bretagne' }));
    expect(mine.region).toBe('Bretagne');
    await ok(call(b, 'PATCH', '/api/me/profile', { country: 'FR', region: 'Bretagne' }));
    await ok(call(a, 'PATCH', '/api/me/profile', { country: 'FR', region: 'Normandie' }));
    expect((await board('&scope=region')).rows.map((r) => r.user.pseudo)).toEqual(['Bruno', 'Moi']);

    // À proximité : position arrondie, rayon de 50 km.
    expect((await call(me, 'PATCH', '/api/me/profile', { location: { lat: 120, lon: 0 } })).status).toBe(400);
    const located = await ok(call<PublicProfile>(me, 'PATCH', '/api/me/profile', { location: { lat: 48.1173, lon: -1.6778 } }));
    expect(located.hasLocation).toBe(true);
    await ok(call(c, 'PATCH', '/api/me/profile', { location: { lat: 48.2, lon: -1.5 } }));
    await ok(call(a, 'PATCH', '/api/me/profile', { location: { lat: 43.6, lon: 1.44 } }));
    expect((await board('&scope=nearby')).rows.map((r) => r.user.pseudo)).toEqual(['Chloe', 'Moi']);
    const [{ geo_lat }] = await db.query<{ geo_lat: number }>('SELECT geo_lat FROM profiles WHERE user_id = $1', [me.id]);
    expect(geo_lat).toBeCloseTo(48.1, 5);
    // Ni la région ni la position d'un autre joueur ne sont renvoyées.
    const other = await ok(call<PublicProfile>(me, 'GET', `/api/users/${c.id}`));
    expect('hasLocation' in other || 'region' in other).toBe(false);
    await ok(call(me, 'PATCH', '/api/me/profile', { location: null }));
    expect((await board('&scope=nearby')).rows).toEqual([]);
  });
});

describe('page d’une publication', () => {
  it('compte les j’aime des commentaires et liste les dernières personnes ayant aimé', async () => {
    const auteur = await user('AuteurCom');
    const lecteur = await user('LecteurCom');
    const post = (await call<PostView>(auteur, 'POST', '/api/posts', { target: 'profile', text: 'Bonjour' })).body;
    const comment = (await call<CommentView>(lecteur, 'POST', `/api/posts/${post.id}/comments`, { text: 'Salut' })).body;
    expect(comment).toMatchObject({ likes: 0, likedByMe: false, media: null });

    expect((await call(auteur, 'PUT', `/api/comments/${comment.id}/like`)).body).toEqual({ likes: 1, likedByMe: true });
    expect((await call(auteur, 'PUT', `/api/comments/${comment.id}/like`)).body).toEqual({ likes: 1, likedByMe: true });
    const seen = await call<{ comments: CommentView[] }>(auteur, 'GET', `/api/posts/${post.id}/comments`);
    expect(seen.body.comments[0]).toMatchObject({ likes: 1, likedByMe: true });
    expect((await call(auteur, 'DELETE', `/api/comments/${comment.id}/like`)).body).toEqual({ likes: 0, likedByMe: false });

    await call(lecteur, 'PUT', `/api/posts/${post.id}/like`);
    const likers = await call<{ likers: UserSummary[] }>(auteur, 'GET', `/api/posts/${post.id}/likers`);
    expect(likers.body.likers.map((u) => u.id)).toEqual([lecteur.id]);
  });
});
