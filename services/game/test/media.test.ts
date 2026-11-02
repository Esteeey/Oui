import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import type { ConversationDetail, GifView, MediaView, MessageRequestView, MessageView, PostView, PublicProfile } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import type { GifProvider } from '../src/gifs';
import { MemoryStore } from '../src/media';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient } from './helpers';

let server: GameServer;
let db: Database;
let store: MemoryStore;
const clients: TestClient[] = [];

interface U {
  id: string;
  token: string;
}

const stubGifs: GifProvider = {
  name: 'stub',
  hosts: /^media\d*\.giphy\.com$/,
  search: async (q) => [{ id: 'g1', url: 'https://media1.giphy.com/media/g1/giphy.gif', previewUrl: 'https://media1.giphy.com/media/g1/200w.gif', width: 480, height: 270, title: q }],
  trending: async () => [],
};

async function boot(gifs: GifProvider | null = null) {
  db = await openDatabase();
  store = new MemoryStore();
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300, mediaStore: store, gifs });
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close();
  await db.close();
});

const base = () => `http://localhost:${server.port}`;

async function call<T = Record<string, unknown>>(u: U, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(base() + path, {
    method,
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function upload<T = MediaView>(u: U, path: string, data: Buffer, type = 'image/png'): Promise<{ status: number; body: T }> {
  const res = await fetch(base() + path, { method: 'POST', headers: { authorization: `Bearer ${u.token}`, 'content-type': type }, body: new Uint8Array(data) });
  return { status: res.status, body: (await res.json()) as T };
}

const ok = async <T,>(p: Promise<{ status: number; body: T }>): Promise<T> => {
  const r = await p;
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};

async function user(pseudo: string): Promise<U> {
  const ws = await new TestClient(server.port).connect();
  clients.push(ws);
  const u = { id: ws.playerId, token: ws.token };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

async function conversation(a: U, b: U): Promise<string> {
  await ok(call(a, 'POST', '/api/messages/requests', { userId: b.id }));
  const [req] = (await ok(call<{ requests: MessageRequestView[] }>(b, 'GET', '/api/messages/requests'))).requests;
  return (await ok(call<{ conversationId: string }>(b, 'POST', `/api/messages/requests/${req.id}/accept`))).conversationId;
}

/** Photo JPEG 3000×2000 avec des métadonnées EXIF (appareil, copyright) et une orientation. */
const photoWithExif = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'SecretPhone', Copyright: 'Position privée' } } })
    .toBuffer();

const smallPng = () => sharp({ create: { width: 64, height: 48, channels: 4, background: '#22aa88' } }).png().toBuffer();

async function animatedGif(): Promise<Buffer> {
  const frame = (color: string) => sharp({ create: { width: 40, height: 30, channels: 4, background: color } }).png().toBuffer();
  return sharp([await frame('#ff0000'), await frame('#00ff00'), await frame('#0000ff')], { join: { animated: true } })
    .gif({ delay: [100, 100, 100] })
    .toBuffer();
}

/** Lit un fichier servi par le serveur sous `/media/…`. */
async function fetchMedia(url: string) {
  const res = await fetch(base() + url);
  return { status: res.status, type: res.headers.get('content-type'), data: Buffer.from(await res.arrayBuffer()) };
}

describe('M5 : validation des médias', () => {
  it('nettoie une photo : EXIF supprimé, orientation appliquée, redimensionnée, réencodée en WebP', async () => {
    await boot();
    const a = await user('Ana');
    const media = await ok(upload(a, '/api/media?purpose=message', await photoWithExif(), 'image/jpeg'));
    // Orientation 6 : l'image est tournée d'un quart de tour, puis réduite à 1600 px au plus.
    expect([media.width, media.height]).toEqual([1067, 1600]);
    const file = await fetchMedia(media.url);
    expect(file.status).toBe(200);
    expect(file.type).toBe('image/webp');
    const meta = await sharp(file.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(file.data.includes(Buffer.from('SecretPhone'))).toBe(false);
  });

  it('vérifie le type sur le contenu, pas sur l’en-tête ni l’extension', async () => {
    await boot();
    const a = await user('Ana');
    expect((await upload(a, '/api/media', Buffer.from('ceci n’est pas une image'), 'image/png')).status).toBe(415);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    expect((await upload(a, '/api/media', svg, 'image/png')).status).toBe(415);
    const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).tiff().toBuffer();
    expect((await upload(a, '/api/media', tiff, 'image/jpeg')).status).toBe(415);
    expect((await upload(a, '/api/media', Buffer.alloc(0))).status).toBe(400);
    // Un vrai PNG envoyé avec un type trompeur est accepté (le contenu fait foi).
    expect((await upload(a, '/api/media', await smallPng(), 'application/octet-stream')).status).toBe(200);
  });

  it('refuse un fichier de plus de 8 Mo', async () => {
    await boot();
    const a = await user('Ana');
    expect((await upload(a, '/api/media', Buffer.alloc(8 * 1024 * 1024 + 1, 1))).status).toBe(413);
  });

  it('garde un GIF animé animé', async () => {
    await boot();
    const a = await user('Ana');
    const media = await ok(upload(a, '/api/media', await animatedGif(), 'image/gif'));
    expect(media.animated).toBe(true);
    expect([media.width, media.height]).toEqual([40, 30]);
    const meta = await sharp((await fetchMedia(media.url)).data, { animated: true }).metadata();
    expect(meta.pages).toBe(3);
  });
});

