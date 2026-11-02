import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

import type { ClientMessage, ServerMessage } from '@qu1z/shared';

const TOKEN_KEY = 'qu1z.token';
const MAX_BACKOFF_MS = 8_000;

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

/** Adresse du serveur de jeu : variable d'environnement, sinon la machine qui sert l'application. */
export function gameServerUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_GAME_SERVER_URL;
  if (fromEnv) return fromEnv;
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`;
  }
  return 'ws://localhost:8787';
}

/**
 * Connexion au serveur de jeu, avec reconnexion automatique (attente croissante, retour au premier
 * plan, retour du réseau). Le jeton du compte invité est gardé sur l'appareil ; la partie en cours,
 * elle, est retrouvée par le serveur à chaque reconnexion.
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private backoff = 500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private cleanups: (() => void)[] = [];

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onStatus: (status: ConnectionStatus) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') this.reconnectNow();
    });
    this.cleanups.push(() => sub.remove());
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const online = () => this.reconnectNow();
      window.addEventListener('online', online);
      this.cleanups.push(() => window.removeEventListener('online', online));
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    this.ws?.close();
  }

  /** Envoie un message si la connexion est ouverte. Hors connexion, rien n'est mis en attente. */
  send(message: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  reconnectNow(): void {
    if (this.stopped || this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.backoff = 500;
    this.open();
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    this.onStatus('connecting');
    const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
      ws.send(JSON.stringify({ type: 'hello', ...(token ? { token } : {}) } satisfies ClientMessage));
    };
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === 'welcome') {
        AsyncStorage.setItem(TOKEN_KEY, message.token).catch(() => {});
        this.onStatus('online');
      }
      this.onMessage(message);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus('offline');
      if (this.stopped) return;
      this.retryTimer = setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    };
    ws.onerror = () => ws.close();
  }
}
