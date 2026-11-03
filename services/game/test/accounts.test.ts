import { afterEach, describe, expect, it } from 'vitest';

import type { GroupInvitationView, MessageRequestView, PostView } from '@qu1z/shared';

import { MemoryEmailSender } from '../src/accounts';
import { openDatabase, type Database } from '../src/db/database';
import { MemoryStore } from '../src/media';
import { MemoryPushSender } from '../src/push';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient, register, sleep } from './helpers';

let server: GameServer;
let db: Database;
let mail: MemoryEmailSender;
let pushes: MemoryPushSender;
const clients: TestClient[] = [];

interface U {
  id: string;
  token: string;
  ws: TestClient;
}

async function boot(requireVerifiedEmail = false) {
  db = await openDatabase();
  mail = new MemoryEmailSender();
  pushes = new MemoryPushSender();
  server = await startServer(0, {
    repo: new Repo(db),
    timing: FAST,
    matchTimeoutMs: 300,
    mediaStore: new MemoryStore(),
    gifs: null,
    email: mail,
    pushSender: pushes,
    requireVerifiedEmail,
  });
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close();
  await db.close();
});

async function call<T = Record<string, unknown>>(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}
const ok = async <T,>(p: Promise<{ status: number; body: T }>): Promise<T> => {
  const r = await p;
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};
const error = async (p: Promise<{ status: number; body: unknown }>) => {
  const r = await p;
  return `${r.status} ${(r.body as { error?: string }).error}`;
};

