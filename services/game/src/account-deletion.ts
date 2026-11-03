import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Database, Queryable } from './db/database';
import type { MediaStore } from './media';
import { SocialError } from './social';

/** Durée de conservation des preuves de modération d'un compte supprimé (6 mois). */
export const MODERATION_RETENTION_DAYS = 183;
/** Nom affiché à la place d'un joueur supprimé (historiques de duels, messages système des groupes). */
export const DELETED_PLAYER_NAME = 'Joueur supprimé';
/** Texte à saisir pour confirmer la suppression. */
export const DELETE_CONFIRMATION = 'SUPPRIMER';

/** Colonnes sans suppression en cascade qui rattachent des preuves de modération à un joueur. */
const MODERATION_REFS: [table: string, column: string][] = [
  ['reports', 'reporter_id'],
  ['reports', 'target_user_id'],
  ['reports', 'handled_by'],
  ['sanctions', 'user_id'],
  ['sanctions', 'created_by'],
  ['sanctions', 'revoked_by'],
  ['appeals', 'user_id'],
  ['appeals', 'decided_by'],
  ['moderation_log', 'actor_id'],
  ['system_announcements', 'author_id'],
];

/**
 * Suppression définitive d'un compte : profil, statistiques, publications, commentaires, messages envoyés, médias
 * (fichiers compris), abonnements, notifications, sessions… Le pseudo disparaît aussi des historiques des autres joueurs.
 * Seules les preuves de modération sont conservées, rattachées à un compte anonyme, puis purgées après 6 mois.
 */
