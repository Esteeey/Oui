import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

import { MAX_CUSTOM_STICKERS, customStickerKey, isCustomSticker, isPackSticker, type CustomStickerId, type StickerId } from '@qu1z/shared';

import type { Queryable } from './db/database';
import type { MediaStore } from './media';
import { SocialError } from './social';

/** Stickers importés par les joueurs. Le fichier est servi sous `/media/stickers/<id>.webp`. */
export class Stickers {
  constructor(private readonly db: Queryable, private readonly store: MediaStore) {}

  async list(owner: string): Promise<CustomStickerId[]> {
    const rows = await this.db.query<{ id: CustomStickerId }>('SELECT id FROM user_stickers WHERE owner_id = $1 AND removed_at IS NULL ORDER BY created_at DESC', [owner]);
    return rows.map((r) => r.id);
  }

  async upload(owner: string, data: Buffer): Promise<{ id: CustomStickerId }> {
    if (!data.length || data.length > 8 * 1024 * 1024) throw new SocialError(413, 'too_large');
    const [{ count }] = await this.db.query<{ count: string }>('SELECT count(*) FROM user_stickers WHERE owner_id = $1 AND removed_at IS NULL', [owner]);
    if (Number(count) >= MAX_CUSTOM_STICKERS) throw new SocialError(400, 'too_many_stickers');
    let image: Buffer;
    try {
      // Garde la transparence et l'animation (GIF ou WebP animé) ; 512 px au plus.
      image = await sharp(data, { animated: true, limitInputPixels: 40_000_000 })
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new SocialError(415, 'unsupported_format');
    }
    const id = `u-${randomBytes(16).toString('hex')}` as CustomStickerId;
    await this.store.put(customStickerKey(id), image, 'image/webp');
    await this.db.query('INSERT INTO user_stickers (id, owner_id) VALUES ($1, $2)', [id, owner]);
    return { id };
  }

  /** Retire le sticker de la collection : ceux déjà envoyés restent visibles. */
  async remove(owner: string, id: string): Promise<void> {
    await this.db.query('UPDATE user_stickers SET removed_at = now() WHERE id = $1 AND owner_id = $2', [id, owner]);
  }
}

/** Refuse un sticker inconnu. Un sticker importé doit exister (n'importe quel joueur peut renvoyer celui qu'il a reçu). */
export async function assertSticker(db: Queryable, id: unknown): Promise<StickerId> {
  if (isPackSticker(id)) return id;
  if (isCustomSticker(id)) {
    const [row] = await db.query('SELECT 1 FROM user_stickers WHERE id = $1', [id]);
    if (row) return id;
  }
  throw new SocialError(400, 'invalid_sticker');
}