describe('M5 : photo de profil', () => {
  it('apparaît partout, est recadrée en carré et remplace l’ancienne', async () => {
    await boot();
    const a = await user('Ana');
    const b = await user('Bob');
    const first = await ok(upload<{ avatar: string }>(a, '/api/me/avatar', await photoWithExif(), 'image/jpeg'));
    const meta = await sharp((await fetchMedia(first.avatar)).data).metadata();
    expect([meta.width, meta.height]).toEqual([512, 512]);
    expect((await ok(call<{ profile: { avatar: string } }>(a, 'GET', '/api/me'))).profile.avatar).toBe(first.avatar);
    expect((await ok(call<PublicProfile>(b, 'GET', `/api/users/${a.id}`))).avatar).toBe(first.avatar);
    const search = await ok(call<{ players: { id: string; avatar: string | null }[] }>(b, 'GET', '/api/search?q=Ana'));
    expect(search.players.find((x) => x.id === a.id)?.avatar).toBe(first.avatar);

    const second = await ok(upload<{ avatar: string }>(a, '/api/me/avatar', await smallPng()));
    expect(second.avatar).not.toBe(first.avatar);
    expect((await fetchMedia(first.avatar)).status).toBe(404);
    expect(store.files.size).toBe(1);

    await ok(call(a, 'DELETE', '/api/me/avatar'));
    expect((await ok(call<PublicProfile>(b, 'GET', `/api/users/${a.id}`))).avatar).toBeNull();
    expect(store.files.size).toBe(0);
  });
});

