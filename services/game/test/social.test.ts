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

  it('titre équipé : seulement un titre débloqué', async () => {
    const a = await user('Thomas');
    expect((await call(a, 'PATCH', '/api/me/profile', { equippedTitle: 'Érudit' })).status).toBe(403);
    const p = await ok(call<PublicProfile>(a, 'PATCH', '/api/me/profile', { equippedTitle: 'Débutant' }));
    expect(p.title).toBe('Débutant');
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
    expect(await themeFeed(other, 'geo-capitales')).toEqual([]);
  });
});

describe('blocage dans les fils (règles du cahier des charges)', () => {
  async function scene() {
    const thomas = await user('Thomas');
    const paul = await user('Paul');
    const toi = await user('Toi');
    await subscribe(thomas, 'sports-jo');
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
});