async function user(pseudo: string, token?: string): Promise<U> {
  const ws = await new TestClient(server.port).connect(token);
  clients.push(ws);
  const u = { id: ws.playerId, token: ws.token, ws };
  if (!token) await ok(call(u.token, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

const lastCode = () => mail.sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];

/** Ajoute et vérifie une adresse e-mail. */
async function verifyEmail(u: U, email: string) {
  await ok(call(u.token, 'POST', '/api/auth/email/start', { email }));
  return ok(call<{ result: string; token?: string }>(u.token, 'POST', '/api/auth/email/verify', { email, code: lastCode() }));
}

/** Coupe toutes les connexions temps réel d'un joueur (il est « hors de l'application »). */
async function goOffline(u: U) {
  await u.ws.close();
  await sleep(150);
}

describe('M8 : comptes e-mail', () => {
  it('vérifie une adresse avec un code à 6 chiffres (lien magique inclus)', async () => {
    await boot();
    const ana = await user('Ana');
    expect(await ok(call(ana.token, 'GET', '/api/me/account'))).toMatchObject({ emailVerified: false, emailRequired: false });
    await ok(call(ana.token, 'POST', '/api/auth/email/start', { email: '  Ana@Example.com ' }));
    const sent = mail.sent[0];
    expect(sent.to).toBe('ana@example.com');
    expect(sent.subject).toBe('Confirme ton adresse e-mail Qu1z');
    expect(sent.text).toContain(`/account?email=ana%40example.com&code=${lastCode()}`);
    expect(await ok(call(ana.token, 'POST', '/api/auth/email/verify', { email: 'ana@example.com', code: lastCode() }))).toEqual({ result: 'linked' });
    expect(await ok(call(ana.token, 'GET', '/api/me/account'))).toMatchObject({ email: 'ana@example.com', emailVerified: true });
    // Code à usage unique.
    expect(await error(call(ana.token, 'POST', '/api/auth/email/verify', { email: 'ana@example.com', code: lastCode() }))).toBe('400 invalid_code');
    expect(await error(call(ana.token, 'POST', '/api/auth/email/start', { email: 'ana@example.com' }))).toBe('409 already_verified');
    expect(await error(call(ana.token, 'POST', '/api/auth/email/start', { email: 'pas-un-email' }))).toBe('400 invalid_email');
  });

  it('5 essais au plus, puis le code est grillé ; envois limités', async () => {
    await boot();
    const ana = await user('Ana');
    await ok(call(ana.token, 'POST', '/api/auth/email/start', { email: 'ana@example.com' }));
    const good = lastCode();
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect(await error(call(ana.token, 'POST', '/api/auth/email/verify', { email: 'ana@example.com', code: wrong }))).toBe('400 invalid_code');
    expect(await error(call(ana.token, 'POST', '/api/auth/email/verify', { email: 'ana@example.com', code: good }))).toBe('400 invalid_code');
    for (let i = 0; i < 4; i++) await ok(call(ana.token, 'POST', '/api/auth/email/start', { email: 'ana@example.com' }));
    expect(await error(call(ana.token, 'POST', '/api/auth/email/start', { email: 'ana@example.com' }))).toBe('429 rate_limited');
  });

  it('se connecter sur un nouvel appareil : même compte, plusieurs sessions ; déconnexion', async () => {
    await boot();
    const ana = await user('Ana');
    await verifyEmail(ana, 'ana@example.com');
    // Nouvel appareil : un autre compte demande un code pour la même adresse.
    const phone = await user('Temp1');
    await ok(call(phone.token, 'POST', '/api/auth/email/start', { email: 'ana@example.com' }));
    expect(mail.sent.at(-1)!.subject).toBe('Ton code de connexion Qu1z');
    const r = await ok(call<{ result: string; token: string; userId: string }>(phone.token, 'POST', '/api/auth/email/verify', { email: 'ana@example.com', code: lastCode() }));
    expect(r).toMatchObject({ result: 'login', userId: ana.id });
    const onPhone = await user('', r.token);
    expect(onPhone.id).toBe(ana.id);
    // Les deux appareils restent connectés au même compte.
    expect((await ok(call<{ profile: { id: string } }>(ana.token, 'GET', '/api/me'))).profile.id).toBe(ana.id);
    // Déconnexion du téléphone : son jeton ne marche plus, l'autre appareil reste connecté.
    await ok(call(r.token, 'POST', '/api/auth/logout', {}));
    expect((await call(r.token, 'GET', '/api/me')).status).toBe(401);
    expect((await call(ana.token, 'GET', '/api/me')).status).toBe(200);
    // Un compte avec mot de passe peut toujours se déconnecter : il se reconnecte avec.
    const other = await user('Autre');
    await ok(call(other.token, 'POST', '/api/auth/logout', {}));
  });

  it('inscription et connexion par e-mail et mot de passe ; aucun compte sans connexion', async () => {
    await boot();
    const post = (path: string, body: unknown) => call('', 'POST', path, body);
    const ana = await register(server.port, { email: 'Ana@Example.com', pseudo: 'Ana', password: 'secret-ana' });
    expect((await ok(call<{ profile: { name: string } }>(ana.token, 'GET', '/api/me'))).profile.name).toBe('Ana');
    // Adresse, pseudo et mot de passe validés ; doublons refusés (sans tenir compte des majuscules).
    expect(await error(post('/api/auth/register', { email: 'ana@example.com', pseudo: 'Bob', password: 'secret-bob' }))).toBe('409 email_taken');
    expect(await error(post('/api/auth/register', { email: 'bob@example.com', pseudo: 'ANA', password: 'secret-bob' }))).toBe('409 pseudo_taken');
    expect(await error(post('/api/auth/register', { email: 'bob@example.com', pseudo: 'Bob', password: 'court' }))).toBe('400 weak_password');
    expect(await error(post('/api/auth/register', { email: 'bob', pseudo: 'Bob', password: 'secret-bob' }))).toBe('400 invalid_email');
    expect(await error(post('/api/auth/register', { email: 'bob@example.com', pseudo: 'B', password: 'secret-bob' }))).toBe('400 invalid_pseudo');
    // Connexion : nouveau jeton pour le même compte ; mauvais mot de passe ou adresse inconnue refusés pareil.
    const login = await ok(post('/api/auth/login', { email: ' ANA@example.com', password: 'secret-ana' }));
    expect(login).toMatchObject({ userId: ana.userId });
    expect(await error(post('/api/auth/login', { email: 'ana@example.com', password: 'mauvais-mdp' }))).toBe('401 invalid_credentials');
    expect(await error(post('/api/auth/login', { email: 'personne@example.com', password: 'secret-ana' }))).toBe('401 invalid_credentials');
    // Le temps réel exige un compte : sans jeton (ou avec un faux), aucun joueur n'est créé.
    for (const token of [undefined, 'faux-jeton']) {
      const ws = new TestClient(server.port);
      await expect(ws.connect(token ?? '')).rejects.toThrow();
      expect(ws.messages.find((m) => m.type === 'error')).toMatchObject({ code: 'unauthenticated' });
      clients.push(ws);
    }
    expect((await db.query('SELECT count(*)::int AS n FROM users'))[0]).toEqual({ n: 1 });
  });

  it('adresse bannie : impossible de recréer un compte avec ; débloquée si l’appel est accepté', async () => {
    await boot();
    const [bob, mod] = [await user('Bob'), await user('Modo')];
    await server.game.repo.setRole(mod.id, 'moderator');
    await verifyEmail(bob, 'bob@example.com');
    const { id: sanctionId } = await ok(call<{ id: string }>(mod.token, 'POST', '/api/mod/sanctions', { userId: bob.id, level: 'ban', reason: 'Triche' }));
    const fresh = await user('Nouveau');
    expect(await error(call(fresh.token, 'POST', '/api/auth/email/start', { email: 'BOB@example.com' }))).toBe('403 email_banned');
    const { id: appealId } = await ok(call<{ id: string }>(bob.token, 'POST', `/api/me/sanctions/${sanctionId}/appeal`, { text: 'Je n’ai jamais triché.' }));
    await ok(call(mod.token, 'POST', `/api/mod/appeals/${appealId}`, { status: 'accepted', decision: 'Erreur de détection.' }));
    await ok(call(fresh.token, 'POST', '/api/auth/email/start', { email: 'bob@example.com' }));
  });

  it('e-mail vérifié exigé (si activé) pour la messagerie, les publications et les groupes — pas pour jouer', async () => {
    await boot(true);
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    expect(await error(call(ana.token, 'POST', '/api/messages/requests', { userId: bob.id }))).toBe('403 email_required');
    expect(await error(call(ana.token, 'POST', '/api/posts', { target: 'profile', text: 'Salut' }))).toBe('403 email_required');
    expect(await error(call(ana.token, 'POST', '/api/groups', { name: 'G' }))).toBe('403 email_required');
    expect((await ok(call<{ emailRequired: boolean }>(ana.token, 'GET', '/api/me/account'))).emailRequired).toBe(true);
    // Les autres actions restent ouvertes (suivre, liker, jouer).
    await ok(call(ana.token, 'POST', `/api/users/${bob.id}/follow`));
    await verifyEmail(ana, 'ana@example.com');
    await ok(call<PostView>(ana.token, 'POST', '/api/posts', { target: 'profile', text: 'Salut' }));
    await ok(call(ana.token, 'POST', '/api/messages/requests', { userId: bob.id }));
  });
});

describe('M8 : notifications push', () => {
  const TOKEN = (n: number) => `ExponentPushToken[device${String(n).padStart(6, '0')}]`;

  async function chat() {
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    await ok(call(bob.token, 'PUT', '/api/me/push-tokens', { token: TOKEN(1), platform: 'ios' }));
    await ok(call(ana.token, 'POST', '/api/messages/requests', { userId: bob.id, text: 'Une partie ?' }));
    const [req] = (await ok(call<{ requests: MessageRequestView[] }>(bob.token, 'GET', '/api/messages/requests'))).requests;
    const { conversationId } = await ok(call<{ conversationId: string }>(bob.token, 'POST', `/api/messages/requests/${req.id}/accept`));
    return { ana, bob, conversationId };
  }

  it('jeton invalide refusé ; un nouveau message arrive en push avec aperçu, seulement hors de l’application', async () => {
    await boot();
    const { ana, bob, conversationId } = await chat();
    expect(await error(call(bob.token, 'PUT', '/api/me/push-tokens', { token: 'nimporte', platform: 'ios' }))).toBe('400 invalid_push_token');
    // Bob est dans l'application : pas de push en double (le temps réel suffit).
    pushes.sent.length = 0;
    await ok(call(ana.token, 'POST', `/api/messages/${conversationId}`, { text: 'Tu es là ?' }));
    expect(pushes.sent).toHaveLength(0);
    await goOffline(bob);
    await ok(call(ana.token, 'POST', `/api/messages/${conversationId}`, { text: 'Je lance un défi' }));
    expect(pushes.sent).toEqual([
      { to: TOKEN(1), title: 'Ana', body: 'Je lance un défi', data: { kind: 'message', conversationId }, channelId: 'messages' },
    ]);
    await ok(call(ana.token, 'POST', `/api/messages/${conversationId}`, { stickerId: 'gg' }));
    expect(pushes.sent.at(-1)?.body).toBe('Sticker');
  });

  it('aperçus masqués, push des messages désactivé ; demande de message séparée', async () => {
    await boot();
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    await ok(call(cle.token, 'PUT', '/api/me/push-tokens', { token: TOKEN(2), platform: 'android' }));
    await ok(call(cle.token, 'PATCH', '/api/me/notification-preferences', { hideMessagePreviews: true }));
    await goOffline(cle);
    await ok(call(ana.token, 'POST', '/api/messages/requests', { userId: cle.id, text: 'Secret' }));
    expect(pushes.sent.at(-1)).toMatchObject({ title: 'Nouvelle demande de message', body: 'Ana veut t’écrire', channelId: 'messages' });
    expect(JSON.stringify(pushes.sent)).not.toContain('Secret');
    await ok(call(cle.token, 'PATCH', '/api/me/notification-preferences', { messagePush: false }));
    const before = pushes.sent.length;
    await ok(call(bob.token, 'POST', '/api/messages/requests', { userId: cle.id, text: 'Coucou' }));
    expect(pushes.sent.length).toBe(before);
  });

  it('groupe : titre du groupe, auteur dans le texte ; invitation de groupe en push', async () => {
    await boot();
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    await ok(call(bob.token, 'PUT', '/api/me/push-tokens', { token: TOKEN(3), platform: 'ios' }));
    await goOffline(bob);
    const { conversationId } = await ok(call<{ conversationId: string }>(ana.token, 'POST', '/api/groups', { name: 'Les Cracks', userIds: [bob.id] }));
    expect(pushes.sent.at(-1)).toMatchObject({ title: 'Invitation de groupe', body: 'Ana t’invite dans le groupe « Les Cracks »' });
    const [inv] = (await ok(call<{ invitations: GroupInvitationView[] }>(bob.token, 'GET', '/api/groups/invitations'))).invitations;
    await ok(call(bob.token, 'POST', `/api/groups/invitations/${inv.id}/accept`));
    await ok(call(ana.token, 'POST', `/api/messages/${conversationId}`, { text: 'Bienvenue' }));
    expect(pushes.sent.at(-1)).toMatchObject({ title: 'Les Cracks', body: 'Ana : Bienvenue' });
  });

  it('notifications communautaires en push selon la catégorie ; le centre garde tout', async () => {
    await boot();
    const [ana, bob] = [await user('Ana'), await user('Bob')];
    await ok(call(bob.token, 'PUT', '/api/me/push-tokens', { token: TOKEN(4), platform: 'android' }));
    const post = await ok(call<PostView>(bob.token, 'POST', '/api/posts', { target: 'profile', text: 'Mon score' }));
    await goOffline(bob);
    await ok(call(ana.token, 'PUT', `/api/posts/${post.id}/like`));
    expect(pushes.sent.at(-1)).toMatchObject({ title: 'Qu1z', body: expect.stringContaining('Ana'), channelId: 'community' });
    await ok(call(bob.token, 'PATCH', '/api/me/notification-preferences', { push: { community: false } }));
    const before = pushes.sent.length;
    await ok(call(ana.token, 'POST', `/api/posts/${post.id}/comments`, { text: 'Bravo !' }));
    expect(pushes.sent.length).toBe(before);
    const center = await ok(call<{ notifications: { type: string }[] }>(bob.token, 'GET', '/api/notifications'));
    expect(center.notifications.map((n) => n.type)).toEqual(['comment', 'like']);
  });

  it('appareil désinscrit et compte banni : jetons supprimés', async () => {
    await boot();
    const { ana, bob, conversationId } = await chat();
    await goOffline(bob);
    pushes.invalid.add(TOKEN(1));
    await ok(call(ana.token, 'POST', `/api/messages/${conversationId}`, { text: 'Hello' }));
    expect((await db.query('SELECT 1 FROM push_tokens')).length).toBe(0);
    const mod = await user('Modo');
    await server.game.repo.setRole(mod.id, 'moderator');
    await ok(call(ana.token, 'PUT', '/api/me/push-tokens', { token: TOKEN(5), platform: 'ios' }));
    await ok(call(mod.token, 'POST', '/api/mod/sanctions', { userId: ana.id, level: 'ban', reason: 'Spam' }));
    await sleep(100);
    expect((await db.query('SELECT 1 FROM push_tokens WHERE user_id = $1', [ana.id])).length).toBe(0);
  });
});
