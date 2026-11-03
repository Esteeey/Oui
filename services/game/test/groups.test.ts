import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConversationDetail, ConversationSummary, GroupDetail, GroupInvitationView, MediaView, MessageView } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { MemoryStore } from '../src/media';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient } from './helpers';

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
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300, mediaStore: new MemoryStore(), gifs: null });
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
const status = async (p: Promise<{ status: number; body: unknown }>) => (await p).status;
const error = async (p: Promise<{ status: number; body: unknown }>) => {
  const r = await p;
  return `${r.status} ${(r.body as { error?: string }).error}`;
};

async function user(pseudo: string): Promise<U> {
  const ws = await new TestClient(server.port).connect();
  clients.push(ws);
  const u = { id: ws.playerId, token: ws.token, ws };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

const invitations = async (u: U) => (await ok(call<{ invitations: GroupInvitationView[] }>(u, 'GET', '/api/groups/invitations'))).invitations;
const inbox = async (u: U) => (await ok(call<{ conversations: ConversationSummary[] }>(u, 'GET', '/api/messages'))).conversations;
const open = (u: U, id: string) => ok(call<ConversationDetail>(u, 'GET', `/api/messages/${id}`));
const detail = (u: U, id: string) => ok(call<GroupDetail>(u, 'GET', `/api/groups/${id}`));
const say = (u: U, id: string, text: string) => ok(call<MessageView>(u, 'POST', `/api/messages/${id}`, { text }));

/** Crée un groupe et y fait entrer `members` (invitation + acceptation). */
async function group(creator: U, members: U[], name = 'Les Cracks'): Promise<string> {
  const { conversationId } = await ok(call<{ conversationId: string }>(creator, 'POST', '/api/groups', { name, userIds: members.map((m) => m.id) }));
  for (const m of members) {
    const inv = (await invitations(m)).find((i) => i.group.id === conversationId)!;
    await ok(call(m, 'POST', `/api/groups/invitations/${inv.id}/accept`));
  }
  return conversationId;
}

const systemTexts = async (u: U, id: string) => (await open(u, id)).messages.filter((m) => m.kind === 'system').map((m) => m.text);

describe('M6 : création, invitations, historique', () => {
  it('on ne rejoint que sur invitation acceptée ; un nouveau membre voit tout l’historique', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const { conversationId: id } = await ok(call<{ conversationId: string; invited: number }>(ana, 'POST', '/api/groups', { name: '  Quiz   du soir ', userIds: [bob.id] }));
    await say(ana, id, 'Bienvenue !');

    // Bob est invité mais n'est pas membre tant qu'il n'a pas accepté.
    expect(await status(call(bob, 'GET', `/api/messages/${id}`))).toBe(404);
    const [inv] = await invitations(bob);
    expect(inv.group).toMatchObject({ name: 'Quiz du soir', memberCount: 1 });
    expect(inv.inviter.pseudo).toBe('Ana');
    // L'invitation arrive dans la messagerie, pas dans la cloche.
    expect((await ok(call<{ notifications: unknown[] }>(bob, 'GET', '/api/notifications'))).notifications).toHaveLength(0);

    await ok(call(bob, 'POST', `/api/groups/invitations/${inv.id}/accept`));
    const conv = await open(bob, id);
    expect(conv.messages.map((m) => m.text)).toEqual(['Ana a créé le groupe « Quiz du soir »', 'Bienvenue !', 'Bob a rejoint le groupe']);
    expect(conv.conversation.group).toMatchObject({ name: 'Quiz du soir', memberCount: 2, myRole: 'member' });
    // Les messages d'avant son arrivée sont visibles mais ne comptent pas comme non lus.
    expect((await inbox(bob)).find((c) => c.id === id)?.unread).toBe(0);
    // Dans un groupe, chaque message porte son auteur.
    expect(conv.messages[1].sender?.pseudo).toBe('Ana');

    // Cle, jamais invitée, ne voit rien.
    expect(await status(call(cle, 'GET', `/api/messages/${id}`))).toBe(404);
    expect(await status(call(cle, 'GET', `/api/groups/${id}`))).toBe(404);
    expect(await status(call(cle, 'POST', `/api/messages/${id}`, { text: 'coucou' }))).toBe(404);
  });

  it('refuser une invitation ne fait rien rejoindre ; doublons et membres déjà présents refusés', async () => {
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    const { conversationId: id } = await ok(call<{ conversationId: string }>(ana, 'POST', '/api/groups', { name: 'G', userIds: [bob.id] }));
    expect(await error(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: bob.id }))).toBe('409 already_invited');
    const [inv] = await invitations(bob);
    await ok(call(bob, 'POST', `/api/groups/invitations/${inv.id}/decline`));
    expect(await invitations(bob)).toHaveLength(0);
    expect((await detail(ana, id)).members).toHaveLength(1);
    await ok(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: bob.id }));
    await ok(call(bob, 'POST', `/api/groups/invitations/${(await invitations(bob))[0].id}/accept`));
    expect(await error(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: bob.id }))).toBe('409 already_member');
    expect(await status(call(ana, 'POST', '/api/groups', { name: '' }))).toBe(400);
    expect(await status(call(ana, 'POST', '/api/groups', { name: 'x'.repeat(51) }))).toBe(400);
  });

  it('une invitation ne contourne jamais un blocage', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await group(ana, []);
    await ok(call(bob, 'POST', '/api/blocks', { userId: ana.id }));
    expect(await error(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: bob.id }))).toBe('403 blocked');
    // Création avec un joueur bloqué : il est ignoré sans erreur.
    const { invited } = await ok(call<{ invited: number }>(ana, 'POST', '/api/groups', { name: 'G2', userIds: [bob.id, cle.id] }));
    expect(invited).toBe(1);
    // Blocage après l'invitation : elle disparaît et ne peut plus être acceptée.
    await ok(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: cle.id }));
    const [inv] = (await invitations(cle)).filter((i) => i.group.id === id);
    await ok(call(cle, 'POST', '/api/blocks', { userId: ana.id }));
    expect((await invitations(cle)).length).toBe(0);
    expect(await status(call(cle, 'POST', `/api/groups/invitations/${inv.id}/accept`))).toBe(404);
  });
});

