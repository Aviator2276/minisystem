# MiniSystem — single-container deployment
#
#   docker build -t minisystem .
#   docker run -d --name minisystem \
#     -p 3000:3000 \
#     -v minisystem-data:/data \
#     -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=change-me \
#     minisystem
#
# SQLite lives on the /data volume; migrations and the admin account are
# applied automatically on boot. Put a TLS-terminating proxy (Caddy, nginx,
# Traefik) in front — the camera and PWA install require HTTPS — and make
# sure it forwards WebSocket upgrades for /_ws.

# ---- build stage -----------------------------------------------------------
# debian-based image so better-sqlite3 uses prebuilt glibc binaries
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
 && npm prune --omit=dev

# ---- runtime stage ---------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/minisystem.db
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/package.json ./package.json

VOLUME /data
EXPOSE 3000

CMD ["node", "server/index.mjs"]
