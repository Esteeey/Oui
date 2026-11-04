import { isGameSoundId, SOUND_MAX_BYTES, type GameSoundId, type SoundOverride } from '@qu1z/shared';

import type { Database } from './db/database';
import { writeLog } from './moderation-log';
import { SocialError } from './social';

interface Row {
  id: GameSoundId;
  content_type: string;
  bytes: number;
  file_name: string | null;
  updated_by: string | null;
  updated_at: string | Date;
}

/** Type réel du fichier, lu dans ses premiers octets (jamais d'après l'extension ou l'en-tête envoyé). */
export function sniffAudio(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe6) === 0xe2)) return 'audio/mpeg';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'audio/mp4';
  return null;
}

const view = (r: Row): SoundOverride => {
  const updatedAt = new Date(r.updated_at).getTime();
  return {
    id: r.id,
    url: `/sounds/${r.id}?v=${updatedAt}`,
    contentType: r.content_type,
    bytes: r.bytes,
    fileName: r.file_name,
    updatedAt,
    updatedBy: r.updated_by,
  };
};

/**
 * Sons du jeu remplacés par un administrateur. Les fichiers sont gardés en base :
 * le serveur peut être redéployé sans les perdre. Sans remplacement, l'appli joue son son d'origine.
 */
export class GameSounds {
  constructor(private readonly db: Database) {}

  private async requireAdmin(userId: string): Promise<void> {
    const [u] = await this.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (u?.role !== 'admin') throw new SocialError(403, 'forbidden');
  }

  /** Sons remplacés (pour tous les joueurs). */
  async overrides(): Promise<SoundOverride[]> {
    const rows = await this.db.query<Row>(
      'SELECT id, content_type, bytes, file_name, updated_by, updated_at FROM game_sounds ORDER BY id',
    );
    return rows.map(view);
  }

  /** Liste détaillée pour le panneau d'administration. */
  async list(admin: string): Promise<SoundOverride[]> {
    await this.requireAdmin(admin);
    return this.overrides();
  }

  /** Fichier d'un son remplacé (servi sans jeton : un lecteur audio ne peut pas en envoyer). */
  async file(id: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!isGameSoundId(id)) return null;
    const [row] = await this.db.query<{ data: Uint8Array; content_type: string }>('SELECT data, content_type FROM game_sounds WHERE id = $1', [id]);
    return row ? { data: Buffer.from(row.data), contentType: row.content_type } : null;
  }

  async set(admin: string, id: string, data: Buffer, fileName: string | null): Promise<SoundOverride> {
    await this.requireAdmin(admin);
    if (!isGameSoundId(id)) throw new SocialError(404, 'not_found');
    if (!data.length) throw new SocialError(400, 'empty_file');
    if (data.length > SOUND_MAX_BYTES) throw new SocialError(413, 'too_large');
    const contentType = sniffAudio(data);
    if (!contentType) throw new SocialError(415, 'unsupported_format');
    const name = fileName ? fileName.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 120) || null : null;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<Row>(
        `INSERT INTO game_sounds (id, data, content_type, bytes, file_name, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (id) DO UPDATE SET data = $2, content_type = $3, bytes = $4, file_name = $5, updated_by = $6, updated_at = now()
         RETURNING id, content_type, bytes, file_name, updated_by, updated_at`,
        [id, data, contentType, data.length, name, admin],
      );
      await writeLog(tx, { actorId: admin, actorRole: 'admin', action: 'sound_updated', targetType: 'sound', targetId: null, details: { sound: id, fileName: name } });
      return view(row);
    });
  }

  /** Rétablit le son d'origine. */
  async reset(admin: string, id: string): Promise<void> {
    await this.requireAdmin(admin);
    if (!isGameSoundId(id)) throw new SocialError(404, 'not_found');
    await this.db.transaction(async (tx) => {
      const rows = await tx.query('DELETE FROM game_sounds WHERE id = $1 RETURNING id', [id]);
      if (rows.length) await writeLog(tx, { actorId: admin, actorRole: 'admin', action: 'sound_reset', targetType: 'sound', targetId: null, details: { sound: id } });
    });
  }
}