describe('M6 : rôles', () => {
  it('membre, administrateur et créateur ont chacun leurs droits', async () => {
    const [ana, bob, cle, dan, eve] = [await user('Ana'), await user('Bob'), await user('Cle'), await user('Dan'), await user('Eve')];
    const id = await group(ana, [bob, cle, dan]);
    // Un membre ne gère pas les adhésions, n'épingle pas, ne renomme pas.
    expect(await status(call(bob, 'POST', `/api/groups/${id}/invitations`, { userId: eve.id }))).toBe(403);
    expect(await status(call(bob, 'DELETE', `/api/groups/${id}/members/${cle.id}`))).toBe(403);
    expect(await status(call(bob, 'PATCH', `/api/groups/${id}`, { name: 'Pirates' }))).toBe(403);

    // Le créateur nomme Bob administrateur (message système).
    await ok(call(ana, 'PUT', `/api/groups/${id}/members/${bob.id}/role`, { role: 'admin' }));
    expect(await systemTexts(cle, id)).toContain('Bob a été nommé administrateur');
    // Un administrateur ne nomme pas d'administrateur et ne transfère pas le groupe.
    expect(await status(call(bob, 'PUT', `/api/groups/${id}/members/${cle.id}/role`, { role: 'admin' }))).toBe(403);
    expect(await status(call(bob, 'POST', `/api/groups/${id}/transfer`, { userId: cle.id }))).toBe(403);
    expect(await status(call(bob, 'DELETE', `/api/groups/${id}`, { confirm: true }))).toBe(403);

    // L'administrateur invite et retire des membres simples…
    await ok(call(bob, 'POST', `/api/groups/${id}/invitations`, { userId: eve.id }));
    await ok(call(bob, 'DELETE', `/api/groups/${id}/members/${dan.id}`));
    expect(await systemTexts(cle, id)).toContain('Dan a été retiré du groupe');
    expect(await status(call(dan, 'GET', `/api/messages/${id}`))).toBe(404);
    // …mais pas un autre administrateur, ni le créateur.
    await ok(call(ana, 'PUT', `/api/groups/${id}/members/${cle.id}/role`, { role: 'admin' }));
    expect(await status(call(bob, 'DELETE', `/api/groups/${id}/members/${cle.id}`))).toBe(403);
    expect(await status(call(bob, 'DELETE', `/api/groups/${id}/members/${ana.id}`))).toBe(403);
    // Le créateur retire les droits d'administrateur.
    await ok(call(ana, 'PUT', `/api/groups/${id}/members/${cle.id}/role`, { role: 'member' }));
    const d = await detail(cle, id);
    expect(d.members.map((m) => [m.user.pseudo, m.role])).toEqual([
      ['Ana', 'creator'],
      ['Bob', 'admin'],
      ['Cle', 'member'],
    ]);
    // Les invitations en attente ne sont visibles que des gestionnaires.
    expect(d.invitations).toHaveLength(0);
    expect((await detail(bob, id)).invitations.map((i) => i.invitee.pseudo)).toEqual(['Eve']);
  });

  it('le créateur ne part qu’après avoir transféré son rôle ; l’ancien créateur devient membre', async () => {
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    const solo = await group(ana, [], 'Solo');
    expect(await error(call(ana, 'POST', `/api/groups/${solo}/leave`))).toBe('409 last_member');
    const id = await group(ana, [bob]);
    expect(await error(call(ana, 'POST', `/api/groups/${id}/leave`))).toBe('409 transfer_required');
    await ok(call(ana, 'POST', `/api/groups/${id}/transfer`, { userId: bob.id }));
    expect((await detail(ana, id)).myRole).toBe('member');
    expect((await detail(bob, id)).myRole).toBe('creator');
    expect(await systemTexts(bob, id)).toContain('Bob est maintenant le créateur du groupe');
    await ok(call(ana, 'POST', `/api/groups/${id}/leave`));
    expect(await systemTexts(bob, id)).toContain('Ana a quitté le groupe');
    expect((await inbox(ana)).some((c) => c.id === id)).toBe(false);
    expect(await status(call(ana, 'GET', `/api/messages/${id}`))).toBe(404);
  });
});

