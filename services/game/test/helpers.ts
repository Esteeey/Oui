import { WebSocket } from 'ws';

import type { ClientMessage, DuelSnapshot, ServerMessage } from '@qu1z/shared';

import type { Timing } from '../src/duel';

/** Durées raccourcies : un duel complet dure environ 3 s. */
export const FAST: Timing = {
  introMs: 60,
  answerMs: 250,
  revealMs: 60,
  readingMs: () => 60,
  latencyGraceMs: 20,
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Client de test : enregistre tous les messages reçus et permet d'attendre une condition. */
export class TestClient {
  ws!: WebSocket;
  messages: ServerMessage[] = [];
  playerId = '';
  token = '';

  constructor(private readonly port: number) {}

  async connect(token?: string): Promise<this> {
    this.ws = new WebSocket(`ws://localhost:${this.port}`);
    this.ws.on('message', (raw) => this.messages.push(JSON.parse(String(raw))));
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
    this.send({ type: 'hello', token });
    const welcome = await this.waitFor((m) => m.type === 'welcome');
    if (welcome.type === 'welcome') {
      this.playerId = welcome.playerId;
      this.token = welcome.token;
    }
    return this;
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((r) => this.ws.once('close', () => r()));
    this.ws.close();
    await closed;
  }

  /** Attend un message reçu APRÈS l'appel (ou depuis `fromIndex`). */
  async waitFor(predicate: (m: ServerMessage) => boolean, timeoutMs = 4000, fromIndex?: number): Promise<ServerMessage> {
    const start = fromIndex ?? this.messages.length;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.slice(start).find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error('Message attendu non reçu');
      await sleep(5);
    }
  }

  async waitForDuel(predicate: (s: DuelSnapshot) => boolean, timeoutMs = 4000, fromIndex?: number): Promise<DuelSnapshot> {
    const m = await this.waitFor((x) => x.type === 'duel' && predicate(x.snapshot), timeoutMs, fromIndex);
    return (m as Extract<ServerMessage, { type: 'duel' }>).snapshot;
  }

  lastDuel(): DuelSnapshot | undefined {
    const m = [...this.messages].reverse().find((x) => x.type === 'duel');
    return m?.type === 'duel' ? m.snapshot : undefined;
  }
}
