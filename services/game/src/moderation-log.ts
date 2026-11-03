import { randomUUID } from 'node:crypto';

import type { Queryable } from './db/database';

export type ActorRole = 'moderator' | 'admin' | 'group_admin' | 'group_creator';

/** Écrit une entrée dans le journal interne de modération (jamais visible des joueurs). */
export async function writeLog(
  q: Queryable,
  entry: { actorId: string | null; actorRole: ActorRole; action: string; targetType: string; targetId: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await q.query(
    'INSERT INTO moderation_log (id, actor_id, actor_role, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [randomUUID(), entry.actorId, entry.actorRole, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.details ?? {})],
  );
}
