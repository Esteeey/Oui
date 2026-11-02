import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp, { type Metadata, type OutputInfo } from 'sharp';

import { MEDIA_FORMATS, MEDIA_MAX_BYTES, type MediaPurpose, type MediaView } from '@qu1z/shared';

import type { Database, Queryable } from './db/database';
import type { RateLimiter } from './rate-limit';
import { SocialError } from './social';

/**
 * Stockage des fichiers. En local : disque (servi par le serveur sous `/media/…`).
 * En production : stockage objet compatible S3 (R2, S3…) derrière un CDN, via la même interface.
 */
export interface MediaStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Lecture pour le service local `/media/…` (inutile si les fichiers sont servis par un CDN). */
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Adresse publique du fichier : chemin relatif au serveur ou URL absolue du CDN. */
  url(key: string): string;
}

const KEY = /^[a-z]+\/[0-9a-f]{32}\.(webp|jpg|png|gif)$/;
const TYPE_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

export class DiskStore implements MediaStore {
  constructor(
    private readonly dir: string,
    private readonly publicBase = '/media',
  ) {}

  async put(key: string, data: Buffer): Promise<void> {
    const path = join(this.dir, key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string) {
    if (!KEY.test(key)) return null;
    try {
      return { data: await readFile(join(this.dir, key)), contentType: TYPE_BY_EXT[key.split('.').pop()!] };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (KEY.test(key)) await rm(join(this.dir, key), { force: true });
  }

  url(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}

/** Stockage en mémoire (tests). */
export class MemoryStore implements MediaStore {
  readonly files = new Map<string, { data: Buffer; contentType: string }>();
  async put(key: string, data: Buffer, contentType: string) {
    this.files.set(key, { data, contentType });
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  url(key: string) {
    return `/media/${key}`;
  }
}

/** Adresse publique d'un média (initialisée par le serveur ; utilisée par les résumés de joueurs). */
let publicUrl: (key: string) => string = (key) => `/media/${key}`;
export const mediaUrl = (key: string | null | undefined): string | null => (key ? publicUrl(key) : null);

/** Dimensions maximales après redimensionnement. */
const MAX_SIDE = { message: 1600, post: 1600, avatar: 512 } as const;
const MAX_ANIMATED_SIDE = 720;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_FRAMES = 300;
/** Un média non rattaché (envoi abandonné) est supprimé au bout de 24 h. */
const ORPHAN_TTL = '24 hours';

export interface MediaRow {
  id: string;
  storage_key: string;
  width: number;
  height: number;
  animated: boolean;
}

export const mediaView = (r: MediaRow): MediaView => ({
  id: r.id,
  url: publicUrl(r.storage_key),
  width: r.width,
  height: r.height,
  animated: r.animated,
});

/**
 * Envoi de médias : type vérifié sur le contenu (pas sur l'extension ni l'en-tête), 8 Mo maximum,
 * métadonnées (EXIF, GPS…) supprimées, orientation appliquée, image redimensionnée et réencodée en WebP.
 * Un GIF animé reste animé (WebP animé) ; une photo de profil est recadrée en carré.
 */
export class Media {
  constructor(
    private readonly db: Database,
    readonly store: MediaStore,
    private readonly limiter: RateLimiter,
  ) {
    publicUrl = (key) => store.url(key);
  }

  async upload(owner: string, purpose: MediaPurpose, input: Buffer): Promise<MediaView> {
    if (!this.limiter.allow('upload', owner)) throw new SocialError(429, 'rate_limited');
    if (!input.length) throw new SocialError(400, 'empty_file');
    if (input.length > MEDIA_MAX_BYTES) throw new SocialError(413, 'too_large');

    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw new SocialError(415, 'unsupported_format');
    }
    if (!meta.format || !(MEDIA_FORMATS as readonly string[]).includes(meta.format)) throw new SocialError(415, 'unsupported_format');
    const animated = purpose !== 'avatar' && (meta.pages ?? 1) > 1;
    if (animated && (meta.pages ?? 1) > MAX_FRAMES) throw new SocialError(413, 'too_many_frames');

    let output: { data: Buffer; info: OutputInfo };
    try {
      const side = animated ? MAX_ANIMATED_SIDE : MAX_SIDE[purpose];
      // Sans `.withMetadata()`, sharp n'écrit aucune métadonnée : EXIF, GPS, XMP et ICC sont supprimés.
      let img = sharp(input, { animated, limitInputPixels: MAX_INPUT_PIXELS }).rotate();
      img =
        purpose === 'avatar'
          ? img.resize(side, side, { fit: 'cover', position: 'attention' })
          : img.resize(side, side, { fit: 'inside', withoutEnlargement: true });
      output = await img.webp({ quality: animated ? 70 : 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    } catch {
      throw new SocialError(415, 'unsupported_format');
    }

    const id = randomUUID();
    const key = `${purpose}/${randomBytes(16).toString('hex')}.webp`;
    const width = output.info.width;
    const height = output.info.pageHeight ?? output.info.height;
    await this.store.put(key, output.data, 'image/webp');
    await this.db.query(
      'INSERT INTO media (id, owner_id, purpose, storage_key, content_type, width, height, bytes, animated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, owner, purpose, key, 'image/webp', width, height, output.data.length, animated],
    );
    return { id, url: this.store.url(key), width, height, animated };
  }

  /**
   * Rattache un média envoyé par `owner` (une seule fois, et pour l'usage prévu).
   * À appeler dans la transaction qui crée le message, la publication ou la photo de profil.
   */
  async attach(tx: Queryable, owner: string, mediaId: string, purpose: MediaPurpose): Promise<MediaView> {
    const [row] = await tx.query<MediaRow>(
      `UPDATE media SET attached_at = now()
       WHERE id = $1 AND owner_id = $2 AND purpose = $3 AND attached_at IS NULL AND removed_by_moderation_at IS NULL
       RETURNING id, storage_key, width, height, animated`,
      [mediaId, owner, purpose],
    );
    if (!row) throw new SocialError(400, 'invalid_media');
    return mediaView(row);
  }

  /** Photo de profil : remplace l'ancienne (supprimée du stockage). `null` la retire. */
  async setAvatar(owner: string, mediaId: string | null): Promise<{ avatar: string | null }> {
    const result = await this.db.transaction(async (tx) => {
      const [prev] = await tx.query<{ id: string; storage_key: string }>(
        'SELECT m.id, m.storage_key FROM profiles p JOIN media m ON m.id = p.avatar_media_id WHERE p.user_id = $1',
        [owner],
      );
      const view = mediaId ? await this.attach(tx, owner, mediaId, 'avatar') : null;
      await tx.query('UPDATE profiles SET avatar_media_id = $2 WHERE user_id = $1', [owner, view?.id ?? null]);
      if (prev) await tx.query('DELETE FROM media WHERE id = $1', [prev.id]);
      return { avatar: view?.url ?? null, oldKey: prev?.storage_key };
    });
    if (result.oldKey) await this.store.delete(result.oldKey);
    return { avatar: result.avatar };
  }

  /** Supprime les médias jamais rattachés (envoi abandonné). Renvoie le nombre de fichiers supprimés. */
  async cleanupOrphans(): Promise<number> {
    const rows = await this.db.query<{ storage_key: string }>(
      `DELETE FROM media WHERE attached_at IS NULL AND created_at < now() - interval '${ORPHAN_TTL}' RETURNING storage_key`,
    );
    for (const r of rows) await this.store.delete(r.storage_key);
    return rows.length;
  }
}
