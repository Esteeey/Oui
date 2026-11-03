import { afterEach, describe, expect, it } from 'vitest';

import { migrate, openDatabase, type Database } from '../src/db/database';
import { hashToken } from '../src/game';
import { importLegacy } from '../src/import-json';
import { RateLimiter } from '../src/rate-limit';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient, sleep } from './helpers';

let server: GameServer | null = null;
let db: Database | null = null;
const clients: TestClient[] = [];

async function boot(): Promise<GameServer> {
  db = await openDatabase();
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300, limits: { block: { max: 3, windowMs: 60_000 } } });
  return server;
}

async function client(token?: string): Promise<TestClient> {
  const c = await new TestClient(server!.port).connect(token);
  clients.push(c);
  return c;
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://localhost:${server!.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server?.close();
  await db?.close();
  server = null;
  db = null;
});

describe('base de données', () => {
  it('les migrations ne s’appliquent qu’une fois', async () => {
    db = await openDatabase();
    expect(await migrate(db)).toEqual([]);
  });

  it('pseudo unique sans tenir compte de la casse', async () => {
    db = await openDatabase();
    const repo = new Repo(db);
    const a = await repo.createGuest(hashToken('a'));
    const pseudo = await repo.pseudo(a.id);
    const b = await repo.createGuest(hashToken('b'));
    await expect(db.query('UPDATE profiles SET pseudo = $2 WHERE user_id = $1', [b.id, pseudo.toUpperCase()])).rejects.toThrow();
  });

  it('reprise de l’ancien fichier JSON, sans doublon si on la relance', async () => {
    db = await openDatabase();
    const id = '11111111-1111-4111-8111-111111111111';
    const legacy = {
      players: { [id]: { id, tokenHash: hashToken('ancien'), name: 'Joueur 4242', xp: 160, stats: {}, pendingResult: null } },
      duels: {},
      results: {},
    };
    expect(await importLegacy(db, legacy as never)).toEqual({ players: 1, duels: 0, results: 0 });
    expect(await importLegacy(db, legacy as never)).toEqual({ players: 0, duels: 0, results: 0 });
    const repo = new Repo(db);
    const user = await repo.userByTokenHash(hashToken('ancien'));
    expect(user?.xp).toBe(160);
    expect(await repo.pseudo(id)).toBe('Joueur 4242');
  });
});

describe('API et sécurité', () => {
  it('refuse les requêtes sans jeton valide', async () => {
    await boot();
    expect((await api('faux', 'GET', '/api/me')).status).toBe(401);
  });

  it('bloquer, lister, débloquer un joueur', async () => {
    await boot();
    const a = await client();
    const b = await client();
    expect((await api(a.token, 'POST', '/api/blocks', { userId: b.playerId })).status).toBe(200);
    expect((await api(a.token, 'POST', '/api/blocks', { userId: b.playerId })).status).toBe(200); // double clic : sans effet
    const list = await api(a.token, 'GET', '/api/blocks');
    expect((list.body.blocked as { id: string }[]).map((x) => x.id)).toEqual([b.playerId]);
    expect(await server!.game.repo.isBlockedEitherWay(b.playerId, a.playerId)).toBe(true);
    expect((await api(a.token, 'DELETE', `/api/blocks/${b.playerId}`)).status).toBe(200);
    expect(await server!.game.repo.isBlockedEitherWay(a.playerId, b.playerId)).toBe(false);
  });

  it('refuse de se bloquer soi-même ou un identifiant invalide', async () => {
    await boot();
    const a = await client();
    expect((await api(a.token, 'POST', '/api/blocks', { userId: a.playerId })).status).toBe(400);
    expect((await api(a.token, 'POST', '/api/blocks', { userId: 'x; DROP TABLE users' })).status).toBe(400);
    expect((await api(a.token, 'POST', '/api/blocks', { userId: '22222222-2222-4222-8222-222222222222' })).status).toBe(404);
  });

  it('anti-spam : au-delà de la limite configurée, la demande est refusée', async () => {
    await boot();
    const a = await client();
    const others = await Promise.all([client(), client(), client(), client()]);
    const codes = [];
    for (const o of others) codes.push((await api(a.token, 'POST', '/api/blocks', { userId: o.playerId })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it('un compte banni ne peut plus se connecter ni utiliser l’API (sauf pour faire appel)', async () => {
    await boot();
    const a = await client();
    await server!.game.repo.setStatus(a.playerId, 'banned');
    const again = new TestClient(server!.port);
    await expect(again.connect(a.token)).rejects.toThrow();
    expect(again.messages.some((m) => m.type === 'error' && m.code === 'banned')).toBe(true);
    // Seuls le compte, les sanctions et l'appel restent consultables (M7) ; tout le reste est refusé.
    expect((await api(a.token, 'GET', '/api/me')).body.status).toBe('banned');
    expect((await api(a.token, 'GET', '/api/feed')).status).toBe(403);
    expect((await api(a.token, 'GET', '/api/messages')).status).toBe(403);
  });

  it('rôle visible par l’API (joueur par défaut, modérateur attribuable)', async () => {
    await boot();
    const a = await client();
    expect((await api(a.token, 'GET', '/api/me')).body.role).toBe('player');
    await server!.game.repo.setRole(a.playerId, 'moderator');
    expect((await api(a.token, 'GET', '/api/me')).body.role).toBe('moderator');
  });
});

describe('blocage et duels', () => {
  it('deux joueurs qui se sont bloqués ne sont jamais appariés', async () => {
    await boot();
    const a = await client();
    const b = await client();
    await server!.game.repo.block(a.playerId, b.playerId);
    a.send({ type: 'play', themeId: 'geo-capitales', mode: 'pvp' });
    await a.waitFor((m) => m.type === 'queued');
    b.send({ type: 'play', themeId: 'geo-capitales', mode: 'pvp' });
    const sb = await b.waitForDuel(() => true, 3000, 0);
    expect(sb.opponent.isBot).toBe(true);
  });
});

describe('limiteur', () => {
  it('fenêtre glissante : de nouveau permis après la fenêtre', () => {
    let t = 0;
    const limiter = new RateLimiter({ x: { max: 2, windowMs: 1000 } }, () => t);
    expect([limiter.allow('x', 'u'), limiter.allow('x', 'u'), limiter.allow('x', 'u')]).toEqual([true, true, false]);
    expect(limiter.allow('x', 'autre')).toBe(true);
    t = 1500;
    expect(limiter.allow('x', 'u')).toBe(true);
  });
});

void sleep;
