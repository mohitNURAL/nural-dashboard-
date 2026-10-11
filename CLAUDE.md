# Nural Dev & QA Dashboard

Spec: docs/SRS.md (diagrams in docs/images). Read the section named in each task before coding.
Build order: SRS section 10.5, milestones 1 to 9. Do one milestone per session, start in plan mode.

## Rules

- The Bitrix24 webhook URL and token live only in the root `.env`, read by apps/api. Never import them in apps/web, never log them, never commit `.env`.
- Match Kanban stages by title, never by ID (IDs differ per workgroup). stageId "0" = To do.
- Every Bitrix24 call goes through bitrix/limiter.ts (2 calls/s) and uses batch.ts when making more than one call.
- The webhook is read-only: no Bitrix24 write methods through it (bitrix/methods.ts READ_METHODS). The only writes are task actions a signed-in person makes (move column: task.stages.movetask; status: tasks.task.complete/defer/start/pause/renew), run with that person's own OAuth token via limiter.userCall (USER_ACTION_METHODS), recorded in task_actions (SRS 7, Task actions). Never add *.add, *.update or *.delete.
- Metric logic lives in packages/shared/src/metrics.ts as pure functions with Vitest tests.
- "Today" and "overdue" use APP_TIMEZONE (Asia/Kolkata).
- Scope: all workgroups (DEV_GROUP_IDS empty = all; a comma list narrows it).
- Issues = tasks tagged bug or feedback (case-insensitive), assigned to developers and normally created by testers.
- Testing tasks = tasks assigned to the QA Testing department (testing, re-testing, data creation, manual creation, video creation and any other work).
- UI uses the Nural tokens in SRS section 6 (Manrope for headings/labels, Work Sans for body/table, Blue B500 primary, Teal T500 accent).

## Commands (added as milestones land)

pnpm dev | pnpm test | pnpm db:migrate | pnpm sync:initial | pnpm bitrix:ping
pnpm db:generate   # after editing apps/api/src/db/schema.ts
pnpm sync:verify [148,154]   # per-stage task counts, Postgres vs Bitrix24
pnpm tunnel   # public HTTPS URL for the outbound webhook (changes on every start)
pnpm hooks:simulate <taskId> [event]   # signed fake webhook call to the local API
Docker Postgres is on port 5433 (a local PostgreSQL service holds 5432).
node --env-file=.env scripts/test-webhook.mjs # checks the inbound webhook
DEPLOY_HOST=root@<ip> scripts/deploy.sh   # ship committed code + .env.prod to the server (Hetzner CX22), rebuild, restart
DEPLOY_HOST=root@<ip> scripts/db-copy.sh  # one-time copy of the local database to the server
ssh -i ~/.ssh/nural_oracle root@<ip> 'bash -s' < scripts/vm-setup.sh   # one-time server setup
Production: docker-compose.prod.yml (project nural-prod, Caddy TLS). AUTH=bitrix needs BITRIX_CLIENT_ID/SECRET and SESSION_SECRET.
