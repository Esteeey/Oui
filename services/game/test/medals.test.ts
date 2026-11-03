import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EarnedMedal, LeaderboardRow } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
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

async function user(pseudo: string): Promise<U> {
  const c = await new TestClient(server.port).connect();
  clients.push(c);
  const u = { id: c.playerId, token: c.token };
  await ok(call(u, 'PATCH', '/api/me/profile', { pseudo }));
  return u;
}

const answer = (correct: boolean, responseMs = 3_000) => ({ choice: correct ? 0 : 1, responseMs, correct, points: correct ? 14 : 0 });

/** Duel enregistré directement en base, à la date voulue (expression SQL, maintenant par défaut). */
async function playedDuel(
  userId: string,
  o: { themeId?: string; outcome?: 'win' | 'loss' | 'draw'; opponentId?: string | null; player?: ReturnType<typeof answer>[]; xp?: number; at?: string },
) {
  const id = randomUUID();
  const themeId = o.themeId ?? 'geo-capitales';
  const record = {
    id,
    playedAt: Date.now(),
    themeId,
    opponentId: o.opponentId ?? null,
    opponentName: 'Adversaire',
    opponentIsBot: !o.opponentId,
    questions: [],
    player: o.player ?? [answer(true), answer(false)],
    opponent: [],
    outcome: o.outcome ?? 'loss',
    xpBefore: 0,
    xpGained: o.xp ?? 20,
    ratingBefore: 1000,
    ratingDelta: 0,
  };
  const result = { outcome: record.outcome, finished: true, forfeited: false, rewards: { total: o.xp ?? 20 }, accountXpBefore: 0, accountXpAfter: 0, record };
  await db.query("INSERT INTO duels (id, theme_id, mode, state, finished_at) VALUES ($1, $2, 'bot', '{}', now())", [id, themeId]);
  await db.query(`INSERT INTO duel_results (duel_id, user_id, result, xp_awarded, created_at) VALUES ($1, $2, $3, $4, ${o.at ?? 'now()'})`, [
    id,
    userId,
    result,
    o.xp ?? 20,
  ]);
}

const medalsOf = (viewer: U, target: U) => call<{ medals: EarnedMedal[] }>(viewer, 'GET', `/api/users/${target.id}/medals`);

describe('médailles', () => {
  it('gagnées d’après l’historique, datées du duel qui les débloque', async () => {
    const me = await user('Moi');
    const rival = await user('Rival');
    // Quelques minutes d'écart seulement : rester dans la saison en cours, quel que soit le jour du mois.
    await playedDuel(me.id, { outcome: 'loss', at: "now() - interval '3 minutes'" });
    await playedDuel(me.id, { outcome: 'win', player: [answer(true, 800), answer(true)], at: "now() - interval '2 minutes'" });
    await playedDuel(me.id, { outcome: 'win', themeId: 'geo-drapeaux' });
    await playedDuel(me.id, { outcome: 'win', themeId: 'cg-melange', opponentId: rival.id });

    const { medals } = await ok(medalsOf(me, me));
    expect(medals.map((m) => m.id).sort()).toEqual(['eclair', 'explorateur', 'premier-duel', 'revanche', 'sans-faute', 'serie', 'victoire']);
    const at = (id: string) => medals.find((m) => m.id === id)!.earnedAt;
    expect(at('premier-duel')).toBeLessThan(at('victoire'));
    expect(at('victoire')).toBe(at('sans-faute'));
    // Relire ne duplique rien.
    expect((await ok(medalsOf(me, me))).medals).toHaveLength(7);
  });

  it('visibles comme le reste du profil : privé pour les non-abonnés, introuvable en cas de blocage', async () => {
    const me = await user('Moi');
    const other = await user('Autre');
    const blocker = await user('Bloqueur');
    await playedDuel(other.id, { outcome: 'win' });
    expect((await ok(medalsOf(me, other))).medals.map((m) => m.id).sort()).toEqual(['premier-duel', 'victoire']);

    await ok(call(other, 'PATCH', '/api/me/profile', { isPrivate: true }));
    expect((await medalsOf(me, other)).status).toBe(403);
    expect((await ok(medalsOf(other, other))).medals).toHaveLength(2);

    await ok(call(blocker, 'POST', '/api/blocks', { userId: me.id }));
    expect((await medalsOf(me, blocker)).status).toBe(404);
  });
});

describe('saisons', () => {
  const lastMonth = "date_trunc('month', now()) - interval '10 days'";

  it('fin de saison : podium des 3 meilleurs en XP du mois, sans bannis, attribué une seule fois', async () => {
    const [a, b, c, d, banned] = await Promise.all(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Banni'].map(user));
    for (const [u, xp] of [
      [a, 300],
      [b, 200],
      [c, 100],
      [d, 50],
      [banned, 1000],
    ] as const) {
      await playedDuel(u.id, { xp, at: lastMonth });
    }
    // Une partie ce mois-ci ne compte pas pour la saison passée.
    await playedDuel(d.id, { xp: 5000 });
    await server.game.repo.setStatus(banned.id, 'banned');

    const season = (u: U) => medalsOf(u, u).then((r) => r.body.medals.find((m) => m.id.startsWith('season:'))?.season?.rank ?? null);
    expect(await season(a)).toBe(1);
    expect(await season(b)).toBe(2);
    expect(await season(c)).toBe(3);
    expect(await season(d)).toBeNull();
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM user_medals WHERE medal_id LIKE 'season:%'");
    expect(n).toBe(3);
  });

  it('classement de saison : XP gagnée ce mois-ci, par thème, sans bloqués', async () => {
    const me = await user('Moi');
    const top = await user('Champion');
    const blocked = await user('Bloque');
    await playedDuel(me.id, { xp: 40 });
    await playedDuel(top.id, { xp: 90 });
    await playedDuel(top.id, { xp: 500, at: lastMonth }); // saison passée
    await playedDuel(top.id, { xp: 70, themeId: 'cg-melange' });
    await playedDuel(blocked.id, { xp: 999 });
    await ok(call(me, 'POST', '/api/blocks', { userId: blocked.id }));

    type Board = { rows: LeaderboardRow[]; season: { id: string; name: string } };
    const all = await ok(call<Board>(me, 'GET', '/api/leaderboard?period=season'));
    expect(all.rows.map((r) => [r.user.pseudo, r.rating])).toEqual([
      ['Champion', 160],
      ['Moi', 40],
    ]);
    expect(all.season.id).toMatch(/^\d{4}-\d{2}$/);
    const theme = await ok(call<Board>(me, 'GET', '/api/leaderboard?period=season&theme=geo-capitales'));
    expect(theme.rows.map((r) => [r.user.pseudo, r.rating])).toEqual([
      ['Champion', 90],
      ['Moi', 40],
    ]);
  });
});
