import { resolve } from 'node:path';

import { openDatabase } from './db/database';

/**
 * Donne un rôle à un joueur, par son pseudo : `pnpm --filter @qu1z/game-server set-role <pseudo> <player|moderator|admin>`.
 * En local (base embarquée), arrêter le serveur de jeu avant de lancer la commande.
 */
const [pseudo, role] = process.argv.slice(2);
if (!pseudo || !['player', 'moderator', 'admin'].includes(role)) {
  console.error('Utilisation : set-role <pseudo> <player|moderator|admin>');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
const db = await openDatabase(url ? { url } : { dataDir: resolve(process.env.QU1Z_DATA_DIR ?? 'data/pg') });
const rows = await db.query<{ pseudo: string }>(
  'UPDATE users u SET role = $2 FROM profiles p WHERE p.user_id = u.id AND lower(p.pseudo) = lower($1) RETURNING p.pseudo',
  [pseudo, role],
);
console.log(rows.length ? `${rows[0].pseudo} est maintenant ${role}.` : `Aucun joueur « ${pseudo} ».`);
await db.close();
