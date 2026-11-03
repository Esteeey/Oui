import { defineConfig } from 'vitest/config';

// Les tests jouent des duels complets sur une base PostgreSQL embarquée : on leur laisse le temps.
// Proxy de confiance : chaque client de test s'inscrit depuis son propre « réseau » (x-forwarded-for).
export default defineConfig({ test: { testTimeout: 20_000, hookTimeout: 20_000, env: { QU1Z_TRUST_PROXY: '1' } } });