describe('M6 : exclusions et suppression', () => {
  it('exclusion temporaire ou définitive : pas de réinvitation avant la levée', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await group(ana, [bob, cle]);
    await ok(call(ana, 'POST', `/api/groups/${id}/exclusions`, { userId: bob.id, hours: 24, reason: 'spam' }));
    expect(await systemTexts(cle, id)).toContain('Bob a été exclu du groupe');
    expect(await status(call(bob, 'GET', `/api/messages/${id}`))).toBe(404);
    expect(await error(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: bob.id }))).toBe('403 excluded');
    const ex = (await detail(ana, id)).exclusions;
    expect(ex[0].user.pseudo).toBe('Bob');
    expect(ex[0].until).toBeGreaterThan(Date.now() + 23 * 3600_000);

    // Exclusion définitive (sans durée) ; levée par le créateur.
    await ok(call(ana, 'POST', `/api/groups/${id}/exclusions`, { userId: cle.id, hours: null }));
    expect((await detail(ana, id)).exclusions.find((e) => e.user.id === cle.id)?.until).toBeNull();
    await ok(call(ana, 'DELETE', `/api/groups/${id}/exclusions/${cle.id}`));
    await ok(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: cle.id }));

    // Une exclusion expirée n'empêche plus l'invitation.
    await db.query("UPDATE group_exclusions SET until = now() - interval '1 minute' WHERE user_id = $1", [bob.id]);
    await ok(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: bob.id }));
    // Une exclusion de groupe n'est pas un bannissement : Bob joue et écrit ailleurs.
    expect((await ok(call<{ status: string }>(bob, 'GET', '/api/me'))).status).toBe('active');
  });

  it('seul le créateur supprime le groupe, avec confirmation ; tous perdent l’accès', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await group(ana, [bob]);
    await ok(call(ana, 'POST', `/api/groups/${id}/invitations`, { userId: cle.id }));
    await say(bob, id, 'Preuve');
    expect(await error(call(ana, 'DELETE', `/api/groups/${id}`))).toBe('400 confirmation_required');
    const before = bob.ws.messages.length;
    await ok(call(ana, 'DELETE', `/api/groups/${id}`, { confirm: true }));
    await bob.ws.waitFor((m) => m.type === 'messages', 2000, before);
    for (const u of [ana, bob]) {
      expect(await status(call(u, 'GET', `/api/messages/${id}`))).toBe(404);
      expect((await inbox(u)).some((c) => c.id === id)).toBe(false);
    }
    expect(await invitations(cle)).toHaveLength(0);
    // Les messages restent en base pour la modération.
    expect((await db.query('SELECT 1 FROM messages WHERE conversation_id = $1 AND text = $2', [id, 'Preuve'])).length).toBe(1);
  });
});

