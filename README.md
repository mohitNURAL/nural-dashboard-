# Nural CRM Performance Dashboard

React + Node.js dashboard on live Bitrix24 CRM data, built from [Doc/SRS.md](Doc/SRS.md) (v1.1) with `nural_crm_dashboard.html` as the visual reference.

```
client/   React 18 + Vite + Chart.js SPA (all 9 panels, filters, modals)
server/   Node 20 + Express: Bitrix24 client, sync/cache, metrics, REST API, write-back
server/config/mapping.json   portal field mapping (SRS §6) — editable without a code change
```

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev          # API on :4000, app on http://localhost:5173
npm test             # derivation unit tests (SRS Phase 7)
npm run build && npm start   # production: one server on :4000 serves API + built app
```

With no `server/.env` it runs in **mock mode**: a seeded in-memory portal that returns real Bitrix24 payload shapes, so the full path (sync → mapping → metrics → write-back) runs unchanged. The UI shows a "Mock portal data" tag.

## Connect to Bitrix24

Copy `server/.env.example` to `server/.env` and set:

| Variable | Purpose |
|---|---|
| `BITRIX_WEBHOOK_URL` | Inbound webhook with `crm` + `user` scope (SRS §5.1). Lives only on the server. |
| `BITRIX_EVENT_TOKEN` | Application token for event webhooks; point `ONCRMDEALUPDATE`, `ONCRMLEADUPDATE`, etc. at `POST /api/bitrix/events`. |
| `QUICK_SYNC_SECONDS` | Near-real-time check for records modified since the last check (default 15, min 5). |
| `SYNC_INTERVAL_MINUTES` | Full re-pull, which also catches deletions (default 10). |
| `DEAL_PIPELINE_FIELD` | Deal list field that holds the reporting pipeline. Empty means Bitrix deal pipelines. **nural.bitrix24.in keeps all deals on one Kanban board and uses the "Product" field `UF_CRM_6A0C44C019860`.** Stages still come from the Kanban column. |
| `LEAD_PIPELINE_FIELD` | Custom lead field holding the pipeline (open item 4). Empty means lead pipeline tagging is disabled. |
| `DASHBOARD_USERS` | `[{token,name,role}]`, role `viewer` or `admin` (Pipeline admin). Empty means every request runs as admin `local-dev` — **development only**. |

## How live updates work

1. **Quick sync** every `QUICK_SYNC_SECONDS`: `crm.deal.list` / `crm.lead.list` filtered by `>DATE_MODIFY`, merged into the cache.
2. **Push to browsers:** `GET /api/stream` (Server-Sent Events) sends a status after every check. Open dashboards refresh in place when the data version changes, with no page reload.
3. **Instant (hosted only):** Bitrix24 outbound event webhooks to `POST /api/bitrix/events` trigger a quick sync within about 2 seconds. Bitrix24 cloud can't reach `localhost`, so locally you get the 15-second cycle.
4. **Full sync** every `SYNC_INTERVAL_MINUTES` as a backstop.

In mock mode the sample portal simulates CRM activity every 30 seconds (new leads, stage moves, wins and losses), so you can see live updates before connecting Bitrix24.

## Follow Up Summary

A **second line of cards**, under the KPI row, counts **customers** (leads and deals) with an open Bitrix24 activity (to-do, task, call or meeting) in each window: **Due Today · This Week · This Month · This Quarter · Next Quarter**, plus one card showing **Overdue** and **No Deadline** as two separate figures. Clicking a card opens the customer list on that window. The list has one row per customer, with the next follow-up due, the client details and the person the follow-up is assigned to. The Overdue & No Deadline tab shows the two as separate lists.
- Windows are in IST. This Week runs from today to Sunday, This Month from today to month-end, and This Quarter from today to the end of the current **financial-year** quarter. Next Quarter is the following one (Apr–Jun = Q1 … Jan–Mar = Q4), labelled for example "Jan–Mar 2027 · Q4 FY27".
- **No Deadline** lists follow-ups created without a due date (Bitrix24 stores these as year 9999), so the team can open them and set one.
- Open activities come in with the full sync. The 15-second quick sync picks up any activity changed since the last check (`>LAST_UPDATED`), so a completed follow-up leaves the list within seconds.
- API: `GET /api/dashboard/follow-ups?window=today|week|month|quarter|nextQuarter|overdue|noDeadline` (pipeline-scoped).

## Data Mapping section

The **Data Mapping** panel at the bottom of the dashboard, and the alert at the top, list anything the mapping can't place:
- **Deal Kanban stages** whose names match no funnel bar.
- **Lead statuses** that match no lead-funnel bar.
- **Pipelines** that only fell into Nural Custom because their name matched no prefix.

A Pipeline admin can pick the bar or bucket and save. The choice goes into `config/mapping.json` (`byStageId`, `byStatusId`, `byCategoryId`), is audit-logged, and dashboards refresh straight away. **Nothing is written to Bitrix24**, so the read-only inbound webhook is enough; no extra key is needed. `npm run check-mapping` prints the same information in the terminal.

API: `GET /api/meta/mapping-issues`, and `PUT /api/admin/mapping {kind: "dealStage"|"leadStatus"|"pipeline", id, value}`. Send `value: null` to reset to the automatic rule.

## Phase 0 checklist (before trusting the numbers)

Pull `crm.status.list` and `crm.dealcategory.list` from the live portal, then in `server/config/mapping.json`:

1. **Lead statuses (open item 5):** fill `leadStatuses.byStatusId` with the real `STATUS_ID` codes. Until then, statuses are matched by display name; anything unmatched appears as a visible **Unmapped** bucket.
2. **Pipelines:** confirm the category names follow the `Nural Sales…` / `Nural Service` / `Nural Assets` prefixes. Also confirm that `Nural Schemes` belongs under Sales (it does in the prototype).
3. **Deal stages:** check the name patterns, or pin specific stages in `dealStages.byStageId`.
4. **Stage probabilities:** agree starting values with the business (`stageProbabilities`, or `PUT /api/admin/stage-probabilities`).
5. **Lead pipeline tagging (open item 4):** decide between a custom field and lead conversion, then set `LEAD_PIPELINE_FIELD`.

## Behaviour decisions not spelled out in the SRS

- **Kanban basis:** anything sitting in a Kanban column (open deals and their value, Deals at Risk, the open funnel bars, lead statuses, Pipeline Breakdown) counts **every record currently in that column**, as the Bitrix24 board shows it. The period filter applies only to things that happen in a period: deals closed won or lost (`CLOSEDATE`), New Leads and Lead Source Performance (`DATE_CREATE`), and the Won vs Lost Trend.
- **Error List (formerly Missing Value):** open deals, and leads in In Progress / Hot / Warm, with **no potential value** (`OPPORTUNITY` 0 or empty) and/or **no customer name** (no contact, and none on the lead the deal came from). One row per record, listing its errors; a record leaves the list once every error is fixed. Each check is switchable in `config/mapping.json` → `missingValue` (`checkValue`, `checkCustomer`, `includeLeads`). Clicking any card number also opens the client list behind it (`GET /api/dashboard/records`).
- **Customer name from the lead:** for a deal with no customer, the Error List suggests the person from the lead the deal came from (`LEAD_ID`). Failing that, it uses a lead for the same company, matched ignoring Pvt/Ltd/Private/Limited and punctuation; the converted lead is preferred, then the newest. A Pipeline admin clicks **Apply**, and the server re-checks the match, reuses a Contact with the same name or creates one (copying the lead's phone and email, owned by the deal's responsible person), links it to the deal (`POST /api/deals/:id/customer {leadId}`) and audit-logs it. Nothing is written without that click. Many leads keep the person's name only in the lead **title**. When that is the only source, the row says "Lead #…'s title says <name> — add as the deal's customer in Bitrix24" with a link to the deal, and **no Apply**: the team updates it in Bitrix24.
- **Moving a deal to another pipeline** uses `crm.item.update` and puts the deal in the target pipeline's first open stage, because Bitrix24 ignores `CATEGORY_ID` on `crm.deal.update`. Changing the value only uses `crm.deal.update`.
- **Deal funnel conversion:** each percentage is the share of deals that reached the previous stage and also reached this one. This keeps every rate at 100% or below; dividing current-stage counts can exceed 100%.
- Trend "This Quarter" means the last 3 months (FR-8). The KPIs use the calendar quarter to date (IST).

## API (SRS §8)

`GET /api/dashboard` (combined) and the per-panel endpoints `/api/dashboard/{kpis,lead-funnel,deal-funnel,lead-sources,pipeline-breakdown,trend,deals-at-risk,missing-value}` accept `pipeline=all|sales|service|assets|custom` and `period=quarter|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.

`PATCH /api/deals/:id` and `PATCH /api/leads/:id` take `{categoryId?, value?}` and require the admin role. Every write is appended to `server/data/audit.log`.

Also available: `GET /api/meta/pipelines`, `GET /api/meta/last-sync`, `POST /api/sync`, `GET /api/admin/audit` and `GET|PUT /api/admin/stage-probabilities`.
