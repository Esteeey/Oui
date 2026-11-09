import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DUEL_INVITE_DEFAULTS, type DuelInviteAnimation } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { MemoryStore } from '../src/media';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient } from './helpers';

let server: GameServer;
let db: Database;
const clients: TestClient[] = [];

beforeEach(async () => {
  db = await openDatabase();
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300, mediaStore: new MemoryStore(), gifs: null });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close();
  await db.close();
});

async function user(role?: 'admin' | 'moderator') {
  const ws = await new TestClient(server.port).connect();
  clients.push(ws);
  if (role) await server.game.repo.setRole(ws.playerId, role);
  return ws.token;
}

type Settings = { duelInvite: DuelInviteAnimation; customized: boolean };
const call = async (token: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Settings };
};

describe('Réglages de l’animation d’invitation', () => {
  it('donne les valeurs par défaut tant que rien n’est enregistré', async () => {
    expect((await call(await user(), 'GET', '/api/animations')).body).toEqual({ duelInvite: DUEL_INVITE_DEFAULTS, customized: false });
  });

  it('réserve la modification aux administrateurs', async () => {
    const player = await user();
    const mod = await user('moderator');
    expect((await call(player, 'PUT', '/api/admin/animations/duelInvite', { tearMs: 500 })).status).toBe(403);
    expect((await call(mod, 'DELETE', '/api/admin/animations/duelInvite')).status).toBe(403);
  });

  it('applique le réglage à tous les joueurs, puis le rétablit', async () => {
    const admin = await user('admin');
    const player = await user();
    const put = await call(admin, 'PUT', '/api/admin/animations/duelInvite', { tearMs: 500, edgeTop: '#00e5ab', enabled: false });
    expect(put.status).toBe(200);
    const seen = (await call(player, 'GET', '/api/animations')).body;
    expect(seen.customized).toBe(true);
    expect(seen.duelInvite).toMatchObject({ tearMs: 500, edgeTop: '#00E5AB', enabled: false, veilMs: DUEL_INVITE_DEFAULTS.veilMs });

    expect((await call(admin, 'DELETE', '/api/admin/animations/duelInvite')).status).toBe(200);
    expect((await call(player, 'GET', '/api/animations')).body).toEqual({ duelInvite: DUEL_INVITE_DEFAULTS, customized: false });
  });

  it('borne les valeurs et ignore ce qui n’est pas valable', async () => {
    const admin = await user('admin');
    const { body } = await call(admin, 'PUT', '/api/admin/animations/duelInvite', { tearMs: 999999, blur: -4, shards: 'beaucoup', edgeBottom: 'rouge', inconnu: 1 });
    expect(body.duelInvite).toMatchObject({ tearMs: 2000, blur: 0, shards: DUEL_INVITE_DEFAULTS.shards, edgeBottom: DUEL_INVITE_DEFAULTS.edgeBottom });
    expect(body.duelInvite).not.toHaveProperty('inconnu');
  });

  it('refuse une animation inconnue', async () => {
    expect((await call(await user('admin'), 'PUT', '/api/admin/animations/autre', {})).status).toBe(404);
  });
});
