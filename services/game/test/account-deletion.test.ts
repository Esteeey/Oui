import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GroupInvitationView, PostView } from '@qu1z/shared';

import { AccountDeletion, DELETED_PLAYER_NAME } from '../src/account-deletion';
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

async function user(pseudo: string): Promise<U> {
  const c = await new TestClient(server.port).connect();
  clients.push(c);
  const u = { id: c.playerId, token: c.token };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

const count = async (sql: string, params: unknown[]) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, params))[0].n;

describe('suppression de compte', () => {
  it('efface le compte et ses données ; le joueur disparaît des données des autres', async () => {
    const ana = await user('Ana');
    const bob = await user('Bob');
    await ok(call(ana, 'POST', `/api/users/${bob.id}/follow`));
    const post = await ok(call<PostView>(bob, 'POST', '/api/posts', { target: 'profile', text: 'Mon score' }));
    await ok(call(ana, 'PUT', `/api/posts/${post.id}/like`));
    await ok(call(ana, 'POST', '/api/posts', { target: 'profile', text: 'Coucou' }));
    const { conversationId } = await ok(call<{ conversationId: string }>(ana, 'POST', '/api/groups', { name: 'Les Cracks', userIds: [bob.id] }));
    const [inv] = (await ok(call<{ invitations: GroupInvitationView[] }>(bob, 'GET', '/api/groups/invitations'))).invitations;
    await ok(call(bob, 'POST', `/api/groups/invitations/${inv.id}/accept`));
    await ok(call(ana, 'POST', `/api/messages/${conversationId}`, { text: 'Bienvenue' }));
    // Duel de Bob contre Ana, dans l'historique de Bob.
    const duelId = randomUUID();
    await db.query("INSERT INTO duels (id, theme_id, mode, state, finished_at) VALUES ($1, 'geo-capitales', 'pvp', '{}', now())", [duelId]);
    await db.query('INSERT INTO duel_results (duel_id, user_id, result, xp_awarded) VALUES ($1, $2, $3, 20)', [
      duelId,
      bob.id,
      { record: { id: duelId, opponentId: ana.id, opponentName: 'Ana', outcome: 'win', player: [], themeId: 'geo-capitales' } },
    ]);

    expect((await call(ana, 'POST', '/api/me/delete', { confirm: 'oui' })).status).toBe(400);
    await ok(call(ana, 'POST', '/api/me/delete', { confirm: 'SUPPRIMER' }));

    expect((await call(ana, 'GET', '/api/me')).status).toBe(401);
    expect((await call(bob, 'GET', `/api/users/${ana.id}`)).status).toBe(404);
    for (const [sql, params] of [
      ['users WHERE id = $1', [ana.id]],
      ['profiles WHERE user_id = $1', [ana.id]],
      ['posts WHERE author_id = $1', [ana.id]],
      ['post_likes WHERE user_id = $1', [ana.id]],
      ['follows WHERE follower_id = $1', [ana.id]],
      ['messages WHERE sender_id = $1', [ana.id]],
      ['notifications WHERE $1 = ANY(actor_ids)', [ana.id]],
      ["users WHERE status = 'deleted'", []],
    ] as const) {
      expect(await count(sql, [...params]), sql).toBe(0);
    }
    // Le groupe continue avec Bob comme créateur ; les messages système ne citent plus Ana.
    const [member] = await db.query<{ role: string }>('SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, bob.id]);
    expect(member.role).toBe('creator');
    const texts = (await db.query<{ text: string }>('SELECT text FROM messages WHERE conversation_id = $1', [conversationId])).map((m) => m.text);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.join(' ')).not.toContain('Ana');
    const [duel] = await db.query<{ result: { record: { opponentId: string | null; opponentName: string } } }>(
      'SELECT result FROM duel_results WHERE duel_id = $1',
      [duelId],
    );
    expect(duel.result.record).toMatchObject({ opponentId: null, opponentName: DELETED_PLAYER_NAME });
    // Bob et sa publication sont intacts.
    expect(await count('posts WHERE id = $1', [post.id])).toBe(1);
  });

  it('preuves de modération : conservées 6 mois sous un compte anonyme, puis purgées', async () => {
    const ana = await user('Ana');
    const bob = await user('Bob');
    await ok(call(bob, 'POST', '/api/reports', { targetType: 'user', targetId: ana.id, reason: 'spam' }));
    await ok(call(ana, 'POST', '/api/me/delete', { confirm: 'SUPPRIMER' }));

    const [report] = await db.query<{ target_user_id: string }>('SELECT target_user_id FROM reports');
    expect(report.target_user_id).not.toBe(ana.id);
    const [anon] = await db.query<{ status: string; email: string | null }>('SELECT status, email FROM users WHERE id = $1', [report.target_user_id]);
    expect(anon).toEqual({ status: 'deleted', email: null });
    expect(await count('profiles WHERE user_id = $1', [report.target_user_id])).toBe(0);

    const day = 86_400_000;
    const purge = (days: number) => new AccountDeletion(db, new MemoryStore(), () => {}, () => Date.now() + days * day).purgeExpired();
    expect(await purge(30)).toBe(0);
    expect(await count('reports', [])).toBe(1);
    expect(await purge(200)).toBe(1);
    expect(await count('reports', [])).toBe(0);
    expect(await count('users WHERE id = $1', [report.target_user_id])).toBe(0);
  });
});