describe('M6 : conversation de groupe', () => {
  it('messages épinglés : plusieurs, par le créateur et les administrateurs, visibles de tous', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await group(ana, [bob, cle]);
    const m1 = await say(bob, id, 'Règle 1 : pas de triche');
    const m2 = await say(cle, id, 'Rendez-vous à 21 h');
    expect(await status(call(cle, 'PUT', `/api/groups/pins/${m1.id}`))).toBe(403);
    await ok(call(ana, 'PUT', `/api/groups/pins/${m1.id}`));
    await ok(call(ana, 'PUT', `/api/groups/${id}/members/${bob.id}/role`, { role: 'admin' }));
    await ok(call(bob, 'PUT', `/api/groups/pins/${m2.id}`));
    expect((await open(cle, id)).pinned.map((p) => p.text)).toEqual(['Rendez-vous à 21 h', 'Règle 1 : pas de triche']);
    await ok(call(bob, 'DELETE', `/api/groups/pins/${m1.id}`));
    expect((await open(cle, id)).pinned.map((p) => p.messageId)).toEqual([m2.id]);
    // Un message système ne s'épingle pas.
    const sys = (await open(ana, id)).messages.find((m) => m.kind === 'system')!;
    expect(await status(call(ana, 'PUT', `/api/groups/pins/${sys.id}`))).toBe(400);
  });

  it('réponses et réactions ; aucun message ne peut être modifié ni supprimé par son auteur', async () => {
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    const id = await group(ana, [bob]);
    const m = await say(ana, id, 'Qui joue ?');
    const r = await ok(call<MessageView>(bob, 'POST', `/api/messages/${id}`, { text: 'Moi !', replyToId: m.id }));
    expect(r.replyTo?.text).toBe('Qui joue ?');
    await ok(call(bob, 'PUT', `/api/messages/reactions/${m.id}`, { emoji: '🔥' }));
    expect((await open(ana, id)).messages.find((x) => x.id === m.id)?.reactions).toEqual([{ emoji: '🔥', userIds: [bob.id] }]);
    // Aucune route de modification ou de suppression d'un message.
    expect(await status(call(ana, 'PATCH', `/api/messages/${id}/${m.id}`, { text: 'modifié' }))).toBe(404);
    expect(await status(call(ana, 'DELETE', `/api/messages/${id}/${m.id}`))).toBe(404);
  });

  it('un joueur bloqué reste dans le groupe mais ses messages me sont masqués', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await group(ana, [bob, cle]);
    await ok(call(cle, 'POST', '/api/blocks', { userId: bob.id }));
    await say(bob, id, 'Message de Bob');
    await say(ana, id, 'Message d’Ana');
    const seen = (await open(cle, id)).messages.map((m) => m.text);
    expect(seen).toContain('Message d’Ana');
    expect(seen).not.toContain('Message de Bob');
    expect((await inbox(cle)).find((c) => c.id === id)?.unread).toBe(1);
    // Ana voit tout, Bob peut toujours écrire dans le groupe.
    expect((await open(ana, id)).messages.map((m) => m.text)).toContain('Message de Bob');
    expect((await detail(cle, id)).members.find((m) => m.user.id === bob.id)?.blockedByMe).toBe(true);
  });

  it('nom et photo du groupe : modifiables par les gestionnaires, avec message système', async () => {
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    const id = await group(ana, [bob]);
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#2BD9C5' } }).png().toBuffer();
    const res = await fetch(`http://localhost:${server.port}/api/media?purpose=group`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ana.token}`, 'content-type': 'image/png' },
      body: new Uint8Array(png),
    });
    const media = (await res.json()) as MediaView;
    expect([media.width, media.height]).toEqual([512, 512]);
    await ok(call(ana, 'PATCH', `/api/groups/${id}`, { name: 'Les Génies', avatarMediaId: media.id }));
    const summary = (await inbox(bob)).find((c) => c.id === id)!;
    expect(summary.group).toMatchObject({ name: 'Les Génies', avatar: media.url, memberCount: 2, myRole: 'member' });
    expect(await systemTexts(bob, id)).toEqual(expect.arrayContaining(['Ana a renommé le groupe « Les Génies »', 'Ana a changé la photo du groupe']));
  });

  it('le statut « Lu » attend que tous les membres aient lu', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await group(ana, [bob, cle]);
    const m = await say(ana, id, 'Prêts ?');
    await ok(call(bob, 'POST', `/api/messages/${id}/read`));
    expect((await open(ana, id)).messages.find((x) => x.id === m.id)?.status).toBe('sent');
    await ok(call(cle, 'POST', `/api/messages/${id}/read`));
    expect((await open(ana, id)).messages.find((x) => x.id === m.id)?.status).toBe('read');
  });
});
