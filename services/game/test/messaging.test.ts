import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConversationDetail, ConversationSummary, MessageRequestView, MessageView, NotificationView } from '@qu1z/shared';

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
  ws: TestClient;
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

const ok = async <T,>(p: Promise<{ status: number; body: T }>): Promise<T> => {
  const r = await p;
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};

async function user(pseudo: string): Promise<U> {
  const ws = await new TestClient(server.port).connect();
  clients.push(ws);
  const u = { id: ws.playerId, token: ws.token, ws };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

const requests = async (u: U) => (await ok(call<{ requests: MessageRequestView[] }>(u, 'GET', '/api/messages/requests'))).requests;
const inbox = async (u: U) => (await ok(call<{ conversations: ConversationSummary[] }>(u, 'GET', '/api/messages'))).conversations;
const open = (u: U, id: string) => ok(call<ConversationDetail>(u, 'GET', `/api/messages/${id}`));
const sendMsg = (u: U, id: string, text: string, replyToId?: string) =>
  ok(call<MessageView>(u, 'POST', `/api/messages/${id}`, { text, ...(replyToId ? { replyToId } : {}) }));

/** A envoie une demande à B, B l'accepte : renvoie l'id de la conversation. */
async function connect(a: U, b: U, first = 'Salut !'): Promise<string> {
  await ok(call(a, 'POST', '/api/messages/requests', { userId: b.id, text: first }));
  const [r] = await requests(b);
  return (await ok(call<{ conversationId: string }>(b, 'POST', `/api/messages/requests/${r.id}/accept`))).conversationId;
}

describe('demandes de message', () => {
  it('demande avec premier message, rien d’autre avant acceptation, conversation ouverte ensuite', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    expect(await ok(call(a, 'POST', '/api/messages/requests', { userId: b.id, text: 'Bonjour, partie ?' }))).toEqual({ status: 'requested' });
    const [r] = await requests(b);
    expect(r).toMatchObject({ incoming: true, firstMessage: 'Bonjour, partie ?' });
    expect(r.from.pseudo).toBe('Alice');
    // Avant acceptation : pas de nouvelle demande, pas de conversation.
    expect((await call(a, 'POST', '/api/messages/requests', { userId: b.id, text: 'Tu es là ?' })).status).toBe(409);
    expect(await inbox(a)).toEqual([]);
    const { conversationId } = await ok(call<{ conversationId: string }>(b, 'POST', `/api/messages/requests/${r.id}/accept`));
    const detail = await open(b, conversationId);
    expect(detail.messages.map((m) => m.text)).toEqual(['Bonjour, partie ?']);
    expect((await inbox(a)).map((c) => c.other?.pseudo)).toEqual(['Bruno']);
    // Conversation existante : une nouvelle demande renvoie vers elle.
    expect(await ok(call(a, 'POST', '/api/messages/requests', { userId: b.id }))).toEqual({ status: 'exists', conversationId });
  });

  it('refus silencieux ; au plus 3 demandes vers la même personne en 30 jours', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    for (let i = 0; i < 3; i++) {
      await ok(call(a, 'POST', '/api/messages/requests', { userId: b.id, text: `Essai ${i}` }));
      const [r] = await requests(b);
      await ok(call(b, 'POST', `/api/messages/requests/${r.id}/decline`));
    }
    expect(await requests(a)).toEqual([]);
    const notifs = await ok(call<{ notifications: NotificationView[] }>(a, 'GET', '/api/notifications'));
    expect(notifs.notifications).toEqual([]);
    expect((await call(a, 'POST', '/api/messages/requests', { userId: b.id, text: 'Encore' })).status).toBe(429);
  });
});