export class AccountDeletion {
  constructor(
    private readonly db: Database,
    private readonly store: MediaStore,
    /** Ferme les connexions temps réel du joueur. */
    private readonly disconnect: (userId: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  async delete(userId: string, confirmation: unknown): Promise<{ deleted: true }> {
    if (confirmation !== DELETE_CONFIRMATION) throw new SocialError(400, 'confirmation_required');
    const keys = await this.db.transaction(async (tx) => {
      const [user] = await tx.query<{ status: string; last_network_hash: string | null; pseudo: string | null }>(
        'SELECT u.status, u.last_network_hash, p.pseudo FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 FOR UPDATE OF u',
        [userId],
      );
      if (!user || user.status === 'deleted') throw new SocialError(404, 'not_found');

      await this.handOverGroups(tx, userId);
      await this.forgetInOthersData(tx, userId, user.pseudo);

      // Messages envoyés : supprimés (les réponses qui les citaient perdent la citation).
      await tx.query('UPDATE messages SET reply_to_id = NULL WHERE reply_to_id IN (SELECT id FROM messages WHERE sender_id = $1)', [userId]);
      await tx.query('DELETE FROM messages WHERE sender_id = $1', [userId]);
      await tx.query('UPDATE conversations SET created_by = NULL WHERE created_by = $1', [userId]);
      await tx.query('UPDATE group_exclusions SET by_id = NULL WHERE by_id = $1', [userId]);
      await tx.query('UPDATE pinned_messages SET pinned_by = NULL WHERE pinned_by = $1', [userId]);

      await this.keepModerationEvidence(tx, userId, user.status === 'banned' ? user.last_network_hash : null);

      // Codes de connexion envoyés à son adresse depuis d'autres appareils.
      await tx.query('DELETE FROM email_codes WHERE lower(email) = (SELECT lower(email) FROM users WHERE id = $1)', [userId]);
      const media = await tx.query<{ storage_key: string }>('SELECT storage_key FROM media WHERE owner_id = $1', [userId]);
      // Tout le reste part en cascade : profil, statistiques, médailles, publications, abonnements, sessions…
      await tx.query('DELETE FROM users WHERE id = $1', [userId]);
      return media.map((m) => m.storage_key);
    });
    for (const key of keys) await this.store.delete(key).catch((err) => console.error('Suppression de média', err));
    this.disconnect(userId);
    return { deleted: true };
  }

  /** Groupes créés par le joueur : le rôle passe au plus ancien administrateur (sinon membre) ; un groupe vide est fermé. */
  private async handOverGroups(tx: Queryable, userId: string): Promise<void> {
    const groups = await tx.query<{ conversation_id: string }>(
      "SELECT conversation_id FROM conversation_members WHERE user_id = $1 AND role = 'creator' AND left_at IS NULL",
      [userId],
    );
    for (const { conversation_id: groupId } of groups) {
      const [heir] = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 AND left_at IS NULL
         ORDER BY role = 'admin' DESC, joined_at LIMIT 1`,
        [groupId, userId],
      );
      if (heir) await tx.query("UPDATE conversation_members SET role = 'creator' WHERE conversation_id = $1 AND user_id = $2", [groupId, heir.user_id]);
      else await tx.query('UPDATE conversations SET deleted_at = now() WHERE id = $1', [groupId]);
    }
  }

  /** Le joueur disparaît des données des autres : historiques de duels, messages système, notifications groupées. */
  private async forgetInOthersData(tx: Queryable, userId: string, pseudo: string | null): Promise<void> {
    await tx.query(
      `UPDATE duel_results SET result = jsonb_set(jsonb_set(result, '{record,opponentName}', to_jsonb($2::text)), '{record,opponentId}', 'null')
       WHERE user_id <> $1 AND result->'record'->>'opponentId' = $1::text`,
      [userId, DELETED_PLAYER_NAME],
    );
    await tx.query(
      `UPDATE messages SET
         text = CASE WHEN $2::text IS NULL THEN text ELSE replace(text, $2::text, $3::text) END,
         system_event = system_event
           || CASE WHEN system_event->>'actorId' = $1::text THEN '{"actorId": null}'::jsonb ELSE '{}'::jsonb END
           || CASE WHEN system_event->>'targetId' = $1::text THEN '{"targetId": null}'::jsonb ELSE '{}'::jsonb END
       WHERE system_event->>'actorId' = $1::text OR system_event->>'targetId' = $1::text`,
      [userId, pseudo, DELETED_PLAYER_NAME],
    );
    await tx.query('DELETE FROM notifications WHERE actor_ids = ARRAY[$1::uuid]', [userId]);
    await tx.query(
      'UPDATE notifications SET actor_ids = array_remove(actor_ids, $1::uuid), actor_count = greatest(actor_count - 1, 1) WHERE $1::uuid = ANY(actor_ids)',
      [userId],
    );
  }

  /**
   * Obligation de conservation : les signalements, sanctions, appels et le journal de modération qui concernent le joueur
   * restent 6 mois, rattachés à un compte anonyme (ni profil, ni e-mail, jeton impossible à retrouver).
   */
  private async keepModerationEvidence(tx: Queryable, userId: string, networkHash: string | null): Promise<void> {
    let referenced = false;
    for (const [table, column] of MODERATION_REFS) {
      const [row] = await tx.query(`SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`, [userId]);
      if (row) {
        referenced = true;
        break;
      }
    }
    if (!referenced) {
      await tx.query('DELETE FROM moderation_log WHERE target_id = $1', [userId]);
      return;
    }
    const anonymous = randomUUID();
    await tx.query("INSERT INTO users (id, token_hash, status, deleted_at, last_network_hash) VALUES ($1, $2, 'deleted', $3, $4)", [
      anonymous,
      createHash('sha256').update(randomBytes(32)).digest('hex'),
      new Date(this.now()),
      // Compte banni : l'empreinte réseau reste un indice anti-contournement pendant la conservation.
      networkHash,
    ]);
    for (const [table, column] of MODERATION_REFS) {
      await tx.query(`UPDATE ${table} SET ${column} = $2 WHERE ${column} = $1`, [userId, anonymous]);
    }
    await tx.query('UPDATE moderation_log SET target_id = $2 WHERE target_id = $1', [userId, anonymous]);
  }

  /** Fin de la conservation : preuves des comptes supprimés depuis plus de 6 mois effacées, puis le compte anonyme. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(this.now() - MODERATION_RETENTION_DAYS * 86_400_000);
    const expired = await this.db.query<{ id: string }>(
      "SELECT id FROM users WHERE status = 'deleted' AND deleted_at < $1 AND last_network_hash IS DISTINCT FROM 'purged'",
      [cutoff],
    );
    for (const { id } of expired) {
      await this.db.transaction(async (tx) => {
        // Ce qui concerne le joueur lui-même : effacé.
        await tx.query('DELETE FROM appeals WHERE user_id = $1 OR sanction_id IN (SELECT id FROM sanctions WHERE user_id = $1)', [id]);
        await tx.query('DELETE FROM banned_emails WHERE sanction_id IN (SELECT id FROM sanctions WHERE user_id = $1)', [id]);
        await tx.query('DELETE FROM sanctions WHERE user_id = $1', [id]);
        await tx.query('UPDATE sanctions SET report_id = NULL WHERE report_id IN (SELECT id FROM reports WHERE reporter_id = $1 OR target_user_id = $1)', [id]);
        await tx.query('DELETE FROM reports WHERE reporter_id = $1 OR target_user_id = $1', [id]);
        await tx.query('DELETE FROM moderation_log WHERE target_id = $1', [id]);
        // Ses actions de modérateur sur d'autres joueurs : gardées sans auteur.
        await tx.query('UPDATE reports SET handled_by = NULL WHERE handled_by = $1', [id]);
        await tx.query('UPDATE sanctions SET revoked_by = NULL WHERE revoked_by = $1', [id]);
        await tx.query('UPDATE appeals SET decided_by = NULL WHERE decided_by = $1', [id]);
        await tx.query('UPDATE moderation_log SET actor_id = NULL WHERE actor_id = $1', [id]);
        // Sanctions prononcées et annonces publiées : l'auteur est obligatoire, le compte anonyme reste (sans aucune donnée).
        const rows = await tx.query(
          `DELETE FROM users WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM sanctions WHERE created_by = $1)
           AND NOT EXISTS (SELECT 1 FROM system_announcements WHERE author_id = $1) RETURNING id`,
          [id],
        );
        if (!rows.length) await tx.query("UPDATE users SET last_network_hash = 'purged' WHERE id = $1", [id]);
      });
    }
    return expired.length;
  }
}
