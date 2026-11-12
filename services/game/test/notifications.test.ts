import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ChallengeView, NotificationPrefs, NotificationView, PostView } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient, sleep } from './helpers';

let server: GameServer;
let db: Database;
const clients: TestClient[] = [];

interface U {
  id: string;
  token: string;
  pseudo: string;
  ws: TestClient;
}

beforeEach(async () => {
  db = await openDatabase();
  // Le test du plafond publie 55 messages d'affilée : on relève la limite anti-spam de publication.
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300, limits: { post: { max: 1000, windowMs: 60_000 } } });
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

const ok = async <T,>(p: Promise<{ status: number; body: T }>): Promise<T> => {
  const r = await p;
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};

async function user(pseudo: string): Promise<U> {
  const ws = await new TestClient(server.port).connect();
  clients.push(ws);
  const u = { id: ws.playerId, token: ws.token, pseudo, ws };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

const notifs = async (u: U) => ok(call<{ notifications: NotificationView[]; unread: number }>(u, 'GET', '/api/notifications'));
const post = (u: U, text: string) => ok(call<PostView>(u, 'POST', '/api/posts', { target: 'profile', text }));
const follow = (a: U, b: U) => ok(call(a, 'POST', `/api/users/${b.id}/follow`));

describe('notifications communautaires', () => {
  it('likes regroupés : une seule notification « X et N autres », sans doublon', async () => {
    const author = await user('Auteur');
    const fans = await Promise.all(['Thomas', 'Paul', 'Lea'].map(user));
    const p = await post(author, 'Aimez-moi');
    for (const f of fans) await ok(call(f, 'PUT', `/api/posts/${p.id}/like`));
    await ok(call(fans[0], 'DELETE', `/api/posts/${p.id}/like`));
    await ok(call(fans[0], 'PUT', `/api/posts/${p.id}/like`));
    const { notifications, unread } = await notifs(author);
    const likes = notifications.filter((n) => n.type === 'like');
    expect(likes).toHaveLength(1);
    expect(likes[0].actorCount).toBe(3);
    expect(likes[0].actors[0].pseudo).toBe('Thomas');
    expect(likes[0].data.postId).toBe(p.id);
    expect(unread).toBe(1);
  });

  it('commentaire, réponse et mention ; regroupement des réponses rapprochées, relancé après lecture', async () => {
    const author = await user('Auteur');
    const paul = await user('Paul');
    const lea = await user('Lea');
    const p = await post(author, 'Question ?');
    const c = await ok(call<{ id: string }>(paul, 'POST', `/api/posts/${p.id}/comments`, { text: 'Ma réponse' }));
    await ok(call(lea, 'POST', `/api/posts/${p.id}/comments`, { text: 'Je réponds à Paul', parentId: c.id }));
    await ok(call(author, 'POST', `/api/posts/${p.id}/comments`, { text: 'Merci @Lea', parentId: c.id }));

    const forPaul = (await notifs(paul)).notifications.filter((n) => n.type === 'reply');
    expect(forPaul).toHaveLength(1);
    expect(forPaul[0].actorCount).toBe(2);
    const forAuthor = (await notifs(author)).notifications;
    expect(forAuthor.filter((n) => n.type === 'comment')).toHaveLength(1);
    expect((await notifs(lea)).notifications.map((n) => n.type)).toContain('mention');

    // Après lecture, une nouvelle réponse repart de zéro.
    await ok(call(paul, 'POST', '/api/notifications/read-all'));
    await ok(call(lea, 'POST', `/api/posts/${p.id}/comments`, { text: 'Encore moi', parentId: c.id }));
    const again = (await notifs(paul)).notifications.find((n) => n.type === 'reply')!;
    expect(again.read).toBe(false);
    expect(again.actorCount).toBe(1);
  });

  it('aucune notification d’un joueur bloqué ; les anciennes disparaissent de la liste', async () => {
    const author = await user('Auteur');
    const troll = await user('Troll');
    const p = await post(author, 'Bonjour');
    await ok(call(troll, 'PUT', `/api/posts/${p.id}/like`));
    expect((await notifs(author)).notifications).toHaveLength(1);
    await ok(call(author, 'POST', '/api/blocks', { userId: troll.id }));
    expect((await notifs(author)).notifications).toHaveLength(0);
    const mention = await post(troll, 'Coucou @Auteur');
    expect(mention.mentions).toEqual([]);
  });

  it('plafond de 50 : les plus anciennes disparaissent, même non lues', async () => {
    const author = await user('Auteur');
    const fan = await user('Fan');
    const posts: PostView[] = [];
    for (let i = 0; i < 55; i++) posts.push(await post(author, `Publication ${i}`));
    for (const p of posts) await ok(call(fan, 'PUT', `/api/posts/${p.id}/like`));
    const { notifications, unread } = await notifs(author);
    expect(notifications).toHaveLength(50);
    expect(unread).toBe(50);
    const kept = new Set(notifications.map((n) => n.data.postId));
    expect(kept.has(posts[0].id)).toBe(false);
    expect(kept.has(posts[54].id)).toBe(true);
    const [{ n }] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [author.id]);
    expect(n).toBe(50);
  });

  it('lecture : une notification, puis tout marquer comme lu', async () => {
    const a = await user('Auteur');
    const b = await user('Paul');
    const c = await user('Lea');
    await follow(b, a);
    await follow(c, a);
    const list = await notifs(a);
    expect(list.unread).toBe(2);
    await ok(call(a, 'POST', `/api/notifications/${list.notifications[0].id}/read`));
    expect((await notifs(a)).unread).toBe(1);
    await ok(call(a, 'POST', '/api/notifications/read-all'));
    expect((await notifs(a)).unread).toBe(0);
  });

  it('temps réel : le client reçoit le signal avec le nombre de non lues', async () => {
    const a = await user('Auteur');
    const b = await user('Paul');
    const from = a.ws.messages.length;
    await follow(b, a);
    const m = await a.ws.waitFor((x) => x.type === 'notification', 2000, from);
    expect(m.type === 'notification' && m.unread).toBe(1);
  });
});

