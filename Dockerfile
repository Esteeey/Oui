# Serveur de jeu Qu1z (Railway ou tout hébergeur Docker). L'application mobile n'est pas incluse.
FROM node:22-slim
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared packages/shared
COPY services/game services/game
RUN pnpm install --frozen-lockfile --filter @qu1z/game-server...

# Médias sur un volume monté en /data (Railway : Volume -> /data).
ENV NODE_ENV=production QU1Z_MEDIA_DIR=/data/media QU1Z_DATA_DIR=/data/pg QU1Z_TRUST_PROXY=1
WORKDIR /app/services/game
CMD ["node", "--import", "tsx", "src/index.ts"]
