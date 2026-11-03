import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  AppealSummary,
  ConversationDetail,
  GroupDetail,
  GroupInvitationView,
  MessageRequestView,
  MessageView,
  ModerationLogEntry,
  NotificationView,
  PostView,
  ReportDetail,
  ReportSummary,
  SanctionView,
} from '@qu1z/shared';

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
const error = async (p: Promise<{ status: number; body: unknown }>) => {
  const r = await p;
  return `${r.status} ${(r.body as { error?: string }).error}`;
};

async function user(pseudo: string, role?: 'moderator' | 'admin'): Promise<U> {
  const ws = await new TestClient(server.port).connect();
  clients.push(ws);
  const u = { id: ws.playerId, token: ws.token, ws };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  if (role) await server.game.repo.setRole(u.id, role);
  return u;
}

async function direct(a: U, b: U): Promise<string> {
  await ok(call(a, 'POST', '/api/messages/requests', { userId: b.id }));
  const [req] = (await ok(call<{ requests: MessageRequestView[] }>(b, 'GET', '/api/messages/requests'))).requests;
  return (await ok(call<{ conversationId: string }>(b, 'POST', `/api/messages/requests/${req.id}/accept`))).conversationId;
}

async function group(creator: U, members: U[]): Promise<string> {
  const { conversationId } = await ok(call<{ conversationId: string }>(creator, 'POST', '/api/groups', { name: 'Quiz', userIds: members.map((m) => m.id) }));
  for (const m of members) {
    const inv = (await ok(call<{ invitations: GroupInvitationView[] }>(m, 'GET', '/api/groups/invitations'))).invitations[0];
    await ok(call(m, 'POST', `/api/groups/invitations/${inv.id}/accept`));
  }
  return conversationId;
}

const say = (u: U, id: string, text: string) => ok(call<MessageView>(u, 'POST', `/api/messages/${id}`, { text }));
const report = (u: U, body: Record<string, unknown>) => call<{ id: string }>(u, 'POST', '/api/reports', body);

