import { defineConfig } from 'vitest/config';

// Les tests jouent des duels complets sur une base PostgreSQL embarquée : on leur laisse le temps.
export default defineConfig({ test: { testTimeout: 20_000, hookTimeout: 20_000 } });
