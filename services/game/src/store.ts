import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ChatMessage, DuelRecord, DuelResult, ThemeStats } from '@qu1z/shared';

import type { DuelState } from './duel';

export interface PlayerRecord {
  id: string;
  /** Empreinte SHA-256 du jeton ; le jeton lui-même n'est jamais enregistré. */
  tokenHash: string;
  name: string;
  xp: number;
  stats: Record<string, ThemeStats>;
  history: DuelRecord[];
  /** Duels dont les récompenses ont déjà été versées : garantit un seul versement par duel. */
  rewardedDuels: string[];
  /** Dernier duel terminé dont le joueur n'a pas encore vu les résultats. */
  pendingResult: string | null;
}

export interface StoreData {
  players: Record<string, PlayerRecord>;
  duels: Record<string, DuelState>;
  /** Résultat de chaque joueur, par clé `duelId:playerId`. */
  results: Record<string, DuelResult>;
  chats: Record<string, ChatMessage[]>;
}

const EMPTY: StoreData = { players: {}, duels: {}, results: {}, chats: {} };
const FINISHED_DUEL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Stockage du prototype : un fichier JSON écrit de façon atomique (fichier temporaire puis renommage).
 * Sans chemin, tout reste en mémoire (tests). À remplacer par PostgreSQL (voir la conception).
 */
export class Store {
  data: StoreData;

  constructor(private readonly path: string | null) {
    this.data = structuredClone(EMPTY);
    if (path && existsSync(path)) {
      this.data = { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(path, 'utf8')) };
    }
  }

  /** Oublie les duels terminés depuis plus d'un jour. */
  prune(now: number): void {
    for (const [id, duel] of Object.entries(this.data.duels)) {
      if (duel.endedAt && now - duel.endedAt > FINISHED_DUEL_TTL_MS) {
        delete this.data.duels[id];
        delete this.data.chats[id];
      }
    }
  }

  save(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.path);
  }
}