describe('M7 : signalements', () => {
  it('fige le contenu et le contexte de la conversation, avec le signalant, la date, le motif et le statut', async () => {
    const [ana, bob, mod] = [await user('Ana'), await user('Bob'), await user('Modo', 'moderator')];
    const id = await direct(ana, bob);
    await say(ana, id, 'Salut');
    const bad = await say(bob, id, 'Message insultant');
    await say(ana, id, 'Pourquoi tu dis ça ?');
    const { id: reportId } = await ok(report(ana, { targetType: 'message', targetId: bad.id, reason: 'harassment', details: 'Il m’insulte' }));

    // Bob bloque Ana : la conversation disparaît des deux côtés, mais la preuve reste.
    await ok(call(bob, 'POST', '/api/blocks', { userId: ana.id }));
    const r = await ok(call<ReportDetail>(mod, 'GET', `/api/mod/reports/${reportId}`));
    expect(r).toMatchObject({ targetType: 'message', reason: 'harassment', status: 'open', details: 'Il m’insulte', conversationId: id });
    expect(r.reporter.pseudo).toBe('Ana');
    expect(r.targetUser?.pseudo).toBe('Bob');
    const snap = r.snapshot as { message: { text: string }; context: { text: string }[] };
    expect(snap.message.text).toBe('Message insultant');
    expect(snap.context.map((m) => m.text)).toEqual(['Salut', 'Message insultant', 'Pourquoi tu dis ça ?']);
    expect(r.preview).toBe('Message insultant');
    expect(r.createdAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it('on ne signale que ce qu’on peut voir ; un seul signalement ouvert par contenu ; limite quotidienne', async () => {
    const [ana, bob, cle] = [await user('Ana'), await user('Bob'), await user('Cle')];
    const id = await direct(ana, bob);
    const m = await say(bob, id, 'Coucou');
    expect(await error(report(cle, { targetType: 'message', targetId: m.id, reason: 'spam' }))).toBe('404 not_found');
    expect(await error(report(bob, { targetType: 'message', targetId: m.id, reason: 'spam' }))).toBe('400 self');
    expect(await error(report(ana, { targetType: 'message', targetId: m.id, reason: 'nimporte' }))).toBe('400 invalid_reason');
    expect(await error(report(ana, { targetType: 'media', targetId: m.id, reason: 'spam' }))).toBe('400 invalid_target');
    await ok(report(ana, { targetType: 'message', targetId: m.id, reason: 'spam' }));
    expect(await error(report(ana, { targetType: 'message', targetId: m.id, reason: 'spam' }))).toBe('409 already_reported');
    // Signalements abusifs : 20 par jour au plus.
    const others = await Promise.all(Array.from({ length: 20 }, (_, i) => user(`J${i}x`)));
    const statuses = [];
    for (const o of others) statuses.push((await report(cle, { targetType: 'user', targetId: o.id, reason: 'spam' })).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(await error(report(cle, { targetType: 'user', targetId: ana.id, reason: 'spam' }))).toBe('429 rate_limited');
  });

  it('joueur, groupe, sticker, publication : chaque type arrive au panneau ; priorité aux administrateurs du groupe', async () => {
    const [ana, bob, cle, mod] = [await user('Ana'), await user('Bob'), await user('Cle'), await user('Modo', 'moderator')];
    const g = await group(ana, [bob, cle]);
    const sticker = await ok(call<MessageView>(bob, 'POST', `/api/messages/${g}`, { stickerId: 'mdr' }));
    await ok(report(ana, { targetType: 'media', targetId: sticker.id, reason: 'harassment' }));
    await ok(report(cle, { targetType: 'group', targetId: g, reason: 'spam' }));
    await ok(report(cle, { targetType: 'user', targetId: bob.id, reason: 'impersonation' }));
    const post = await ok(call<PostView>(bob, 'POST', '/api/posts', { target: 'profile', text: 'Publication douteuse' }));
    await ok(report(ana, { targetType: 'post', targetId: post.id, reason: 'spam' }));
    const list = (await ok(call<{ reports: ReportSummary[] }>(mod, 'GET', '/api/mod/reports'))).reports;
    expect(list.map((r) => r.targetType)).toEqual(['media', 'group', 'user', 'post']);
    // Le signalement fait par la créatrice du groupe passe en tête (priorité).
    expect(list[0]).toMatchObject({ priority: true, reporter: { pseudo: 'Ana' } });
    expect(list.find((r) => r.targetType === 'group')?.preview).toBe('Groupe « Quiz »');
    // Les joueurs n'ont pas accès au panneau.
    expect(await error(call(ana, 'GET', '/api/mod/reports'))).toBe('403 forbidden');
    expect(await error(call(ana, 'GET', `/api/mod/groups/${g}`))).toBe('403 forbidden');
  });
});

describe('M7 : interventions officielles', () => {
  it('retirer un message, une publication : invisible, sans message système, journalisé', async () => {
    const [ana, bob, mod] = [await user('Ana'), await user('Bob'), await user('Modo', 'moderator')];
    const g = await group(ana, [bob]);
    const m = await say(bob, g, 'Contenu interdit');
    await ok(call(ana, 'PUT', `/api/groups/pins/${m.id}`));
    const before = (await ok(call<ConversationDetail>(ana, 'GET', `/api/messages/${g}`))).messages.length;
    await ok(call(mod, 'POST', '/api/mod/remove', { type: 'message', id: m.id }));
    const after = await ok(call<ConversationDetail>(ana, 'GET', `/api/messages/${g}`));
    expect(after.messages.length).toBe(before - 1);
    expect(after.messages.some((x) => x.text === 'Contenu interdit')).toBe(false);
    expect(after.pinned).toHaveLength(0);
    expect(after.messages.filter((x) => x.kind === 'system').some((x) => /modér/i.test(x.text ?? ''))).toBe(false);
    // L'équipe garde la trace dans sa vue du groupe.
    const view = await ok(call<{ messages: { text: string; removed: boolean }[] }>(mod, 'GET', `/api/mod/groups/${g}`));
    expect(view.messages.find((x) => x.text === 'Contenu interdit')?.removed).toBe(true);

    const post = await ok(call<PostView>(bob, 'POST', '/api/posts', { target: 'profile', text: 'Spam' }));
    await ok(call(mod, 'POST', '/api/mod/remove', { type: 'post', id: post.id }));
    expect((await call(ana, 'GET', `/api/posts/${post.id}`)).status).toBe(404);
    const log = (await ok(call<{ entries: ModerationLogEntry[] }>(mod, 'GET', '/api/mod/log'))).entries;
    expect(log.filter((e) => e.action === 'remove_content').map((e) => e.targetType).sort()).toEqual(['message', 'post']);
    expect(log[0].actor?.pseudo).toBe('Modo');
  });

  it('exclusion officielle d’un groupe : sans être membre, invisible, impossible à lever par les administrateurs', async () => {
    const [ana, bob, cle, mod] = [await user('Ana'), await user('Bob'), await user('Cle'), await user('Modo', 'moderator')];
    const g = await group(ana, [bob, cle]);
    await ok(call(mod, 'POST', `/api/mod/groups/${g}/exclusions`, { userId: bob.id, hours: null }));
    expect((await call(bob, 'GET', `/api/messages/${g}`)).status).toBe(404);
    const conv = await ok(call<ConversationDetail>(ana, 'GET', `/api/messages/${g}`));
    expect(conv.messages.some((m) => m.text?.includes('exclu'))).toBe(false);
    const d = await ok(call<GroupDetail>(ana, 'GET', `/api/groups/${g}`));
    expect(d.exclusions).toHaveLength(0);
    expect(await error(call(ana, 'DELETE', `/api/groups/${g}/exclusions/${bob.id}`))).toBe('404 not_found');
    expect(await error(call(ana, 'POST', `/api/groups/${g}/invitations`, { userId: bob.id }))).toBe('403 excluded');
    // Les actions des administrateurs de groupe sont aussi journalisées.
    await ok(call(ana, 'PUT', `/api/groups/${g}/members/${cle.id}/role`, { role: 'admin' }));
    const log = (await ok(call<{ entries: ModerationLogEntry[] }>(mod, 'GET', `/api/mod/log?target=${g}`))).entries;
    expect(log.map((e) => [e.action, e.actorRole])).toEqual([
      ['admin_added', 'group_creator'],
      ['group_exclude', 'moderator'],
    ]);
  });

  it('fermer un groupe en cas d’abus', async () => {
    const [ana, bob, mod] = [await user('Ana'), await user('Bob'), await user('Modo', 'moderator')];
    const g = await group(ana, [bob]);
    await ok(call(mod, 'POST', `/api/mod/groups/${g}/close`, {}));
    expect((await call(ana, 'GET', `/api/messages/${g}`)).status).toBe(404);
    expect((await ok(call<{ closed: boolean }>(mod, 'GET', `/api/mod/groups/${g}`))).closed).toBe(true);
  });
});

describe('M7 : sanctions et appels', () => {
  it('avertissement : notifié, enregistré, sans restriction', async () => {
    const [bob, mod] = [await user('Bob'), await user('Modo', 'moderator')];
    await ok(call(mod, 'POST', '/api/mod/sanctions', { userId: bob.id, level: 'warning', reason: 'Langage inapproprié' }));
    const [s] = (await ok(call<{ sanctions: SanctionView[] }>(bob, 'GET', '/api/me/sanctions'))).sanctions;
    expect(s).toMatchObject({ level: 'warning', reason: 'Langage inapproprié', active: false });
    const notifs = (await ok(call<{ notifications: NotificationView[] }>(bob, 'GET', '/api/notifications'))).notifications;
    expect(notifs[0]).toMatchObject({ type: 'sanction', data: { level: 'warning' } });
    await ok(call(bob, 'POST', '/api/posts', { target: 'profile', text: 'Je peux encore publier' }));
  });

  it('suspension : seules les fonctionnalités choisies sont restreintes, jusqu’à la fin de la durée', async () => {
    const [ana, bob, mod] = [await user('Ana'), await user('Bob'), await user('Modo', 'moderator')];
    const id = await direct(ana, bob);
    await ok(call(mod, 'POST', '/api/mod/sanctions', { userId: bob.id, level: 'suspension', reason: 'Spam', hours: 48, restrictions: ['messages'] }));
    const r = await call<{ error: string; until: number }>(bob, 'POST', `/api/messages/${id}`, { text: 'Encore du spam' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('suspended');
    expect(r.body.until).toBeGreaterThan(Date.now() + 47 * 3600_000);
    expect(await error(call(bob, 'POST', '/api/groups', { name: 'X' }))).toBe('403 suspended');
    // Publier reste possible (non restreint), jouer aussi.
    await ok(call(bob, 'POST', '/api/posts', { target: 'profile', text: 'Toujours là' }));
    // Fin de la suspension : tout redevient possible.
    await db.query("UPDATE sanctions SET ends_at = now() - interval '1 minute'");
    await say(bob, id, 'De retour');
  });

  it('bannissement : connexions coupées, accès refusé, e-mail bloqué ; appel accepté = compte réactivé et e-mail débloqué', async () => {
    const [bob, mod, admin] = [await user('Bob'), await user('Modo', 'moderator'), await user('Chef', 'admin')];
    await db.query("UPDATE users SET email = 'bob@example.com' WHERE id = $1", [bob.id]);
    const before = bob.ws.messages.length;
    const { id: sanctionId } = await ok(
      call<{ id: string }>(mod, 'POST', '/api/mod/sanctions', { userId: bob.id, level: 'ban', reason: 'Harcèlement répété' }),
    );
    const kicked = await bob.ws.waitFor((m) => m.type === 'error', 2000, before);
    expect(kicked).toMatchObject({ code: 'banned' });
    expect(await error(call(bob, 'GET', '/api/feed'))).toBe('403 banned');
    expect((await db.query('SELECT 1 FROM banned_emails')).length).toBe(1);
    // Reconnexion refusée.
    const again = new TestClient(server.port);
    await expect(again.connect(bob.token)).rejects.toThrow();
    clients.push(again);

    // Le compte reste consultable pour faire appel.
    const [s] = (await ok(call<{ sanctions: SanctionView[] }>(bob, 'GET', '/api/me/sanctions'))).sanctions;
    expect(s).toMatchObject({ id: sanctionId, level: 'ban', active: true });
    expect(await error(call(bob, 'POST', `/api/me/sanctions/${sanctionId}/appeal`, { text: 'court' }))).toBe('400 invalid_text');
    await ok(call(bob, 'POST', `/api/me/sanctions/${sanctionId}/appeal`, { text: 'Ce n’était pas moi, mon frère a utilisé mon téléphone.', evidence: 'Capture du 12/10' }));
    expect(await error(call(bob, 'POST', `/api/me/sanctions/${sanctionId}/appeal`, { text: 'Deuxième appel pour la même sanction' }))).toBe(
      '409 already_appealed',
    );

    const [appeal] = (await ok(call<{ appeals: AppealSummary[] }>(mod, 'GET', '/api/mod/appeals'))).appeals;
    expect(appeal).toMatchObject({ status: 'pending', user: { pseudo: 'Bob' }, evidence: 'Capture du 12/10' });
    await ok(call(mod, 'POST', `/api/mod/appeals/${appeal.id}`, { status: 'in_review' }));
    expect((await ok(call<{ sanctions: SanctionView[] }>(bob, 'GET', '/api/me/sanctions'))).sanctions[0].appeal?.status).toBe('in_review');
    expect(await error(call(mod, 'POST', `/api/mod/appeals/${appeal.id}`, { status: 'accepted' }))).toBe('400 decision_required');
    await ok(call(admin, 'POST', `/api/mod/appeals/${appeal.id}`, { status: 'accepted', decision: 'Compte partagé : sanction levée.' }));

    const after = (await ok(call<{ sanctions: SanctionView[] }>(bob, 'GET', '/api/me/sanctions'))).sanctions[0];
    expect(after).toMatchObject({ active: false, appeal: { status: 'accepted', decisionText: 'Compte partagé : sanction levée.' } });
    expect((await db.query('SELECT 1 FROM banned_emails')).length).toBe(0);
    const back = await new TestClient(server.port).connect(bob.token);
    clients.push(back);
    expect(back.playerId).toBe(bob.id);
    const notifs = (await ok(call<{ notifications: NotificationView[] }>(bob, 'GET', '/api/notifications'))).notifications;
    expect(notifs.find((n) => n.type === 'appeal_decision')?.data).toMatchObject({ status: 'accepted' });
    // Historique complet conservé.
    const log = (await ok(call<{ entries: ModerationLogEntry[] }>(admin, 'GET', `/api/mod/log?target=${bob.id}`))).entries.map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(['sanction_ban', 'sanction_revoked']));
  });

  it('appel refusé : la sanction reste, la décision est communiquée', async () => {
    const [bob, mod] = [await user('Bob'), await user('Modo', 'moderator')];
    const { id } = await ok(call<{ id: string }>(mod, 'POST', '/api/mod/sanctions', { userId: bob.id, level: 'suspension', reason: 'Spam', hours: 24 }));
    const { id: appealId } = await ok(call<{ id: string }>(bob, 'POST', `/api/me/sanctions/${id}/appeal`, { text: 'Je conteste cette suspension.' }));
    await ok(call(mod, 'POST', `/api/mod/appeals/${appealId}`, { status: 'rejected', decision: 'Les preuves sont claires.' }));
    expect(await error(call(mod, 'POST', `/api/mod/appeals/${appealId}`, { status: 'accepted', decision: 'non' }))).toBe('409 already_decided');
    const [s] = (await ok(call<{ sanctions: SanctionView[] }>(bob, 'GET', '/api/me/sanctions'))).sanctions;
    expect(s).toMatchObject({ active: true, appeal: { status: 'rejected', decisionText: 'Les preuves sont claires.' } });
  });

  it('droits : un modérateur ne sanctionne pas l’équipe ; seul un administrateur nomme les modérateurs', async () => {
    const [bob, mod, mod2, admin] = [await user('Bob'), await user('Modo', 'moderator'), await user('Modo2', 'moderator'), await user('Chef', 'admin')];
    expect(await error(call(mod, 'POST', '/api/mod/sanctions', { userId: mod2.id, level: 'warning', reason: 'x' }))).toBe('403 forbidden');
    expect(await error(call(bob, 'POST', '/api/mod/sanctions', { userId: mod.id, level: 'ban', reason: 'x' }))).toBe('403 forbidden');
    expect(await error(call(mod, 'PUT', `/api/admin/users/${bob.id}/role`, { role: 'moderator' }))).toBe('403 forbidden');
    await ok(call(admin, 'PUT', `/api/admin/users/${bob.id}/role`, { role: 'moderator' }));
    await ok(call(bob, 'GET', '/api/mod/reports'));
  });

  it('comptes liés (même réseau) : indice pour l’équipe, aucun bannissement automatique', async () => {
    const [ana, bob, cle, mod] = [await user('Ana'), await user('Bob'), await user('Cle'), await user('Modo', 'moderator')];
    await ok(call(mod, 'POST', '/api/mod/sanctions', { userId: bob.id, level: 'ban', reason: 'Triche' }));
    // Cle partage le même réseau (ici, la même machine) mais n'est pas banni.
    expect((await ok(call<{ status: string }>(cle, 'GET', '/api/me'))).status).toBe('active');
    const { id } = await ok(report(ana, { targetType: 'user', targetId: cle.id, reason: 'cheating' }));
    const r = await ok(call<ReportDetail>(mod, 'GET', `/api/mod/reports/${id}`));
    expect(r.linkedAccounts.find((l) => l.user.id === bob.id)?.status).toBe('banned');
    await ok(call(mod, 'POST', `/api/mod/reports/${id}/status`, { status: 'closed', resolution: 'Rien à signaler' }));
    const notifs = (await ok(call<{ notifications: NotificationView[] }>(ana, 'GET', '/api/notifications'))).notifications;
    expect(notifs[0].type).toBe('report_closed');
  });
});