describe('notifications d’abonnement', () => {
  it('demande reçue, demande acceptée ; rien au refus ni au retrait', async () => {
    const owner = await user('Privee');
    const fan = await user('Fan');
    const other = await user('Autre');
    await ok(call(owner, 'PATCH', '/api/me/profile', { isPrivate: true }));
    await follow(fan, owner);
    await follow(other, owner);
    expect((await notifs(owner)).notifications.map((n) => n.type)).toEqual(['follow_request', 'follow_request']);

    await ok(call(owner, 'POST', `/api/me/follow-requests/${fan.id}/accept`));
    await ok(call(owner, 'POST', `/api/me/follow-requests/${other.id}/decline`));
    // La demande traitée disparaît du centre du propriétaire.
    expect((await notifs(owner)).notifications).toHaveLength(0);
    expect((await notifs(fan)).notifications.map((n) => n.type)).toEqual(['follow_accepted']);
    expect((await notifs(other)).notifications).toHaveLength(0);

    await ok(call(owner, 'DELETE', `/api/me/followers/${fan.id}`));
    expect((await notifs(fan)).notifications.map((n) => n.type)).toEqual(['follow_accepted']);
  });

  it('nouvel abonné d’un profil public (une seule notification même s’il se réabonne)', async () => {
    const a = await user('Public');
    const b = await user('Fan');
    await follow(b, a);
    await ok(call(b, 'DELETE', `/api/users/${a.id}/follow`));
    await follow(b, a);
    expect((await notifs(a)).notifications.filter((n) => n.type === 'new_follower')).toHaveLength(1);
  });
});