describe('conversation', () => {
  it('statuts Envoyé puis Lu ; non-lus par conversation', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const id = await connect(a, b);
    const m = await sendMsg(a, id, 'Ça va ?');
    expect(m.status).toBe('sent');
    expect((await inbox(b))[0].unread).toBe(2);
    await ok(call(b, 'POST', `/api/messages/${id}/read`));
    expect((await inbox(b))[0].unread).toBe(0);
    const forA = await open(a, id);
    expect(forA.messages.at(-1)).toMatchObject({ text: 'Ça va ?', status: 'read' });
    expect(forA.messages[0].status).toBe('read');
    const forB = await open(b, id);
    expect(forB.messages.every((x) => x.status === null)).toBe(true);
  });

  it('réponse à un message précis (aperçu de l’original), refusée vers une autre conversation', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const c = await user('Chloe');
    const ab = await connect(a, b, 'Question : Lyon ou Paris ?');
    const ac = await connect(a, c, 'Coucou');
    const first = (await open(b, ab)).messages[0];
    const reply = await sendMsg(b, ab, 'Lyon !', first.id);
    expect(reply.replyTo).toMatchObject({ id: first.id, senderPseudo: 'Alice', text: 'Question : Lyon ou Paris ?' });
    const other = (await open(a, ac)).messages[0];
    expect((await call(b, 'POST', `/api/messages/${ab}`, { text: 'x', replyToId: other.id })).status).toBe(400);
  });

  it('réactions : ajouter, changer, retirer ; visibles par les participants', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const id = await connect(a, b);
    const [msg] = (await open(a, id)).messages;
    await ok(call(a, 'PUT', `/api/messages/reactions/${msg.id}`, { emoji: '👍' }));
    await ok(call(b, 'PUT', `/api/messages/reactions/${msg.id}`, { emoji: '👍' }));
    await ok(call(b, 'PUT', `/api/messages/reactions/${msg.id}`, { emoji: '🔥' }));
    let seen = (await open(b, id)).messages[0].reactions;
    expect(seen).toEqual([
      { emoji: '👍', userIds: [a.id] },
      { emoji: '🔥', userIds: [b.id] },
    ]);
    await ok(call(a, 'DELETE', `/api/messages/reactions/${msg.id}`));
    seen = (await open(a, id)).messages[0].reactions;
    expect(seen).toEqual([{ emoji: '🔥', userIds: [b.id] }]);
    expect((await call(a, 'PUT', `/api/messages/reactions/${msg.id}`, { emoji: 'abc' })).status).toBe(400);
  });

  it('épingler : en tête de la boîte ; supprimer de MA boîte seulement, retour avec un nouveau message', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const c = await user('Chloe');
    const ab = await connect(a, b);
    const ac = await connect(a, c);
    await sendMsg(c, ac, 'Plus récent');
    expect((await inbox(a)).map((x) => x.id)).toEqual([ac, ab]);
    await ok(call(a, 'PUT', `/api/messages/${ab}/pin`));
    expect((await inbox(a)).map((x) => [x.id, x.pinned])).toEqual([
      [ab, true],
      [ac, false],
    ]);

    await ok(call(a, 'DELETE', `/api/messages/${ab}`));
    expect((await inbox(a)).map((x) => x.id)).toEqual([ac]);
    expect((await inbox(b)).map((x) => x.id)).toEqual([ab]);
    await sendMsg(b, ab, 'Nouveau message');
    const back = await inbox(a);
    expect(back.map((x) => x.id)).toContain(ab);
    expect((await open(a, ab)).messages.map((m) => m.text)).toEqual(['Nouveau message']);
  });

  it('aucun moyen de modifier ou supprimer un message envoyé', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const id = await connect(a, b);
    const m = await sendMsg(a, id, 'Message définitif');
    expect((await call(a, 'PATCH', `/api/messages/${id}`, { text: 'modifié' })).status).toBe(404);
    expect((await call(a, 'DELETE', `/api/messages/${m.id}`)).status).toBe(404);
    expect((await open(b, id)).messages.map((x) => x.text)).toContain('Message définitif');
  });

  it('les messages n’arrivent jamais dans le centre de notifications ; signal temps réel séparé', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const id = await connect(a, b);
    const from = b.ws.messages.length;
    await sendMsg(a, id, 'Hop');
    const m = await b.ws.waitFor((x) => x.type === 'messages', 2000, from);
    expect(m.type === 'messages' && m.conversationId).toBe(id);
    const notifs = await ok(call<{ notifications: NotificationView[] }>(b, 'GET', '/api/notifications'));
    expect(notifs.notifications).toEqual([]);
  });

  it('un non-membre ne peut ni lire ni écrire', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const intrus = await user('Intrus');
    const id = await connect(a, b);
    expect((await call(intrus, 'GET', `/api/messages/${id}`)).status).toBe(404);
    expect((await call(intrus, 'POST', `/api/messages/${id}`, { text: 'Coucou' })).status).toBe(404);
  });
});

describe('présence', () => {
  it('visible seulement en cas d’abonnement réciproque (pas grâce à la conversation)', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const id = await connect(a, b);
    expect((await open(a, id)).conversation.presence).toBeNull();
    await ok(call(a, 'POST', `/api/users/${b.id}/follow`));
    expect((await open(a, id)).conversation.presence).toBeNull();
    await ok(call(b, 'POST', `/api/users/${a.id}/follow`));
    expect((await open(a, id)).conversation.presence).toMatchObject({ online: true });
    await b.ws.close();
    await sleep(100);
    const p = (await open(a, id)).conversation.presence!;
    expect(p.online).toBe(false);
    expect(p.lastSeenAt).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe('blocage', () => {
  it('conversation supprimée des deux côtés, plus aucun message ni demande ; preuves conservées ; non restaurée au déblocage', async () => {
    const a = await user('Alice');
    const b = await user('Bruno');
    const id = await connect(a, b);
    await sendMsg(b, id, 'Message à conserver');
    await ok(call(a, 'POST', '/api/blocks', { userId: b.id }));
    expect(await inbox(a)).toEqual([]);
    expect(await inbox(b)).toEqual([]);
    expect((await call(b, 'POST', `/api/messages/${id}`, { text: 'Tu es là ?' })).status).toBe(404);
    expect((await call(b, 'POST', '/api/messages/requests', { userId: a.id, text: 'Pardon' })).status).toBe(403);
    // Les messages restent en base pour une éventuelle enquête de modération.
    const kept = await db.query<{ text: string }>('SELECT text FROM messages WHERE conversation_id = $1', [id]);
    expect(kept.map((k) => k.text)).toContain('Message à conserver');

    await ok(call(a, 'DELETE', `/api/blocks/${b.id}`));
    expect(await inbox(a)).toEqual([]);
    expect(await ok(call(b, 'POST', '/api/messages/requests', { userId: a.id, text: 'On recommence ?' }))).toEqual({ status: 'requested' });
  });
});
