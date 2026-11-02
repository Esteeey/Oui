import { resolve } from 'node:path';

import { startServer } from './server';
import { Store } from './store';

const port = Number(process.env.PORT ?? 8787);
const dataFile = resolve(process.env.QU1Z_DATA ?? 'data/store.json');

const server = await startServer(port, { store: new Store(dataFile) });
console.log(`Serveur de jeu Qu1z : ws://localhost:${server.port} (données : ${dataFile})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    server.game.store.save();
    await server.close();
    process.exit(0);
  });
}