describe('défis asynchrones', () => {
  type Created = ChallengeView & { playDuelId: string | null };

  /** Joue toutes les questions d'un duel (bonnes ou mauvaises réponses) et attend sa fin. */
  async function playAll(u: U, duelId: string, pick: 'right' | 'wrong') {
    const answered = new Set<number>();
    const timer = setInterval(() => {
      const snap = u.ws.lastDuel();
      if (!snap || snap.duelId !== duelId || snap.phase !== 'answering' || answered.has(snap.index)) return;
      answered.add(snap.index);
      const correct = server.game.getDuel(duelId)!.state.questions[snap.index].correctIndex;
      u.ws.send({ type: 'answer', duelId, index: snap.index, choice: pick === 'right' ? correct : (correct + 1) % 4 });
    }, 5);
    const end = await u.ws.waitForDuel((x) => x.duelId === duelId && x.phase === 'finished', 8000, 0);
    clearInterval(timer);
    await sleep(150);
    return end;
  }

  /** A défie B et joue sa partie (manche 1). */
  async function sendAndPlay(a: U, b: U, themeId = 'geo-capitales') {
    const c = await ok(call<Created>(a, 'POST', '/api/challenges', { userId: b.id, themeId }));
    expect(c.status).toBe('sent');
    expect(c.playDuelId).toBeTruthy();
    const leg1 = await playAll(a, c.playDuelId!, 'right');
    expect(leg1.challenge).toEqual({ id: c.id, leg: 1 });
    expect(leg1.result).toBeNull();
    return c;
  }

  it('l’invitant joue d’abord ; l’ami rejoue plus tard les MÊMES questions ; récompenses pour les deux', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    expect((await call(a, 'POST', '/api/challenges', { userId: b.id, themeId: 'geo-capitales' })).status).toBe(403);
    await follow(b, a);
    const c0 = await ok(call<Created>(a, 'POST', '/api/challenges', { userId: b.id, themeId: 'geo-capitales' }));
    // Pendant que l'invitant joue, l'ami ne voit rien et n'est pas encore prévenu.
    expect((await ok(call<{ challenges: ChallengeView[] }>(b, 'GET', '/api/challenges'))).challenges).toHaveLength(0);
    expect((await notifs(b)).notifications.find((n) => n.type === 'challenge_received')).toBeUndefined();
    const questions = server.game.getDuel(c0.playDuelId!)!.state.questions.map((q) => `${q.id}:${q.choices.join('|')}`);
    await playAll(a, c0.playDuelId!, 'right');

    const pending = await ok(call<ChallengeView>(a, 'GET', `/api/challenges/${c0.id}`));
    expect(pending.status).toBe('pending');
    expect(pending.fromScore).toBeGreaterThan(0);
    expect(pending.expiresAt - pending.createdAt).toBe(24 * 3_600_000);
    const received = (await notifs(b)).notifications.find((n) => n.type === 'challenge_received')!;
    expect(received.data.challengeId).toBe(c0.id);
    // Renvoi du même défi : on retrouve celui qui existe, sans nouvelle partie.
    const again = await ok(call<Created>(a, 'POST', '/api/challenges', { userId: b.id, themeId: 'geo-capitales' }));
    expect(again.id).toBe(c0.id);
    expect(again.playDuelId).toBeNull();

    // Double clic sur « Jouer » : un seul duel. L'invitant n'a pas besoin d'être connecté.
    await a.ws.close();
    const [r1, r2] = await Promise.all([
      call<{ duelId?: string }>(b, 'POST', `/api/challenges/${c0.id}/accept`),
      call<{ duelId?: string }>(b, 'POST', `/api/challenges/${c0.id}/accept`),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 404]);
    const duelId = (r1.body.duelId ?? r2.body.duelId)!;
    const leg2 = server.game.getDuel(duelId)!;
    expect(leg2.state.questions.map((q) => `${q.id}:${q.choices.join('|')}`)).toEqual(questions);
    const end = await playAll(b, duelId, 'wrong');
    expect(end.challenge).toEqual({ id: c0.id, leg: 2 });
    expect(end.opponent.id).toBe(a.id);
    expect(end.result!.outcome).toBe('loss');
    expect(end.opponent.points).toBe(pending.fromScore);

    const done = await ok(call<ChallengeView>(b, 'GET', `/api/challenges/${c0.id}`));
    expect(done.status).toBe('completed');
    expect(done.toScore).toBe(0);
    const [{ xp }] = await db.query<{ xp: number }>('SELECT xp FROM users WHERE id = $1', [a.id]);
    // XP des duels : l'XP du compte moins les récompenses des défis du jour atteints.
    const questBonus = (await server.game.quests.list(a.id)).quests.filter((q) => q.done).reduce((t, q) => t + q.reward, 0);
    expect(xp - questBonus).toBe(pending.fromScore! + 40 + 100);
    const aTypes = (await db.query<{ type: string }>('SELECT type FROM notifications WHERE user_id = $1', [a.id])).map((r) => r.type);
    expect(aTypes).toEqual(expect.arrayContaining(['challenge_accepted', 'challenge_completed']));
  });

  it('refus : l’invitant est prévenu ; défi d’un joueur bloqué impossible', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await follow(a, b);
    const c = await sendAndPlay(a, b, 'sports-jo');
    await ok(call(b, 'POST', `/api/challenges/${c.id}/decline`));
    expect((await ok(call<ChallengeView>(a, 'GET', `/api/challenges/${c.id}`))).status).toBe('declined');
    expect((await notifs(a)).notifications.map((n) => n.type)).toContain('challenge_declined');
    await ok(call(b, 'POST', '/api/blocks', { userId: a.id }));
    expect((await call(a, 'POST', '/api/challenges', { userId: b.id, themeId: 'sports-jo' })).status).toBe(403);
  });

  it('expiré au bout de 24 h : plus possible de le relever', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await follow(a, b);
    const c = await sendAndPlay(a, b, 'sports-jo');
    await db.query("UPDATE challenges SET created_at = now() - interval '25 hours' WHERE id = $1", [c.id]);
    expect((await ok(call<ChallengeView>(b, 'GET', `/api/challenges/${c.id}`))).status).toBe('expired');
    expect((await call(b, 'POST', `/api/challenges/${c.id}/accept`)).status).toBe(404);
  });

  it('l’invitant abandonne sa propre partie : le défi est annulé, l’ami n’est pas dérangé', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    await follow(a, b);
    const c = await ok(call<Created>(a, 'POST', '/api/challenges', { userId: b.id, themeId: 'sports-jo' }));
    await a.ws.waitForDuel((x) => x.duelId === c.playDuelId && x.phase === 'reading', 3000, 0);
    a.ws.send({ type: 'forfeit', duelId: c.playDuelId! });
    await a.ws.waitForDuel((x) => x.duelId === c.playDuelId && x.phase === 'finished', 3000, 0);
    await sleep(150);
    expect((await ok(call<ChallengeView>(a, 'GET', `/api/challenges/${c.id}`))).status).toBe('cancelled');
    expect((await notifs(b)).notifications.find((n) => n.type === 'challenge_received')).toBeUndefined();
  });

  it('revanche après un duel, abandon de l’adversaire notifié', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    a.ws.send({ type: 'play', themeId: 'geo-capitales', mode: 'pvp' });
    await a.ws.waitFor((m) => m.type === 'queued');
    b.ws.send({ type: 'play', themeId: 'geo-capitales', mode: 'pvp' });
    const s = await a.ws.waitForDuel(() => true, 3000, 0);
    await a.ws.waitForDuel((x) => x.phase === 'reading', 3000, 0);
    b.ws.send({ type: 'forfeit', duelId: s.duelId });
    await a.ws.waitForDuel((x) => x.phase === 'finished' && x.result !== null, 3000, 0);
    await sleep(100);
    expect((await notifs(a)).notifications.map((n) => n.type)).toContain('opponent_forfeit');
    // Revanche sans abonnement : permise car ils viennent de s'affronter. B joue d'abord, puis A est prévenu.
    const r = await ok(call<Created>(b, 'POST', '/api/challenges', { userId: a.id, themeId: 'geo-capitales', rematchOf: s.duelId }));
    expect(r.kind).toBe('rematch');
    await playAll(b, r.playDuelId!, 'right');
    expect((await notifs(a)).notifications.map((n) => n.type)).toContain('rematch_request');
  });
});

