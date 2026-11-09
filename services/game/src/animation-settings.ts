import { DUEL_INVITE_DEFAULTS, normalizeDuelInviteAnimation, type DuelInviteAnimation } from '@qu1z/shared';

import type { Database } from './db/database';
import { writeLog } from './moderation-log';
import { SocialError } from './social';

const DUEL_INVITE = 'duelInvite';

/** Réglages des animations, modifiables par les administrateurs et lus par tous les joueurs. */
export class AnimationSettings {
  constructor(private readonly db: Database) {}

  private async requireAdmin(userId: string): Promise<void> {
    const [u] = await this.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (u?.role !== 'admin') throw new SocialError(403, 'forbidden');
  }

  private requireKnown(id: string): void {
    if (id !== DUEL_INVITE) throw new SocialError(404, 'not_found');
  }

  async read(): Promise<{ duelInvite: DuelInviteAnimation; customized: boolean }> {
    const [row] = await this.db.query<{ value: string }>('SELECT value FROM animation_settings WHERE id = $1', [DUEL_INVITE]);
    if (!row) return { duelInvite: DUEL_INVITE_DEFAULTS, customized: false };
    return { duelInvite: normalizeDuelInviteAnimation(JSON.parse(row.value)), customized: true };
  }

  async update(admin: string, id: string, raw: unknown): Promise<{ duelInvite: DuelInviteAnimation; customized: boolean }> {
    await this.requireAdmin(admin);
    this.requireKnown(id);
    const value = normalizeDuelInviteAnimation(raw);
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO animation_settings (id, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
        [id, JSON.stringify(value), admin],
      );
      await writeLog(tx, { actorId: admin, actorRole: 'admin', action: 'animation_updated', targetType: 'animation', targetId: null, details: { animation: id } });
    });
    return { duelInvite: value, customized: true };
  }

  async reset(admin: string, id: string): Promise<{ duelInvite: DuelInviteAnimation; customized: boolean }> {
    await this.requireAdmin(admin);
    this.requireKnown(id);
    await this.db.transaction(async (tx) => {
      const rows = await tx.query('DELETE FROM animation_settings WHERE id = $1 RETURNING id', [id]);
      if (rows.length) await writeLog(tx, { actorId: admin, actorRole: 'admin', action: 'animation_reset', targetType: 'animation', targetId: null, details: { animation: id } });
    });
    return { duelInvite: DUEL_INVITE_DEFAULTS, customized: false };
  }
}
