# Nural Dev & QA Dashboard

Spec: docs/SRS.md (diagrams in docs/images). Read the section named in each task before coding.
Build order: SRS section 10.5, milestones 1 to 9. Do one milestone per session, start in plan mode.

## Rules

- The Bitrix24 webhook URL and token live only in the root `.env`, read by apps/api. Never import them in apps/web, never log them, never commit `.env`.
- Match Kanban stages by title, never by ID (IDs differ per workgroup). stageId "0" = To do.
- Every Bitrix24 call goes through bitrix/limiter.ts (2 calls/s) and uses batch.ts when making more than one call.
- The dashboard is read-only: no Bitrix24 write methods (no *.add, *.update, *.delete, *.complete).
- Metric logic lives in packages/shared/src/metrics.ts as pure functions with Vitest tests.
- "Today" and "overdue" use APP_TIMEZONE (Asia/Kolkata).
- Scope: all workgroups (DEV_GROUP_IDS empty = all; a comma list narrows it).
- Issues = tasks tagged bug or feedback (case-insensitive), assigned to developers and normally created by testers.
- Testing tasks = tasks assigned to the QA Testing department (testing, re-testing, data creation, manual creation, video creation and any other work).
- UI uses the Nural tokens in SRS section 6 (Manrope for headings/labels, Work Sans for body/table, Blue B500 primary, Teal T500 accent).

## Commands (added as milestones land)

pnpm dev | pnpm test | pnpm db:migrate | pnpm sync:initial | pnpm bitrix:ping
node --env-file=.env scripts/test-webhook.mjs # checks the inbound webhook
