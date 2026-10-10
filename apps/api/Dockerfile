# API image (SRS 7): Fastify + sync worker, run from TypeScript source with tsx as in `pnpm start`.
# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:20-slim
WORKDIR /app
RUN corepack enable
# Manifests first, so the install layer is cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@nural/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
# KPI calendar, holidays, project owners, department mapping (SRS 13.5).
COPY config config
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 4000
# Apply migrations, then serve. Secrets come from the environment (compose env_file), never the image.
CMD ["sh", "-c", "./node_modules/.bin/tsx src/scripts/dbMigrate.ts && exec ./node_modules/.bin/tsx src/server.ts"]
