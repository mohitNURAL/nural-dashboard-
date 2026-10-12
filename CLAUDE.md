# Nural Pulse (Nural Dev & QA Dashboard)

Spec: docs/SRS.md (diagrams in docs/images). Read the section named in each task before coding.
Build order: SRS section 10.5, milestones 1 to 9. Do one milestone per session, start in plan mode.

## Rules

- The Bitrix24 webhook URL and token live only in the root `.env`, read by apps/api. Never import them in apps/web, never log them, never commit `.env`.
- Scoping (NFR-4): routes read data only via the per-request `getDataset(req)` (auth/roles.ts). What a person may do comes from their rights (auth/rights.ts: role defaults, department and person overrides set on the Access permissions screen); check the right (one per page: viewer.kpi, .dev, .qa, .insights, .org, .people, .connections, .mailing, .helpFeedback, .helpDocs, .helpFaq; plus .editAll, .inbox, .helpInbox, .admin, .full for data scope), never the role name. A new page adds its right to packages/shared/src/modules.ts and auth/rights.ts, and its API prefix to PAGE_GUARD in server.ts. Finance is admins only, never grantable. Never read the base dataset in a route, never cache a result across people, and keep `people` on every task.changed. Run auth/scoping.test.ts after any data or route change.
- Match Kanban stages by title, never by ID (IDs differ per workgroup). stageId "0" = the start stage. Stage rules live in the workflow definition (packages/shared/src/workflow.ts, applied by applyWorkflow; SRS 22): never hard-code a stage name in code; use stageWithRole/hasRole or the category (PENDING_STAGES, SENT_TO_QA_STAGES, HOLD_STAGES).
- Every Bitrix24 call goes through bitrix/limiter.ts (2 calls/s) and uses batch.ts when making more than one call.
- The webhook is read-only: no Bitrix24 write methods through it (bitrix/methods.ts READ_METHODS). The only writes are task edits a signed-in person makes (column: task.stages.movetask; status: tasks.task.complete/defer/start/pause/renew; fields: tasks.task.update with only GROUP_ID, RESPONSIBLE_ID, TAGS, PRIORITY, DEADLINE), run with that person's own OAuth token via limiter.userCall (USER_ACTION_METHODS, EDITABLE_FIELDS), recorded in task_actions (SRS 7, Task actions). Members may change only stage, status and tags. Never add *.add or *.delete, with one exception (2026-10-12, SRS 17): an admin, with their own OAuth token via limiter.peopleCall, may call department.add, department.update (NAME, PARENT, UF_HEAD) and user.update (UF_DEPARTMENT, WORK_POSITION only), as listed in bitrix/methods.ts PEOPLE_FIELDS; each logged in people_actions. Never a delete, never a new user. The dashboard role (People directory) is saved on the person's access grant (`role`), never in Bitrix24; locked admins in roles.json cannot be changed.
- Guided tour (SRS 16): a new tile, card or section adds its step in apps/web/src/features/tour/steps.ts and its name in features/tour/labels.ts; every user-visible change adds an entry at the top of features/tour/whatsNew.ts (the refresh toast lists it and the tab walks people through it). New pages use PageHead, StatTile and Card inside SortableGroup, like every page; rebuild the PDF guides when what people see changes (SRS 6, Guides).
- Integration (SRS 19): MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM, SLACK_BOT_TOKEN (and later INFOWAN_*) live only in `.env` / `.env.prod`, read by apps/api; never in apps/web, never logged. Integration pages and /api/reports, /api/integrations need the admin right. A report recipient's content is built from their own scope (reports/scope.ts, their rights), never more. New reports start in Preview (admins only); only the server with the sync worker schedules sends, and report_runs keeps one send per report, period, recipient and channel.
- Help attachments (SRS 20): only images, PDF, Excel, Word; 5 files, 8 MB each; checked on the server, served as downloads with nosniff, readable only by the sender and the helpInbox right.
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
