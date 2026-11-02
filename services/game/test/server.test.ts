import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { DuelSnapshot } from '@qu1z/shared';

import { openDatabase, type Database } from '../src/db/database';
import { Repo } from '../src/repo';
import { startServer, type GameServer } from '../src/server';
import { FAST, TestClient, sleep } from './helpers';

const THEME = 'geo-capitales';
let server: GameServer;
let db: Database | null = null;
const clients: TestClient[] = [];

/** Démarre un serveur sur une base PostgreSQL embarquée neuve (ou sur un dossier existant). */
async function boot(dataDir?: string): Promise<GameServer> {
  db = await openDatabase(dataDir ? { dataDir } : {});
  server = await startServer(0, { repo: new Repo(db), timing: FAST, matchTimeoutMs: 300 });
  return server;
}

async function stop(): Promise<void> {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server?.close();
  await db?.close();
  db = null;
}

const xpOf = async (id: string) => (await server.game.profile(id)).xp;

async function client(token?: string): Promise<TestClient> {
  const c = await new TestClient(server.port).connect(token);
  clients.push(c);
  return c;
}

/** Fait répondre un client automatiquement : `pick` choisit la réponse à partir de la bonne. */
function autoPlay(c: TestClient, pick: (index: number, correct: number) => number | null): () => void {
  const answered = new Set<string>();
  const timer = setInterval(() => {
    const snap = c.lastDuel();
    if (!snap || snap.phase !== 'answering' || snap.myChoice !== null) return;
    const key = `${snap.duelId}:${snap.index}`;
    if (answered.has(key)) return;
    answered.add(key);
    const correct = server.game.getDuel(snap.duelId)!.state.questions[snap.index].correctIndex;
    const choice = pick(snap.index, correct);
    if (choice !== null) c.send({ type: 'answer', duelId: snap.duelId, index: snap.index, choice });
  }, 5);
  return () => clearInterval(timer);
}

const right = (_i: number, correct: number) => correct;
const wrong = (_i: number, correct: number) => (correct + 1) % 4;

async function startPvp(): Promise<{ a: TestClient; b: TestClient; duelId: string }> {
  const a = await client();
  const b = await client();
  a.send({ type: 'play', themeId: THEME, mode: 'pvp' });
  await a.waitFor((m) => m.type === 'queued');
  b.send({ type: 'play', themeId: THEME, mode: 'pvp' });
  const snap = await a.waitForDuel(() => true, 4000, 0);
  return { a, b, duelId: snap.duelId };
}

const finished = (s: DuelSnapshot) => s.phase === 'finished' && s.result !== null;

afterEach(async () => {
  await stop();
});

