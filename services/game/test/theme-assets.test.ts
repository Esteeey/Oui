import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Theme } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { MemoryStore } from '../src/media';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient } from './helpers';

let server: GameServer;
let db: Database;
const clients: TestClient[] = [];
const store = new MemoryStore();

beforeEach(async () => {
  db = await openDatabase();
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300, mediaStore: store, gifs: null });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await server.close();
  await db.close();
  store.files.clear();
});

async function user(admin = false) {
  const client = await new TestClient(server.port).connect();
  clients.push(client);
  if (admin) await server.game.repo.setRole(client.playerId, 'admin');
  return client.token;
}

async function call(token: string, method: string, path: string, body?: Buffer) {
  const response = await fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'image/png' } : {}) },
    body: body ? new Uint8Array(body) : undefined,
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function png() {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: '#E5155F' } }).png().toBuffer();
}

describe('images des thèmes', () => {
  it('réserve le remplacement aux admins et conserve les images en base pour tous les joueurs', async () => {
    const [player, admin] = await Promise.all([user(), user(true)]);
    const image = await png();

    expect((await call(player, 'PUT', '/api/admin/themes/logos-marques/cover', image)).status).toBe(403);
    expect((await call(admin, 'PUT', '/api/admin/themes/theme-inconnu/icon', image)).status).toBe(404);
    expect((await call(admin, 'PUT', '/api/admin/themes/logos-marques/cover', image)).status).toBe(200);
    expect((await call(admin, 'PUT', '/api/admin/themes/logos-marques/icon', image)).status).toBe(200);

    const themes = (await call(player, 'GET', '/api/theme-catalog')).body.themes as Theme[];
    const theme = themes.find((item) => item.id === 'logos-marques');
    expect(theme?.coverUrl).toMatch(/^\/media\/themecovers\/[0-9a-f]{32}\.webp$/);
    expect(theme?.iconUrl).toMatch(/^\/media\/themeicons\/[0-9a-f]{32}\.webp$/);

    for (const url of [theme!.coverUrl!, theme!.iconUrl!]) {
      const file = await fetch(`http://localhost:${server.port}${url}`);
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe('image/webp');
      expect(Buffer.from(await file.arrayBuffer()).length).toBeGreaterThan(0);
    }
  });
});
