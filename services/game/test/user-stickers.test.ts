import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

async function user() {
  const client = await new TestClient(server.port).connect();
  clients.push(client);
  return client.token;
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const raw = Buffer.isBuffer(body);
  const response = await fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': raw ? 'image/png' : 'application/json' } : {}) },
    body: body ? (raw ? new Uint8Array(body as Buffer) : JSON.stringify(body)) : undefined,
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

describe('stickers importés', () => {
  it('importe, liste, publie, refuse un id inventé et retire de la collection', async () => {
    const me = await user();
    const png = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 255, g: 0, b: 120, alpha: 0.5 } } }).png().toBuffer();

    const up = await call(me, 'PUT', '/api/me/stickers', png);
    expect(up.status).toBe(200);
    const id = up.body.id as string;
    expect(id).toMatch(/^u-[0-9a-f]{32}$/);
    expect(store.files.has(`stickers/${id.slice(2)}.webp`)).toBe(true);

    expect((await call(me, 'GET', '/api/me/stickers')).body.stickers).toEqual([id]);

    const post = await call(me, 'POST', '/api/posts', { target: 'profile', text: '', stickerId: id });
    expect(post.status).toBe(200);
    expect(post.body.sticker).toBe(id);

    const fake = await call(me, 'POST', '/api/posts', { target: 'profile', text: '', stickerId: 'u-' + '0'.repeat(32) });
    expect(fake.status).toBe(400);

    expect((await call(me, 'DELETE', `/api/me/stickers/${id}`)).status).toBe(200);
    expect((await call(me, 'GET', '/api/me/stickers')).body.stickers).toEqual([]);
  });
});
