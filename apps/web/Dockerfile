# Web image (SRS 7): builds the Vite app, then Caddy serves it, proxies /api, /hooks and /health
# to the API, and gets and renews the Let's Encrypt certificate itself.
# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@nural/web..."
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @nural/web build

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
