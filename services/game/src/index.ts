import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { openDatabase } from './db/database';
import { DiskStore } from './media';
import { ExpoPushSender } from './push';
import { Repo } from './repo';
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
// Production : DATABASE_URL (PostgreSQL). Développement : PostgreSQL embarqué dans services/game/data/pg.
const url = process.env.DATABASE_URL;
const dataDir = resolve(process.env.QU1Z_DATA_DIR ?? 'data/pg');

if (!url) mkdirSync(dataDir, { recursive: true });
const db = await openDatabase(url ? { url } : { dataDir });
// Médias : disque en développement. En production, brancher un stockage objet compatible S3 (voir media.ts)
// et MEDIA_PUBLIC_URL (adresse du CDN).
const mediaStore = new DiskStore(resolve(process.env.QU1Z_MEDIA_DIR ?? 'data/media'), process.env.MEDIA_PUBLIC_URL ?? '/media');
// E-mail vérifié exigé pour la messagerie, les publications et les groupes : activé dès qu'un service
// d'e-mails est configuré (RESEND_API_KEY), ou forcé avec QU1Z_REQUIRE_EMAIL=1 / =0.
const requireVerifiedEmail = process.env.QU1Z_REQUIRE_EMAIL ? process.env.QU1Z_REQUIRE_EMAIL === '1' : !!process.env.RESEND_API_KEY;
// Push : service Expo (EXPO_ACCESS_TOKEN facultatif) ; QU1Z_PUSH=0 pour le couper.
const pushSender = process.env.QU1Z_PUSH === '0' ? null : new ExpoPushSender(process.env.EXPO_ACCESS_TOKEN);
const server = await startServer(port, { repo: new Repo(db), mediaStore, requireVerifiedEmail, pushSender });
console.log(`Serveur de jeu Qu1z : ws://localhost:${server.port} (base : ${url ? 'PostgreSQL' : dataDir})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close();
    await db.close();
    process.exit(0);
  });
}
