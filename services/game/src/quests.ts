import {
  dailyQuests,
  nextMidnight,
  questDay,
  questIncrement,
  type DailyQuests,
  type Quest,
  type QuestEvent,
  type QuestKind,
  type QuestView,
} from '@qu1z/shared';

import type { Database, Queryable } from './db/database';

interface QuestRow {
  quest_id: string;
  kind: QuestKind;
  label: string;
  theme_id: string | null;
  goal: number;
  reward: number;
  progress: number;
  completed_at: Date | string | null;
}

function view(r: QuestRow): QuestView {
  return {
    id: r.quest_id,
    kind: r.kind,
    label: r.label,
    goal: r.goal,
    reward: r.reward,
    progress: Math.min(r.progress, r.goal),
    done: r.completed_at !== null,
    ...(r.theme_id ? { themeId: r.theme_id } : {}),
  };
}

/**
 * Défis du jour côté serveur : les objectifs sont fixés en base au premier affichage ou au premier match du jour
 * (ils ne changent plus ensuite), l'avancée vient des matchs terminés, et la récompense en XP est versée une seule
 * fois, dès que l'objectif est atteint.
 */
export class Quests {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  private async ensure(tx: Queryable, userId: string, day: string): Promise<QuestRow[]> {
    const existing = await tx.query<QuestRow>('SELECT * FROM daily_quests WHERE user_id = $1 AND day = $2 ORDER BY position', [userId, day]);
    if (existing.length) return existing;
    // Objectif de victoire dans un thème que le joueur connaît (sinon n'importe lequel).
    const played = await tx.query<{ theme_id: string }>('SELECT theme_id FROM theme_stats WHERE user_id = $1 ORDER BY duels DESC LIMIT 5', [userId]);
    const quests: Quest[] = dailyQuests(userId, day, played.length ? played.map((r) => r.theme_id) : undefined);
    for (const [i, q] of quests.entries()) {
      await tx.query(
        `INSERT INTO daily_quests (user_id, day, quest_id, position, kind, label, theme_id, goal, reward)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [userId, day, q.id, i, q.kind, q.label, q.themeId ?? null, q.goal, q.reward],
      );
    }
    return tx.query<QuestRow>('SELECT * FROM daily_quests WHERE user_id = $1 AND day = $2 ORDER BY position', [userId, day]);
  }

  async list(userId: string): Promise<DailyQuests> {
    const now = this.now();
    const day = questDay(now);
    const rows = await this.db.transaction((tx) => this.ensure(tx, userId, day));
    return { day, resetsAt: nextMidnight(now), quests: rows.map(view) };
  }

  /** Avancée après un match terminé ; renvoie les objectifs atteints par ce match (récompense versée). */
  async record(userId: string, event: QuestEvent): Promise<QuestView[]> {
    const day = questDay(this.now());
    return this.db.transaction(async (tx) => {
      const rows = await this.ensure(tx, userId, day);
      const completed: QuestView[] = [];
      for (const r of rows) {
        if (r.completed_at !== null) continue;
        const inc = questIncrement(view(r), event);
        if (inc <= 0) continue;
        const progress = Math.min(r.goal, r.progress + inc);
        const done = progress >= r.goal;
        await tx.query(
          `UPDATE daily_quests SET progress = $4, completed_at = CASE WHEN $5 THEN now() ELSE NULL END
           WHERE user_id = $1 AND day = $2 AND quest_id = $3 AND completed_at IS NULL`,
          [userId, day, r.quest_id, progress, done],
        );
        if (done) {
          await tx.query('UPDATE users SET xp = xp + $2 WHERE id = $1', [userId, r.reward]);
          completed.push(view({ ...r, progress, completed_at: new Date() }));
        }
      }
      return completed;
    });
  }
}
