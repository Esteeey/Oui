import type { Database } from './db/database';
import { SocialError } from './social';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  /** Canal Android : les messages sont séparés des notifications communautaires. */
  channelId: 'messages' | 'community';
  sound?: 'default' | null;
  vibrate?: number[];
}

/** Envoi des notifications push. Renvoie les jetons à supprimer (appareil désinscrit). */
export interface PushSender {
  readonly name: string;
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

export class MemoryPushSender implements PushSender {
  readonly name = 'memory';
  readonly sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return { invalidTokens: messages.map((m) => m.to).filter((t) => this.invalid.has(t)) };
  }
}

/** Service push d'Expo (APNs et FCM). EXPO_ACCESS_TOKEN si la sécurité renforcée est activée sur le projet. */
export class ExpoPushSender implements PushSender {
  readonly name = 'expo';
  constructor(private readonly accessToken?: string) {}
  async send(messages: PushMessage[]) {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => ({ ...m, sound: m.sound === undefined ? 'default' : m.sound, priority: 'high' }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Expo push ${res.status}`);
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (json.data ?? []).forEach((ticket, k) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(chunk[k].to);
      });
    }
    return { invalidTokens };
  }
}

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

/**
 * Notifications push : jetons par appareil, envoi seulement aux joueurs qui ne sont pas dans l'application
 * (pas de doublon avec le temps réel), nettoyage des appareils désinscrits. Un échec d'envoi ne fait jamais
 * échouer l'action qui le déclenche.
 */
export class Push {
  constructor(
    private readonly db: Database,
    private readonly sender: PushSender | null,
    private readonly isOnline: (userId: string) => boolean,
    private readonly isForeground: (userId: string) => boolean = isOnline,
  ) {}

  async register(userId: string, token: unknown, platform: unknown): Promise<void> {
    if (typeof token !== 'string' || !EXPO_TOKEN.test(token)) throw new SocialError(400, 'invalid_push_token');
    const p = platform === 'ios' ? 'ios' : 'android';
    // Un appareil appartient au dernier compte qui s'y est connecté.
    await this.db.query(
      `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $2, platform = $3, last_seen_at = now()`,
      [token, userId, p],
    );
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.db.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, userId]);
  }

  async removeAll(userId: string): Promise<void> {
    await this.db.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
  }

  /** Envoie à chaque destinataire hors ligne (comptes bannis exclus). */
  async notify(userIds: string[], build: (userId: string) => Promise<Omit<PushMessage, 'to'> | null>, foregroundOnly = false): Promise<boolean> {
    if (!this.sender) return false;
    try {
      const offline = userIds.filter((id) => foregroundOnly ? !this.isForeground(id) : !this.isOnline(id));
      if (!offline.length) return false;
      const tokens = await this.db.query<{ token: string; user_id: string }>(
        `SELECT t.token, t.user_id FROM push_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.user_id = ANY($1::uuid[]) AND u.status <> 'banned'`,
        [offline],
      );
      if (!tokens.length) return false;
      const messages: PushMessage[] = [];
      const cache = new Map<string, Omit<PushMessage, 'to'> | null>();
      for (const t of tokens) {
        if (!cache.has(t.user_id)) cache.set(t.user_id, await build(t.user_id));
        const m = cache.get(t.user_id);
        if (m) messages.push({ ...m, to: t.token });
      }
      if (!messages.length) return false;
      const { invalidTokens } = await this.sender.send(messages);
      if (invalidTokens.length) await this.db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [invalidTokens]);
      return true;
    } catch (err) {
      console.error('Push', err);
      return false;
    }
  }
}