describe('mini chat de fin de match', () => {
  it('relaie les messages entre les deux joueurs, nettoie le texte, refuse les inconnus et les bloqués', async () => {
    const a = await user('Thomas');
    const b = await user('Paul');
    const c = await user('Intrus');
    a.ws.send({ type: 'play', themeId: 'geo-capitales', mode: 'pvp' });
    await a.ws.waitFor((m) => m.type === 'queued');
    b.ws.send({ type: 'play', themeId: 'geo-capitales', mode: 'pvp' });
    const s = await a.ws.waitForDuel(() => true, 3000, 0);
    await a.ws.waitForDuel((x) => x.phase === 'reading', 3000, 0);
    b.ws.send({ type: 'forfeit', duelId: s.duelId });
    await a.ws.waitForDuel((x) => x.phase === 'finished' && x.result !== null, 3000, 0);

    a.ws.send({ type: 'duelChat', duelId: s.duelId, text: '  GG   !  ' + 'x'.repeat(300) });
    const got = await b.ws.waitFor((m) => m.type === 'duelChat');
    expect(got.type === 'duelChat' && got.messages[0].text.startsWith('GG !')).toBe(true);
    expect(got.type === 'duelChat' && got.messages[0].text.length).toBe(140);
    b.ws.send({ type: 'duelChatHistory', duelId: s.duelId });
    const history = await b.ws.waitFor((m) => m.type === 'duelChat' && m.messages.length === 1 && m.messages[0].from === a.id);
    expect(history.type).toBe('duelChat');

    // Sticker du pack : relayé seul (sans texte) ; sticker inventé : ignoré.
    a.ws.send({ type: 'duelChat', duelId: s.duelId, text: 'ignoré', stickerId: 'gg' });
    const sticker = await b.ws.waitFor((m) => m.type === 'duelChat' && m.messages.some((x) => x.stickerId === 'gg'));
    expect(sticker.type === 'duelChat' && sticker.messages[0].text).toBe('');
    a.ws.send({ type: 'duelChat', duelId: s.duelId, stickerId: 'u-' + '0'.repeat(32) });

    c.ws.send({ type: 'duelChat', duelId: s.duelId, text: 'coucou' });
    await c.ws.waitFor((m) => m.type === 'error' && m.code === 'not_in_duel');

    await ok(call(b, 'POST', '/api/blocks', { userId: a.id }));
    a.ws.send({ type: 'duelChat', duelId: s.duelId, text: 'encore' });
    await sleep(150);
    expect(server.game['chats'].get(s.duelId)).toHaveLength(2);
  });
});