describe('récompenses XP (calculées par le serveur)', () => {
  it('gagnant : +20 fin +40 victoire ; perdant : +20 fin ; XP du compte mise à jour', async () => {
    await boot();
    const { a, b } = await startPvp();
    const stopA = autoPlay(a, right);
    const stopB = autoPlay(b, wrong);
    const ra = await a.waitForDuel(finished, 8000, 0);
    const rb = await b.waitForDuel(finished, 8000, 0);
    stopA();
    stopB();
    expect(ra.result!.outcome).toBe('win');
    expect(ra.result!.rewards).toEqual({ finishBonus: 20, victoryBonus: 40, boostBonus: 100, total: 160 });
    expect(rb.result!.outcome).toBe('loss');
    expect(rb.result!.rewards).toEqual({ finishBonus: 20, victoryBonus: 0, boostBonus: 0, total: 20 });
    expect(await xpOf(a.playerId)).toBe(160);
    expect(await xpOf(b.playerId)).toBe(20);
    expect(ra.result!.accountXpBefore).toBe(0);
    expect(ra.result!.accountXpAfter).toBe(160);
  });

  it('chaque joueur se voit en « me » : perspective inversée, mêmes données', async () => {
    await boot();
    const { a, b } = await startPvp();
    const stopA = autoPlay(a, right);
    const stopB = autoPlay(b, wrong);
    const sa = await a.waitForDuel((s) => s.phase === 'reveal', 4000, 0);
    const sb = await b.waitForDuel((s) => s.phase === 'reveal' && s.index === sa.index, 4000, 0);
    stopA();
    stopB();
    expect(sa.me.id).toBe(a.playerId);
    expect(sa.opponent.id).toBe(b.playerId);
    expect(sb.me.id).toBe(b.playerId);
    expect(sb.opponent.id).toBe(a.playerId);
    expect(sa.me.points).toBe(sb.opponent.points);
    expect(sa.myChoice).toBe(sb.opponentChoice);
  });

  it('abandon volontaire : aucun XP pour l’abandonnant, victoire pour l’autre', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    await a.waitForDuel((s) => s.phase === 'reading', 4000, 0);
    a.send({ type: 'forfeit', duelId });
    const ra = await a.waitForDuel(finished, 4000, 0);
    const rb = await b.waitForDuel(finished, 4000, 0);
    expect(ra.result!.outcome).toBe('loss');
    expect(ra.result!.rewards.total).toBe(0);
    expect(rb.result!.outcome).toBe('win');
    expect(rb.result!.rewards).toMatchObject({ finishBonus: 20, victoryBonus: 40 });
    expect(await xpOf(a.playerId)).toBe(0);
  });

  it('récompenses versées une seule fois, même si on redemande', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    const stopA = autoPlay(a, right);
    const stopB = autoPlay(b, right);
    await a.waitForDuel(finished, 8000, 0);
    stopA();
    stopB();
    const xp = await xpOf(a.playerId);
    const duel = server.game.getDuel(duelId)!;
    // Demandes répétées, y compris simultanées : la base n'accepte qu'un versement.
    await Promise.all([server.game.grantRewards(duel, 0), server.game.grantRewards(duel, 0), server.game.grantRewards(duel, 1)]);
    expect(await xpOf(a.playerId)).toBe(xp);
    expect(await server.game.repo.rewardedCount(duelId, a.playerId)).toBe(1);
    // Reconnexions et accusés de réception répétés : toujours aucun nouveau versement.
    for (let i = 0; i < 3; i++) {
      const again = await client(a.token);
      again.send({ type: 'ackResult', duelId });
      await sleep(20);
    }
    expect(await xpOf(a.playerId)).toBe(xp);
  });

  it('le client ne peut ni fixer l’XP ni le temps de réponse', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    a.send({ type: 'grantXp', amount: 99999 });
    a.send({ type: 'finish', duelId, xp: 99999 });
    const stopB = autoPlay(b, wrong);
    const answered = new Set<number>();
    const timer = setInterval(() => {
      const s = a.lastDuel();
      if (!s || s.phase !== 'answering' || answered.has(s.index)) return;
      answered.add(s.index);
      const correct = server.game.getDuel(s.duelId)!.state.questions[s.index].correctIndex;
      // Champs frauduleux ignorés : seul le temps mesuré par le serveur compte.
      a.send({ type: 'answer', duelId, index: s.index, choice: correct, responseMs: 0, points: 1000, xp: 5000 });
    }, 5);
    const ra = await a.waitForDuel(finished, 8000, 0);
    clearInterval(timer);
    stopB();
    expect(ra.result!.rewards.total).toBe(160);
    expect(await xpOf(a.playerId)).toBe(160);
    expect(ra.me.answers.every((x) => x.responseMs > 0)).toBe(true);
  });

  it('réponse en double ignorée ; réponse après la fin du chrono refusée', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    const s = await a.waitForDuel((x) => x.phase === 'answering', 4000, 0);
    const correct = server.game.getDuel(duelId)!.state.questions[s.index].correctIndex;
    a.send({ type: 'answer', duelId, index: s.index, choice: correct });
    a.send({ type: 'answer', duelId, index: s.index, choice: (correct + 1) % 4 });
    await sleep(30);
    expect(server.game.getDuel(duelId)!.state.answers[0][s.index]!.choice).toBe(correct);
    // B ne répond pas : après le chrono et la tolérance, sa réponse est refusée.
    await sleep(FAST.answerMs + FAST.latencyGraceMs + 40);
    b.send({ type: 'answer', duelId, index: s.index, choice: correct });
    await sleep(30);
    expect(server.game.getDuel(duelId)!.state.answers[1][s.index]!.choice).toBeNull();
  });
});

