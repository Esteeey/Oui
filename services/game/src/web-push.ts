import webpush, { type PushSubscription } from 'web-push';

import type { Database } from './db/database';
import { SocialError } from './social';

/** Web Push navigateur, activé uniquement si les trois variables VAPID sont configurées côté serveur. */
export class WebPush {
  readonly publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '';
  private readonly privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? '';
  private readonly subject = process.env.WEB_PUSH_VAPID_SUBJECT ?? 'mailto:admin@example.invalid';

  constructor(private readonly db: Database, private readonly isForeground: (id: string) => boolean) {
    if (this.publicKey && this.privateKey) webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
  }

  async register(userId: string, value: unknown, userAgent: string | null): Promise<void> {
    if (!this.publicKey || !this.privateKey) throw new SocialError(503, 'web_push_unconfigured');
    if (!value || typeof value !== 'object') throw new SocialError(400, 'invalid_subscription');
    const sub = value as Partial<PushSubscription>;
    if (typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys?.p256dh || !sub.keys.auth) {
      throw new SocialError(400, 'invalid_subscription');
    }
    await this.db.query(`INSERT INTO web_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4, user_agent = $5, updated_at = now()`,
      [sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 500) ?? null]);
  }

  async remove(userId: string, endpoint: string): Promise<void> {
    await this.db.query('DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
  }

  async notify(userId: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this.publicKey || !this.privateKey || this.isForeground(userId)) return false;
    const [prefs] = await this.db.query<{ prefs: Record<string, unknown> }>('SELECT prefs FROM notification_preferences WHERE user_id = $1', [userId]);
    if (prefs?.prefs?.duelInvites === false) return false;
    const subscriptions = await this.db.query<{ endpoint: string; p256dh: string; auth: string }>(
      'SELECT endpoint, p256dh, auth FROM web_push_subscriptions WHERE user_id = $1', [userId]);
    const results = await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 120, urgency: 'high' });
        return true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.db.query('DELETE FROM web_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        else console.warn('Web Push indisponible', status ?? error);
        return false;
      }
    }));
    return results.some(Boolean);
  }
}
