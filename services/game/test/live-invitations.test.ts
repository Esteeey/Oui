import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LiveInvitation } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient } from './helpers';

let server: GameServer;
let db: Database;
const clients: TestClient[] = [];
interface U { id: string; token: string; pseudo: string; ws: TestClient }

beforeEach(async () => {
  db = await openDatabase();
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300 });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close(); await db.close();
});

async function call<T = Record<string, unknown>>(u: U, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`http://localhost:${server.port}${path}`, { method, headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as T };
}
async function user(pseudo: string): Promise<U> {
  const ws = await new TestClient(server.port).connect(); clients.push(ws);
  const u = { id: ws.playerId, token: ws.token, pseudo, ws };
  const res = await call(u, 'PATCH', '/api/me/profile', { pseudo }); expect(res.status).toBe(200); return u;
}
async function follow(a: U, b: U) {
  const res = await call(a, 'POST', `/api/users/${b.id}/follow`); expect(res.status).toBe(200);
}

describe('invitations de duel en direct', () => {
  it('synchronise l’invitation, crée un seul duel au double clic et dirige les deux joueurs vers la même session', async () => {
    const a = await user('Invitant'); const b = await user('Adversaire'); await follow(a, b);
    const receivedFrom = b.ws.messages.length;
    const created = await call<LiveInvitation>(a, 'POST', '/api/live-invitations', { userId: b.id, themeId: 'geo-capitales' });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe('pending');
    expect(created.body.expiresAt - created.body.createdAt).toBeCloseTo(120_000, -2);
    const event = await b.ws.waitFor((m) => m.type === 'duelInvitation' && m.invitation.id === created.body.id, 4000, receivedFrom);
    expect(event.type === 'duelInvitation' && event.invitation.incoming).toBe(true);

    const [first, second] = await Promise.all([
      call<{ matchId?: string }>(b, 'POST', `/api/live-invitations/${created.body.id}/accept`),
      call<{ matchId?: string }>(b, 'POST', `/api/live-invitations/${created.body.id}/accept`),
    ]);
    const success = [first, second].find((r) => r.status === 200)!;
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(success.body.matchId).toBeTruthy();
    const snapA = await a.ws.waitForDuel((s) => s.duelId === success.body.matchId);
    const snapB = await b.ws.waitForDuel((s) => s.duelId === success.body.matchId);
    expect(snapA.duelId).toBe(snapB.duelId);
    const row = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM duel_participants WHERE duel_id = $1', [success.body.matchId]);
    expect(row[0].count).toBe(2);
  });

  it('refuse, annule et expire les invitations côté serveur', async () => {
    const a = await user('Invitant'); const b = await user('Adversaire'); await follow(a, b);
    const one = await call<LiveInvitation>(a, 'POST', '/api/live-invitations', { userId: b.id, themeId: 'geo-capitales' });
    expect(one.status).toBe(200);
    expect((await call(b, 'POST', `/api/live-invitations/${one.body.id}/decline`)).status).toBe(200);
    expect((await call(a, 'GET', '/api/live-invitations')).status).toBe(200);

    const two = await call<LiveInvitation>(a, 'POST', '/api/live-invitations', { userId: b.id, themeId: 'sports-jo' });
    expect(two.status).toBe(200);
    expect((await call(a, 'POST', `/api/live-invitations/${two.body.id}/cancel`)).status).toBe(200);

    const three = await call<LiveInvitation>(a, 'POST', '/api/live-invitations', { userId: b.id, themeId: 'geo-capitales' });
    expect(three.status).toBe(200);
    await db.query("UPDATE live_duel_invitations SET expires_at = now() - interval '1 second' WHERE id = $1", [three.body.id]);
    await server.liveInvitations.expire();
    const list = await call<{ invitations: LiveInvitation[] }>(b, 'GET', '/api/live-invitations');
    expect(list.body.invitations.find((x) => x.id === three.body.id)?.status).toBe('expired');
    expect((await call(b, 'POST', `/api/live-invitations/${three.body.id}/accept`)).status).toBe(409);
  });
});
