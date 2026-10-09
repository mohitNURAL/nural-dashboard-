# Nural Dev & QA Dashboard

Live Development and QA dashboard over Bitrix24 (nural.bitrix24.in). Full spec: [docs/SRS.md](docs/SRS.md).

## First-time setup (Windows)

1. Open PowerShell in this folder and run:
   `powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1`
   Restart if Docker Desktop was just installed, then open Docker Desktop once.
2. Check the Bitrix24 webhook (`.env` is already filled in):
   `node --env-file=.env scripts/test-webhook.mjs`
   It should list departments, active users and workgroups.
3. Make this a git repo:
   `git init` then `git add .` then `git commit -m "Project setup"`
4. Open the folder in VS Code (`code .`), open Claude Code, and paste the milestone 1 prompt from docs/SRS.md section 10.5. Work through milestones 1 to 9, committing after each check passes.

## Folder layout (after milestone 1)

- apps/api: Fastify backend, Bitrix24 sync, webhooks, metrics API, SSE
- apps/web: React dashboard
- packages/shared: types, stage map, metric functions
- docs: SRS and diagrams

## Run locally

1. `pnpm install`
2. Start Docker Desktop, then `docker compose up -d` (Postgres 16 on 5432, Redis 7 on 6379)
3. `pnpm dev`: web on http://localhost:5173, API on http://localhost:4000/health

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`.
`pnpm db:migrate`, `pnpm sync:initial` and `pnpm bitrix:ping` are placeholders until milestones 2 and 3.