describe('progression, fin de duel hors ligne, classement', () => {
  async function winAgainstBot(u: U, opts: { disconnectAfterStart?: boolean } = {}) {
    u.ws.send({ type: 'play', themeId: 'geo-capitales', mode: 'bot' });
    const s = await u.ws.waitForDuel(() => true, 3000, 0);
    if (opts.disconnectAfterStart) {
      await u.ws.close();
      await sleep(3500);
      return s.duelId;
    }
    const answered = new Set<number>();
    const timer = setInterval(() => {
      const snap = u.ws.lastDuel();
      if (!snap || snap.phase !== 'answering' || answered.has(snap.index)) return;
      answered.add(snap.index);
      const correct = server.game.getDuel(snap.duelId)!.state.questions[snap.index].correctIndex;
      u.ws.send({ type: 'answer', duelId: snap.duelId, index: snap.index, choice: correct });
    }, 5);
    await u.ws.waitForDuel((x) => x.phase === 'finished' && x.result !== null, 8000, 0);
    clearInterval(timer);
    await sleep(150);
    return s.duelId;
  }

  it('niveau global, titre et niveau de thème après un sans-faute', async () => {
    const u = await user('Champion');
    await winAgainstBot(u);
    const types = (await notifs(u)).notifications.map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['level_up', 'theme_level_up']));
  });

  it('fin d’un duel pendant que le joueur est hors de l’application', async () => {
    const u = await user('Absent');
    const duelId = await winAgainstBot(u, { disconnectAfterStart: true });
    const back = await new TestClient(server.port).connect(u.token);
    clients.push(back);
    const list = await notifs({ ...u, ws: back });
    const n = list.notifications.find((x) => x.type === 'duel_finished');
    expect(n?.data.duelId).toBe(duelId);
  });

  it('1re place du thème : le joueur est prévenu, l’ancien premier aussi', async () => {
    const leader = await user('Ancien');
    const u = await user('Nouveau');
    await db.query('INSERT INTO theme_stats (user_id, theme_id, rating) VALUES ($1, $2, $3)', [leader.id, 'geo-capitales', 1005]);
    await winAgainstBot(u);
    expect((await notifs(u)).notifications.map((n) => n.type)).toContain('rank_first');
    expect((await notifs(leader)).notifications.map((n) => n.type)).toContain('rank_lost_first');
  });
});