describe('déconnexions et reconnexions', () => {
  it('1-2. déconnexion pendant une question, reconnexion sur la même question sans temps en plus', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    const s = await b.waitForDuel((x) => x.phase === 'answering', 4000, 0);
    await b.close();
    await sleep(30);
    expect(a.lastDuel()!.opponent.connected).toBe(false);
    const b2 = await client(b.token);
    const back = await b2.waitForDuel(() => true, 2000, 0);
    expect(back.duelId).toBe(duelId);
    expect(back.index).toBe(s.index);
    expect(back.phase).toBe('answering');
    expect(back.phaseEndsAt).toBe(s.phaseEndsAt);
    expect(back.me.connected).toBe(true);
  });

  it('3-4. déconnexion entre deux questions, retour plusieurs questions plus tard, réponses conservées', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    const stopA = autoPlay(a, right);
    const stopB = autoPlay(b, right);
    await b.waitForDuel((x) => x.phase === 'reveal' && x.index === 0, 4000, 0);
    stopB();
    await b.close();
    await a.waitForDuel((x) => x.phase === 'reveal' && x.index === 3, 6000, 0);
    const b2 = await client(b.token);
    const back = await b2.waitForDuel(() => true, 2000, 0);
    stopA();
    expect(back.duelId).toBe(duelId);
    expect(back.index).toBeGreaterThanOrEqual(3);
    expect(back.me.answers[0].correct).toBe(true);
    expect(back.me.answers.slice(1, 4).every((x) => x.choice === null)).toBe(true);
  });

  it('5. fermeture complète puis réouverture : on retrouve le duel grâce au serveur', async () => {
    await boot();
    const { b, duelId } = await startPvp();
    const token = b.token;
    await b.close();
    const fresh = await client(token);
    const back = await fresh.waitForDuel(() => true, 2000, 0);
    expect(back.duelId).toBe(duelId);
  });

  it('6. déconnexion prolongée : le duel continue pour l’adversaire jusqu’au bout', async () => {
    await boot();
    const { a, b } = await startPvp();
    await b.close();
    const stopA = autoPlay(a, right);
    const ra = await a.waitForDuel(finished, 8000, 0);
    stopA();
    expect(ra.index).toBe(6);
    expect(ra.result!.outcome).toBe('win');
    expect(ra.result!.rewards).toMatchObject({ finishBonus: 20, victoryBonus: 40 });
  });

  it('7-8. coupures successives : pas de réinitialisation ni de doublon', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    let current = b;
    const stopA = autoPlay(a, right);
    for (let i = 0; i < 4; i++) {
      await current.close();
      await sleep(40);
      current = await client(b.token);
      const snap = await current.waitForDuel(() => true, 2000, 0);
      expect(snap.duelId).toBe(duelId);
    }
    stopA();
    const state = server.game.getDuel(duelId)!.state;
    expect(state.participants[1].connected).toBe(true);
    expect(state.answers[0].filter(Boolean).length).toBeGreaterThan(0);
  });

  it('9-10. duel terminé pendant la déconnexion : résultats retrouvés au retour, sans bonus de fin', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    const stopB = autoPlay(b, right);
    await b.waitForDuel((x) => x.phase === 'reveal' && x.index === 1, 4000, 0);
    stopB();
    await b.close();
    const stopA = autoPlay(a, wrong);
    await a.waitForDuel(finished, 8000, 0);
    stopA();
    const b2 = await client(b.token);
    const back = await b2.waitForDuel(finished, 2000, 0);
    expect(back.duelId).toBe(duelId);
    expect(back.result!.finished).toBe(false);
    expect(back.result!.rewards.finishBonus).toBe(0);
    expect(back.result!.rewards.victoryBonus).toBe(0);
    expect(back.result!.rewards.boostBonus).toBe(20);
    // Une fois les résultats vus, on ne les renvoie plus à la connexion suivante.
    b2.send({ type: 'ackResult', duelId });
    await sleep(30);
    const b3 = await client(b.token);
    await sleep(80);
    expect(b3.messages.some((m) => m.type === 'duel')).toBe(false);
  });

  it('redémarrage du serveur : le duel enregistré reprend', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'qu1z-')), 'pg');
    await boot(dir);
    const { b, duelId } = await startPvp();
    await b.waitForDuel((x) => x.phase === 'reading', 4000, 0);
    const token = b.token;
    await stop();
    await boot(dir);
    const b2 = await client(token);
    const back = await b2.waitForDuel(() => true, 2000, 0);
    expect(back.duelId).toBe(duelId);
    expect(back.phase).not.toBe('intro');
  });
});

describe('duel contre le bot et chat', () => {
  it('le bot répond tout seul et le duel se termine avec les récompenses', async () => {
    await boot();
    const a = await client();
    a.send({ type: 'play', themeId: THEME, mode: 'bot' });
    const stop = autoPlay(a, right);
    const r = await a.waitForDuel(finished, 8000, 0);
    stop();
    expect(r.opponent.name).toBe("Bot d'entraînement");
    expect(r.opponent.isBot).toBe(true);
    expect(r.result!.rewards.finishBonus).toBe(20);
  });

  it('sans adversaire réel, le matchmaking bascule sur le bot', async () => {
    await boot();
    const a = await client();
    a.send({ type: 'play', themeId: THEME, mode: 'pvp' });
    const s = await a.waitForDuel(() => true, 2000, 0);
    expect(s.opponent.isBot).toBe(true);
  });

  it('chat réservé aux deux joueurs d’un duel entre joueurs réels', async () => {
    await boot();
    const { a, b, duelId } = await startPvp();
    a.send({ type: 'chat', duelId, text: 'Bien joué !' });
    const m = await b.waitFor((x) => x.type === 'chat', 2000, 0);
    expect(m.type === 'chat' && m.messages[0].text).toBe('Bien joué !');
    const intruder = await client();
    intruder.send({ type: 'chat', duelId, text: 'spam' });
    await sleep(40);
    expect(await server.game.repo.duelChat(duelId)).toHaveLength(1);
  });
});
