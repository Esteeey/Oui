import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { UserSummary } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { hashToken } from '../src/game';
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
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300 });
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

/** Joueur connecté (pour les appels) avec un pseudo choisi. */
async function user(pseudo: string): Promise<U> {
  const c = await new TestClient(server.port).connect();
  clients.push(c);
  const u = { id: c.playerId, token: c.token };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

/** Joueurs créés directement en base (sans connexion), pour remplir Découvrir. */
async function bulk(n: number, prefix = 'Joueur'): Promise<string[]> {
  const repo = server.game.repo;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = await repo.createGuest(hashToken(`${prefix}-${i}-${Math.random()}`));
    await db.query('UPDATE profiles SET pseudo = $2 WHERE user_id = $1', [u.id, `${prefix}${String(i).padStart(2, '0')}`]);
    ids.push(u.id);
  }
  return ids;
}

const search = (u: U, q: string) =>
  ok(call<{ players: UserSummary[]; themes: { id: string }[] }>(u, 'GET', `/api/search?q=${encodeURIComponent(q)}`));
const discover = async (u: U) => (await ok(call<{ users: UserSummary[] }>(u, 'GET', '/api/discover'))).users;

describe('recherche globale', () => {
  it('joueurs : exact, puis début, puis contenu ; insensible à la casse', async () => {
    const me = await user('Moi');
    await user('Paulette');
    await user('Paul');
    await user('JeanPaul');
    const r = await search(me, 'PAUL');
    expect(r.players.map((p) => p.pseudo)).toEqual(['Paul', 'Paulette', 'JeanPaul']);
    expect(r.players[0]).toMatchObject({ level: 1 });
  });

  it('jamais un joueur bloqué (dans un sens ou l’autre) ni banni', async () => {
    const me = await user('Moi');
    const a = await user('Pierre');
    const b = await user('Pierrot');
    const c = await user('Pierrick');
    await ok(call(me, 'POST', '/api/blocks', { userId: a.id }));
    await ok(call(b, 'POST', '/api/blocks', { userId: me.id }));
    await server.game.repo.setStatus(c.id, 'banned');
    expect((await search(me, 'pierr')).players).toEqual([]);
  });

  it('thèmes par nom ou catégorie, sans tenir compte des accents', async () => {
    const me = await user('Moi');
    expect((await search(me, 'geographie')).themes.map((t) => t.id).sort()).toEqual(['geo-capitales', 'geo-drapeaux']);
    expect((await search(me, 'olymp')).themes.map((t) => t.id)).toEqual(['sports-jo']);
  });

  it('requête vide ou caractères spéciaux : sans erreur ni joker', async () => {
    const me = await user('Moi');
    await user('Abc');
    expect(await search(me, '   ')).toEqual({ players: [], themes: [] });
    expect((await search(me, '%')).players).toEqual([]);
    expect((await search(me, "'; DROP TABLE users; --")).players).toEqual([]);
  });

  it('API protégée', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/search?q=a`);
    expect(res.status).toBe(401);
  });
});

describe('suggestions de mentions', () => {
  it('début de pseudo, sans soi-même ni joueur bloqué ; les abonnements d’abord', async () => {
    const me = await user('Marc');
    const blocked = await user('Martin');
    await user('Marie');
    const followed = await user('Marius');
    await ok(call(blocked, 'POST', '/api/blocks', { userId: me.id }));
    await ok(call(me, 'POST', `/api/users/${followed.id}/follow`));
    const r = await ok(call<{ users: UserSummary[] }>(me, 'GET', '/api/search/mentions?q=@mar'));
    expect(r.users.map((u) => u.pseudo)).toEqual(['Marius', 'Marie']);
  });
});

describe('Découvrir', () => {
  it('12 suggestions au plus, sans soi-même, ni abonnements, ni demandes, ni blocages, ni bannis', async () => {
    const me = await user('Moi');
    const ids = await bulk(20);
    await ok(call(me, 'POST', `/api/users/${ids[0]}/follow`));
    await ok(call(me, 'POST', '/api/blocks', { userId: ids[1] }));
    await server.game.repo.setStatus(ids[2], 'banned');
    await db.query('UPDATE profiles SET is_private = true WHERE user_id = $1', [ids[3]]);
    await ok(call(me, 'POST', `/api/users/${ids[3]}/follow`)); // demande envoyée
    const list = await discover(me);
    expect(list).toHaveLength(12);
    const shown = new Set(list.map((u) => u.id));
    for (const excluded of [me.id, ids[0], ids[1], ids[2], ids[3]]) expect(shown.has(excluded)).toBe(false);
    expect(Object.keys(list[0]).sort()).toEqual(['avatar', 'id', 'level', 'pseudo', 'title']);
  });

  it('mélange personnalisé et hasard ; les thèmes en commun comptent', async () => {
    const me = await user('Moi');
    const ids = await bulk(30);
    await db.query('INSERT INTO theme_subscriptions (user_id, theme_id) VALUES ($1, $2)', [me.id, 'sports-jo']);
    const fans = ids.slice(0, 5);
    for (const id of fans) await db.query('INSERT INTO theme_subscriptions (user_id, theme_id) VALUES ($1, $2)', [id, 'sports-jo']);
    await discover(me);
    const kinds = await db.query<{ kind: string; suggested_id: string }>('SELECT kind, suggested_id FROM discover_suggestions WHERE user_id = $1', [me.id]);
    expect(kinds.filter((k) => k.kind === 'personalized')).toHaveLength(8);
    expect(kinds.filter((k) => k.kind === 'random')).toHaveLength(4);
    const personalized = new Set(kinds.filter((k) => k.kind === 'personalized').map((k) => k.suggested_id));
    for (const id of fans) expect(personalized.has(id)).toBe(true);
  });

  it('renouvellement progressif : liste stable, puis 3 profils remplacés après une heure, sans revoir les anciens', async () => {
    const me = await user('Moi');
    await bulk(40);
    const first = (await discover(me)).map((u) => u.id);
    const again = (await discover(me)).map((u) => u.id);
    expect(new Set(again)).toEqual(new Set(first));

    await db.query("UPDATE discover_suggestions SET added_at = added_at - interval '2 hours' WHERE user_id = $1", [me.id]);
    const later = (await discover(me)).map((u) => u.id);
    const removed = first.filter((id) => !later.includes(id));
    const added = later.filter((id) => !first.includes(id));
    expect(later).toHaveLength(12);
    expect(removed).toHaveLength(3);
    expect(added).toHaveLength(3);
    // Les nouveaux venus n'avaient jamais été proposés.
    for (const id of added) expect(first.includes(id)).toBe(false);
  });

  it('suivre un profil suggéré le retire de la liste', async () => {
    const me = await user('Moi');
    await bulk(15);
    const list = await discover(me);
    await ok(call(me, 'POST', `/api/users/${list[0].id}/follow`));
    expect((await discover(me)).map((u) => u.id)).not.toContain(list[0].id);
  });

  it('peu de joueurs : on propose ce qui existe, sans erreur', async () => {
    const me = await user('Moi');
    await bulk(2);
    expect(await discover(me)).toHaveLength(2);
  });
});