describe('préférences, connexions, annonces', () => {
  it('préférences : valeurs par défaut, mise à jour partielle, valeurs invalides ignorées', async () => {
    const u = await user('Moi');
    const prefs = await ok(call<NotificationPrefs>(u, 'GET', '/api/me/notification-preferences'));
    expect(prefs.friendsOnline).toBe(false);
    expect(prefs.push.challenges).toBe(true);
    const updated = await ok(
      call<NotificationPrefs>(u, 'PATCH', '/api/me/notification-preferences', { push: { community: false, inconnu: true }, friendsOnline: 'oui' }),
    );
    expect(updated.push.community).toBe(false);
    expect('inconnu' in updated.push).toBe(false);
    expect(updated.friendsOnline).toBe(false);
  });

  it('désactiver les push ne retire rien du centre', async () => {
    const a = await user('Auteur');
    const b = await user('Fan');
    await ok(call(a, 'PATCH', '/api/me/notification-preferences', { push: { follows: false } }));
    await follow(b, a);
    expect((await notifs(a)).notifications.map((n) => n.type)).toEqual(['new_follower']);
  });

  it('connexion d’une personne suivie : seulement si activé (désactivé par défaut)', async () => {
    const watcher = await user('Guetteur');
    const star = await user('Star');
    await follow(watcher, star);
    await star.ws.close();
    await sleep(50);
    const back1 = await new TestClient(server.port).connect(star.token);
    clients.push(back1);
    await sleep(100);
    expect((await notifs(watcher)).notifications.some((n) => n.type === 'friend_online')).toBe(false);
    await ok(call(watcher, 'PATCH', '/api/me/notification-preferences', { friendsOnline: true }));
    await back1.close();
    await sleep(50);
    const back2 = await new TestClient(server.port).connect(star.token);
    clients.push(back2);
    await sleep(150);
    expect((await notifs(watcher)).notifications.some((n) => n.type === 'friend_online')).toBe(true);
  });

  it('annonce officielle : réservée aux administrateurs, reçue par tous', async () => {
    const admin = await user('Equipe');
    const p1 = await user('Joueur1');
    const p2 = await user('Joueur2');
    const payload = { title: 'Maintenance ce soir', body: 'Le jeu sera indisponible de 2 h à 3 h.', kind: 'maintenance' };
    expect((await call(p1, 'POST', '/api/admin/announcements', payload)).status).toBe(403);
    await server.game.repo.setRole(admin.id, 'admin');
    const r = await ok(call<{ id: string; recipients: number }>(admin, 'POST', '/api/admin/announcements', payload));
    expect(r.recipients).toBe(3);
    for (const u of [p1, p2]) {
      const n = (await notifs(u)).notifications.find((x) => x.type === 'announcement')!;
      expect(n.data.title).toBe('Maintenance ce soir');
    }
    const full = await ok(call<{ body: string }>(p1, 'GET', `/api/announcements/${r.id}`));
    expect(full.body).toContain('2 h à 3 h');
  });
});