describe('M5 : médias dans la messagerie', () => {
  it('photo avec légende, rattachée une seule fois, par son propriétaire seulement', async () => {
    await boot();
    const a = await user('Ana');
    const b = await user('Bob');
    const id = await conversation(a, b);
    const photo = await ok(upload(a, '/api/media?purpose=message', await smallPng()));
    const sent = await ok(call<MessageView>(a, 'POST', `/api/messages/${id}`, { mediaId: photo.id, text: 'Regarde mon score' }));
    expect(sent.kind).toBe('image');
    const seen = (await ok(call<ConversationDetail>(b, 'GET', `/api/messages/${id}`))).messages.at(-1)!;
    expect(seen.attachment).toEqual({ kind: 'image', media: photo });
    expect(seen.text).toBe('Regarde mon score');

    // Réutiliser le même média, ou celui de quelqu'un d'autre : refusé.
    expect((await call(a, 'POST', `/api/messages/${id}`, { mediaId: photo.id })).status).toBe(400);
    const other = await ok(upload(b, '/api/media?purpose=message', await smallPng()));
    expect((await call(a, 'POST', `/api/messages/${id}`, { mediaId: other.id })).status).toBe(400);
    // Une photo de publication ne peut pas être envoyée en message.
    const forPost = await ok(upload(a, '/api/media?purpose=post', await smallPng()));
    expect((await call(a, 'POST', `/api/messages/${id}`, { mediaId: forPost.id })).status).toBe(400);

    // Répondre à une photo : l'aperçu indique le type du message d'origine.
    const reply = await ok(call<MessageView>(b, 'POST', `/api/messages/${id}`, { text: 'Bien joué', replyToId: sent.id }));
    expect(reply.replyTo?.kind).toBe('image');
    // Boîte de réception : dernier message de type photo.
    await ok(call(a, 'POST', `/api/messages/${id}`, { mediaId: (await ok(upload(a, '/api/media', await smallPng()))).id }));
    const inbox = await ok(call<{ conversations: { lastMessage: { kind: string } }[] }>(b, 'GET', '/api/messages'));
    expect(inbox.conversations[0].lastMessage.kind).toBe('image');
  });

  it('stickers originaux : seuls ceux du pack sont acceptés, sans texte', async () => {
    await boot();
    const a = await user('Ana');
    const b = await user('Bob');
    const id = await conversation(a, b);
    const sent = await ok(call<MessageView>(a, 'POST', `/api/messages/${id}`, { stickerId: 'gg' }));
    expect(sent.attachment).toEqual({ kind: 'sticker', stickerId: 'gg' });
    expect((await call(a, 'POST', `/api/messages/${id}`, { stickerId: 'inconnu' })).status).toBe(400);
    expect((await call(a, 'POST', `/api/messages/${id}`, { stickerId: 'gg', text: 'salut' })).status).toBe(400);
    const photo = await ok(upload(a, '/api/media', await smallPng()));
    expect((await call(a, 'POST', `/api/messages/${id}`, { stickerId: 'gg', mediaId: photo.id })).status).toBe(400);
  });

  it('GIF : indisponible sans clé ; avec un fournisseur, seules ses adresses sont acceptées', async () => {
    await boot(null);
    let a = await user('Ana');
    let b = await user('Bob');
    let id = await conversation(a, b);
    expect(await ok(call(a, 'GET', '/api/gifs?q=bravo'))).toEqual({ available: false, gifs: [] });
    const gif = { id: 'g1', url: 'https://media1.giphy.com/media/g1/giphy.gif', width: 480, height: 270 };
    expect((await call(a, 'POST', `/api/messages/${id}`, { gif })).status).toBe(503);
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
    await db.close();

    await boot(stubGifs);
    a = await user('Ana');
    b = await user('Bob');
    id = await conversation(a, b);
    const found = await ok(call<{ available: boolean; gifs: GifView[] }>(a, 'GET', '/api/gifs?q=bravo'));
    expect(found.available).toBe(true);
    expect(found.gifs[0].title).toBe('bravo');
    const sent = await ok(call<MessageView>(a, 'POST', `/api/messages/${id}`, { gif }));
    expect(sent.attachment).toEqual({ kind: 'gif', gif });
    for (const bad of [
      { ...gif, url: 'https://evil.example.com/x.gif' },
      { ...gif, url: 'http://media1.giphy.com/media/g1/giphy.gif' },
      { ...gif, width: 0 },
      { ...gif, url: 'javascript:alert(1)' },
    ]) {
      expect((await call(a, 'POST', `/api/messages/${id}`, { gif: bad })).status).toBe(400);
    }
  });
});

describe('M5 : publications et nettoyage', () => {
  it('une publication peut ne contenir qu’une photo', async () => {
    await boot();
    const a = await user('Ana');
    const b = await user('Bob');
    const photo = await ok(upload(a, '/api/media?purpose=post', await smallPng()));
    const post = await ok(call<PostView>(a, 'POST', '/api/posts', { target: 'profile', mediaId: photo.id }));
    expect(post.text).toBe('');
    expect(post.media).toEqual(photo);
    const wall = await ok(call<{ posts: PostView[] }>(b, 'GET', `/api/users/${a.id}/posts`));
    expect(wall.posts[0].media?.url).toBe(photo.url);
    expect((await call(a, 'POST', '/api/posts', { target: 'profile', text: '' })).status).toBe(400);
  });

  it('supprime les médias jamais rattachés au bout de 24 h, pas les autres', async () => {
    await boot();
    const a = await user('Ana');
    const b = await user('Bob');
    const id = await conversation(a, b);
    const orphan = await ok(upload(a, '/api/media', await smallPng()));
    const used = await ok(upload(a, '/api/media', await smallPng()));
    await ok(call(a, 'POST', `/api/messages/${id}`, { mediaId: used.id }));
    await db.query("UPDATE media SET created_at = now() - interval '25 hours'");
    expect(await server.media.cleanupOrphans()).toBe(1);
    expect((await fetchMedia(orphan.url)).status).toBe(404);
    expect((await fetchMedia(used.url)).status).toBe(200);
  });

  it('limite le nombre d’envois', async () => {
    await boot();
    const a = await user('Ana');
    const png = await smallPng();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await upload(a, '/api/media', png)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
