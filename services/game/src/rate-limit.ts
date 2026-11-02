/**
 * Limiteur anti-spam par fenêtre glissante, configurable côté serveur.
 * Une instance par processus : à remplacer par Redis quand le serveur aura plusieurs instances.
 */
export interface Limit {
  /** Nombre maximal d'actions… */
  max: number;
  /** …par fenêtre (ms). */
  windowMs: number;
}

export type Limits = Record<string, Limit>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Valeurs par défaut (voir docs/PLAN-SOCIAL.md) ; surchargeables à la création du serveur. */
export const DEFAULT_LIMITS: Limits = {
  play: { max: 30, windowMs: MINUTE },
  chat: { max: 20, windowMs: MINUTE },
  block: { max: 30, windowMs: MINUTE },
  messageRequest: { max: 20, windowMs: DAY },
  groupInvite: { max: 30, windowMs: DAY },
  mention: { max: 50, windowMs: DAY },
  report: { max: 20, windowMs: DAY },
  http: { max: 240, windowMs: MINUTE },
  follow: { max: 60, windowMs: MINUTE },
  post: { max: 10, windowMs: MINUTE },
  comment: { max: 30, windowMs: MINUTE },
  like: { max: 120, windowMs: MINUTE },
  challenge: { max: 20, windowMs: MINUTE },
  search: { max: 120, windowMs: MINUTE },
  message: { max: 60, windowMs: MINUTE },
  upload: { max: 30, windowMs: 10 * MINUTE },
  gifSearch: { max: 60, windowMs: MINUTE },
};

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limits: Limits,
    private readonly now: () => number = Date.now,
  ) {}

  /** Enregistre l'action et indique si elle est permise. Une action sans limite est toujours permise. */
  allow(action: string, key: string): boolean {
    const limit = this.limits[action];
    if (!limit) return true;
    const id = `${action}:${key}`;
    const t = this.now();
    const recent = (this.hits.get(id) ?? []).filter((at) => t - at < limit.windowMs);
    if (recent.length >= limit.max) {
      this.hits.set(id, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(id, recent);
    return true;
  }
}
