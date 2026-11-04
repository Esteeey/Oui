import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SoundOverride } from '@qu1z/shared';

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

const base = () => `http://localhost:${server.port}`;
const call = async (token: string, method: string, path: string, body?: Buffer) => {
  const res = await fetch(base() + path, { method, headers: { authorization: `Bearer ${token}` }, body: body && new Uint8Array(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

/** Petit fichier WAV valide (en-tête RIFF/WAVE + quelques échantillons). */
function wav(): Buffer {
  const samples = Buffer.alloc(200);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1');
  h.writeUInt32LE(36 + samples.length, 4);
  h.write('WAVEfmt ', 8, 'latin1');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1');
  h.writeUInt32LE(samples.length, 40);
  return Buffer.concat([h, samples]);
}

describe('Sons du jeu modifiables par l’administration', () => {
  it('seul un administrateur remplace un son ; tous les joueurs reçoivent le remplacement', async () => {
    const [player, mod, admin] = [await user(), await user('moderator'), await user('admin')];
    expect((await call(player, 'PUT', '/api/admin/sounds/correct', wav())).status).toBe(403);
    expect((await call(mod, 'PUT', '/api/admin/sounds/correct', wav())).status).toBe(403);
    expect((await call(mod, 'GET', '/api/admin/sounds')).status).toBe(403);

    const put = await call(admin, 'PUT', '/api/admin/sounds/correct?name=ding%20final.wav', wav());
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ id: 'correct', contentType: 'audio/wav', bytes: 244, fileName: 'ding final.wav' });

    const list = (await call(player, 'GET', '/api/sounds')).body.sounds as SoundOverride[];
    expect(list.map((s) => s.id)).toEqual(['correct']);

    // Le fichier est servi sans jeton (lecteur audio), avec son vrai type.
    const file = await fetch(base() + list[0].url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('audio/wav');
    expect(Buffer.from(await file.arrayBuffer()).equals(wav())).toBe(true);
  });

  it('refuse un son inconnu, un fichier qui n’est pas de l’audio et un fichier vide', async () => {
    const admin = await user('admin');
    expect((await call(admin, 'PUT', '/api/admin/sounds/nimporte', wav())).status).toBe(404);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    expect(await call(admin, 'PUT', '/api/admin/sounds/tick', png)).toMatchObject({ status: 415, body: { error: 'unsupported_format' } });
    expect((await call(admin, 'PUT', '/api/admin/sounds/tick', Buffer.alloc(0))).status).toBe(400);
    expect((await fetch(base() + '/sounds/../../etc/passwd')).status).toBe(404);
  });

  it('accepte un son jusqu’à 10 Mo (au-delà du plafond des images) et refuse au-delà', async () => {
    const admin = await user('admin');
    const padded = (bytes: number) => Buffer.concat([wav(), Buffer.alloc(bytes - wav().length)]);
    const big = await call(admin, 'PUT', '/api/admin/sounds/musicWin', padded(9.5 * 1024 * 1024));
    expect(big.status).toBe(200);
    expect(big.body).toMatchObject({ id: 'musicWin', bytes: 9.5 * 1024 * 1024 });
    expect(await call(admin, 'PUT', '/api/admin/sounds/musicWin', padded(10 * 1024 * 1024 + 1))).toMatchObject({
      status: 413,
      body: { error: 'too_large' },
    });
  });

  it('rétablir remet le son d’origine et l’action est inscrite au journal', async () => {
    const admin = await user('admin');
    await call(admin, 'PUT', '/api/admin/sounds/musicDuel', wav());
    expect((await call(admin, 'DELETE', '/api/admin/sounds/musicDuel')).status).toBe(200);
    expect((await call(admin, 'GET', '/api/sounds')).body.sounds).toEqual([]);
    expect((await fetch(base() + '/sounds/musicDuel')).status).toBe(404);
    const log = (await call(admin, 'GET', '/api/mod/log')).body.entries as { action: string }[];
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(['sound_updated', 'sound_reset']));
  });
});
