import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { questionsOf } from '@qu1z/shared';

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
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await server.close();
  await db.close();
});

async function user(admin = false) {
  const client = await new TestClient(server.port).connect();
  clients.push(client);
  if (admin) await server.game.repo.setRole(client.playerId, 'admin');
  return client.token;
}

async function post(token: string, path: string, body: unknown) {
  const response = await fetch(`http://localhost:${server.port}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const THEME = 'logos-marques';
const URL = `/api/admin/themes/${THEME}/questions/import`;

describe('import de questions', () => {
  it('analyse, ignore doublons et lignes invalides, puis ajoute les questions au thème', async () => {
    const [player, admin] = await Promise.all([user(), user(true)]);
    const existing = questionsOf(THEME)[0].text;
    const questions = [
      { line: 1, text: 'Quelle marque a créé le Walkman test ?', choices: ['Sony', 'Philips', 'Panasonic', 'Sharp'] },
      { line: 2, text: existing, choices: ['a', 'b', 'c', 'd'] },
      { line: 3, text: 'Question sans réponses', choices: ['x'] },
      { line: 4, text: 'Doublon interne', choices: ['a', 'a', 'c', 'd'] },
    ];
    expect((await post(player, URL, { questions })).status).toBe(403);
    const before = questionsOf(THEME).length;

    const preview = await post(admin, URL, { questions, dryRun: true });
    expect(preview.body).toMatchObject({ valid: 1, duplicates: 1, added: 0 });
    expect((preview.body.invalid as unknown[]).length).toBe(2);
    expect(questionsOf(THEME).length).toBe(before);

    const done = await post(admin, URL, { questions });
    expect(done.body).toMatchObject({ added: 1, total: before + 1 });
    expect(questionsOf(THEME).some((q) => q.text.startsWith('Quelle marque a créé le Walkman test') && q.choices[0] === 'Sony')).toBe(true);

    // Réimporter le même fichier n'ajoute rien.
    expect((await post(admin, URL, { questions })).body).toMatchObject({ added: 0, duplicates: 2 });
  });
});
