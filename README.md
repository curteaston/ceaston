# HVAC Prospect CRM

A lightweight, self-hostable B2B CRM purpose-built for prospecting HVAC contractors.
Designed for a solo sales operator managing 50–200 active prospect companies while
running concurrent outbound cadences.

**Stack:** Postgres · Express · React (Vite) + Zustand

## Features

- **Companies, Contacts, Deals, Tasks** — the four core objects, with contacts nested
  under companies, deals tied to companies, and tasks tied to a company or contact.
- **Single-screen company view** — all contacts (title + last contact date), a complete
  chronological timeline of every call, email, note and stage change across all
  contacts, deal pipeline status, and upcoming tasks.
- **Voice notes (speech-to-text)** — click the 🎤 button at company or contact level,
  speak, and the note is transcribed via the browser Web Speech API and saved
  automatically when you stop. Every note is timestamped and transcriptions are
  editable after the fact. (Works in Chrome, Edge and Safari.)
- **Advanced filtering & segmentation** — by employee count, monthly ad spend range,
  industry, days since last contact (incl. never contacted), and deal stage.
- **Pipeline board** — kanban-style view of deals across stages with stage moves
  logged to the company timeline.
- **Dashboard** — activity metrics (7/30 day), stage funnel with stage-to-stage
  conversion rates, win rate, contacts per company, and task completion rates.
- **Full REST API** — built for n8n: create companies, upsert contacts, log call
  outcomes and notes, fetch company + full contact history in a single payload,
  manage deals and tasks, search by name/domain.
- **Bulk import** — paste or upload a CSV to seed prospect lists; companies are
  matched by domain and updated, never duplicated, so re-importing is safe.
- **Prospecting data backup** — export a JSON snapshot of CRM records from Settings
  or `GET /api/export/snapshot` without exposing integration secrets.
- **Reports** — a date-range analytics page: activity over time, activity by type,
  pipeline snapshot, deal win rate, task completion, and per-sequence performance
  (enrollments / emails sent / replies), with CSV export.
- **Quick call logging** — clicking a phone number dials *and* pops a one-tap dialog
  to record the call outcome (connected, voicemail, booked meeting, …) to the timeline.
- **Sequence reply handling** — logging an interaction with outcome "replied" (or the
  "Mark replied" button on an enrollment) automatically pulls the contact out of every
  active sequence and cancels their remaining steps.
- **Saved views** — save a named, filtered/sorted preset on Companies and Contacts
  (e.g. "Untouched 14+ days, 50+ employees") and switch between them as tabs.
- **Bulk actions** — multi-select rows on Companies and Contacts to assign owner,
  change lifecycle/lead status, enroll companies in a sequence, or delete.
- **Outbound webhooks** — POST a JSON payload to an n8n (or any) URL when CRM events
  fire (`company.created`, `deal.won`, `sequence.email_sent`, …); deliveries are
  optionally HMAC-signed with an `X-CRM-Signature` header.
- **Outbound sequences (cadences)** — build multi-step plays where each step is
  either a **manual task** (the CRM creates a dated task in your queue) or an
  **auto-email** that sends on its due date. Enroll a company + contact; the
  scheduler advances enrollments, sends due emails (with `{{first_name}}` /
  `{{company}}` merge fields), reconciles completed tasks, and finishes or flags
  enrollments. Auto-emails send through a **separate sending domain** configured in
  Settings — never your primary Office 365 mailbox.

## Quick start (local viewing, recommended first)

Requires Node 20.19+ (or Node 22.12+) and PostgreSQL 18 installed locally. This path
does **not** use Docker. The simplest way to inspect or use the CRM locally is the
single-port build:

```bash
npm run install:all
npm run doctor
npm run start:local
```

Open http://localhost:3001/companies/1. `npm run start:local` builds the React app
and serves it from the API process on port `3001`. If a healthy API is already
running, it reuses that process and prints the URL; otherwise press `Ctrl+C` in
that terminal to stop the foreground server.

## Quick start (local development)

Use this when you are actively editing the React client and want Vite hot reload. It
first reuses an existing Postgres database on port `55432` when one is reachable;
otherwise it creates a workspace-owned Postgres data directory at `.local/pgdata`.
The API runs on `3001`, and the Vite client runs on `5173`.

```bash
npm run install:all
npm run doctor
npm run dev:local
npm run dev:local:check
npm run test:local
```

Open http://localhost:5173.

`npm run dev:local` is a foreground process that owns the API and Vite child
processes. Keep the terminal open while developing; press `Ctrl+C` to stop both
children and any workspace Postgres process started by that run. If `3001` or
`5173` is already occupied, startup fails instead of silently attaching to an
unknown process. Run `npm run dev:local:stop` first, or choose alternate ports:

```cmd
set LOCAL_CRM_API_PORT=3002
set LOCAL_CRM_UI_PORT=5174
npm run dev:local
```

The old detached-window launcher is still available as `npm run dev:local:legacy`
if you need it while troubleshooting, but it is no longer the recommended path.

`npm run doctor` checks Node/npm, PostgreSQL tooling, database reachability, and
whether the configured API/client ports are already occupied by the expected CRM services.
It also detects when the built client is being served from the single-port API
process. The goal is to distinguish missing services from blocking problems so
startup failures are less mysterious.

`npm run dev:local` seeds demo prospecting data only when the local database is empty.
Set `LOCAL_CRM_SEED=0` before startup if you want a completely blank local database.
`npm run seed` remains available for manual seeding, but do not use it as a repeated
startup step unless you are intentionally adding another set of demo deals, tasks,
notes, and activities.

Stop the local dev stack with:

```bash
npm run dev:local:stop
```

If PostgreSQL is installed somewhere other than `C:\Program Files\PostgreSQL\18\bin`,
set `PG_BIN` before running `npm run dev:local`.

If you already have a Postgres database you want to use, set `DATABASE_URL` before
startup. When `DATABASE_URL` is set, `npm run dev:local` skips local Postgres
initialization and uses that database for the API process.

`npm run test:local` runs API contract checks plus a headless Edge/Chrome smoke
render of `/companies/1`, sequence workflow checks, and a backup/restore
recovery drill. The browser and recovery smokes expect the demo prospecting
data that `npm run dev:local` creates when the local database is empty. If Edge
or Chrome is installed somewhere unusual, set `CRM_BROWSER_BIN` to the browser
executable path.

## Backup, restore, and recovery drill

Export a prospecting data snapshot from the running API:

```bash
npm run backup:snapshot
```

By default, snapshots are written to `.local/backups/`. You can choose a file:

```bash
npm run backup:snapshot -- --out .local/backups/before-import.json
```

Restore a snapshot into the configured database:

```bash
npm run restore:snapshot -- --file .local/backups/before-import.json
```

Restore refuses to replace a non-empty target unless you pass `--force`:

```bash
npm run restore:snapshot -- --file .local/backups/before-import.json --force
```

The restore replaces prospecting records only. `app_settings` are not exported
or restored, and webhook secrets are intentionally omitted, so connected
services may need to be reconnected after a disaster recovery restore.

Run the recovery drill anytime the local API is running:

```bash
npm run test:local:recovery
```

The drill exports a snapshot, creates a disposable Postgres database, restores
the snapshot into it, compares table counts, verifies sensitive settings stayed
out, and drops the disposable database.

## CI

GitHub Actions runs on every push and pull request. The workflow installs from
lockfiles, checks JavaScript syntax, builds the Vite client, boots the API
against a fresh Postgres service, seeds demo data only if the database is empty,
then runs API, browser, sequence workflow, and backup/restore recovery smokes.

Run the local equivalent before pushing:

```bash
npm run audit
npm run check:syntax
npm run test:import
npm run build
npm run dev:local:check
npm run test:local
```

## Quick start (manual local dev)

Use this only when you want to point the API at an existing database yourself.

```bash
npm run install:all

# point the API at your database (schema is created automatically on boot)
export DATABASE_URL=postgres://user:pass@localhost:5432/hvac_crm

npm run dev:server   # API on :3001
npm run dev:client   # UI on :5173 (proxies /api to :3001)

# optional: load demo data
npm run seed
```

For production without Docker: `npm run build` then `npm start` — the API server
serves the built React app on a single port. For local viewing, `npm run start:local`
wraps that pattern with the default local database URL.

## Quick start (Docker)

Docker remains supported, but it is not the recommended Windows development path
for this project.

```bash
docker compose up --build
# open http://localhost:3001
```

## Configuration

| Env var             | Default            | Purpose                                                                   |
| ------------------- | ------------------ | ------------------------------------------------------------------------- |
| `DATABASE_URL`      | local Postgres env | Postgres connection string                                                |
| `PORT`              | `3001`             | HTTP port                                                                 |
| `APP_PASSWORD`      | _(unset = open UI)_ | If set, the web UI requires this password to sign in (session cookie)     |
| `APP_SECRET`        | _(derived)_        | Optional extra secret mixed into session-cookie signing                   |
| `API_KEY`           | _(unset = open)_   | If set, `/api` calls need `X-Api-Key` header — used by n8n automations    |
| `ANTHROPIC_API_KEY` | _(unset)_          | Enables AI-powered company summaries (Claude); falls back to rules if unset |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | _(unset)_ | Microsoft Entra app credentials for the Office 365 email + calendar integration |
| `APP_BASE_URL`      | `http://localhost:3001` | Public base URL, used for the Office 365 OAuth redirect URI          |

## Authentication

The web UI and API are open by default (convenient for local/dev). For a hosted
deployment with real data, set credentials:

- **`APP_PASSWORD`** protects the **web UI** — visitors get a login screen and a
  signed, HttpOnly session cookie (30-day expiry; changing the password invalidates
  existing sessions). Set this before exposing the app publicly.
- **`API_KEY`** protects the **API for automations** (n8n) — send it as `X-Api-Key`
  or `Authorization: Bearer <key>`. API-key requests bypass the login cookie.

Set **both** for a hosted setup: the password for your browser, the key for n8n. If
only `API_KEY` is set, the browser app has no way to authenticate — use a password
too. Auth endpoints: `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout`.

## REST API (n8n-ready)

All endpoints accept/return JSON. If `API_KEY` is set, send it as `X-Api-Key`
(or `Authorization: Bearer <key>`).

### Companies

| Method   | Path                              | Notes                                                                                                                                              |
| -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/companies`                  | Active companies by default. Add `archived=true` for archived only or `archived=all` to include both. Filters: `q` (name/domain), `industry`, `ad_spend_range`, `employee_min/max`, `inactive_days`, `last_contact_before/after`, `deal_stage`, `no_deals=true`, `sort`, `order`, `limit`, `offset` |
| `POST`   | `/api/companies`                  | `{ name*, domain, industry, employee_count, ad_spend_range, website }`                                                                              |
| `GET`    | `/api/companies/:id`              | Company record only                                                                                                                                 |
| `GET`    | `/api/companies/:id/full`         | **Single payload:** company + contacts + deals + tasks + full timeline                                                                              |
| `GET`    | `/api/companies/lookup?domain=`   | Same full payload, looked up by domain (or `?name=`). Archived companies require `include_archived=true`.                                           |
| `GET`    | `/api/companies/:id/timeline`     | Chronological notes + activities across all contacts                                                                                                |
| `PATCH`  | `/api/companies/:id`              | Partial update                                                                                                                                      |
| `POST`   | `/api/companies/:id/archive`      | Archives the company, removes it from active prospecting views, and stops active sequence enrollments. Optional `{ reason }`                         |
| `POST`   | `/api/companies/:id/restore`      | Restores an archived company to active prospecting views                                                                                             |
| `DELETE` | `/api/companies/:id`              | Cascades to contacts/deals/tasks/notes; requires `{ confirm: "DELETE <company name>" }`                                                            |

### Contacts

| Method   | Path                         | Notes                                                                                       |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `GET`    | `/api/contacts`              | Active-company contacts by default. Filters: `q` (name/email/phone), `company_id`, `owner`, `unassigned=true`, `lead_status`, `source`, `title`, `has_email/has_phone=true`, `created_after/before`, `last_contact_after/before`, `never_contacted=true`, `inactive_days`, `sort`, `order`, `limit`, `offset` |
| `GET`    | `/api/contacts/facets?me=`   | Tab counts (all / mine / unassigned) and distinct owners                                     |
| `POST`   | `/api/contacts`              | `{ company_id* (or company_domain/company_name), name*, title, email, phone, source, owner, lead_status }` |
| `POST`   | `/api/contacts/upsert`       | Matches by email (then company+name); creates or updates. Ideal for n8n enrichment flows.   |
| `POST`   | `/api/contacts/bulk`         | `{ ids: [..], action: 'update'\|'delete', patch: { owner?, lead_status? } }`                 |
| `GET`    | `/api/contacts/:id/history`  | Individual conversation history (activities + notes)                                         |
| `PATCH`  | `/api/contacts/:id`          | Partial update                                                                               |
| `DELETE` | `/api/contacts/:id`          |                                                                                              |

Lead statuses: `new, attempted, connected, qualified, unqualified, customer`

### Activities (call/email logging)

| Method | Path              | Notes                                                                                                  |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/activities` | `?company_id=` `?contact_id=` `?type=`                                                                  |
| `POST` | `/api/activities` | `{ contact_id or company_id*, type: call/email/sms/meeting/linkedin/other, outcome, body, occurred_at }` — updates last-contact dates automatically |

### Notes

| Method   | Path             | Notes                                                                              |
| -------- | ---------------- | ----------------------------------------------------------------------------------- |
| `GET`    | `/api/notes`     | `?company_id=` `?contact_id=` `?deal_id=`                                            |
| `POST`   | `/api/notes`     | `{ company_id or contact_id or deal_id*, body*, source: 'typed'\|'voice' }`          |
| `PATCH`  | `/api/notes/:id` | `{ body }` — edit a transcription                                                    |
| `DELETE` | `/api/notes/:id` |                                                                                      |

### Deals

| Method   | Path             | Notes                                                                                              |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/deals`     | `?company_id=` `?stage=`                                                                             |
| `POST`   | `/api/deals`     | `{ company_id*, name*, value, stage, probability, expected_close_date }`                             |
| `PATCH`  | `/api/deals/:id` | Stage changes auto-log a timeline event and refresh the default probability unless one is provided.  |
| `DELETE` | `/api/deals/:id` |                                                                                                      |

Stages: `lead → contacted → qualified → proposal → negotiation → won / lost`

### Tasks

| Method   | Path             | Notes                                                                                                |
| -------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/tasks`     | `?company_id=` `?contact_id=` `?owner=` `?priority=` `?completed=` `?overdue=true` `?due_before=`      |
| `POST`   | `/api/tasks`     | `{ company_id or contact_id*, description*, due_date, priority: low/medium/high, owner }`              |
| `PATCH`  | `/api/tasks/:id` | `{ completed: true }` stamps `completed_at`                                                            |
| `DELETE` | `/api/tasks/:id` |                                                                                                        |

### Search, import, dashboard

| Method | Path              | Notes                                                                                                   |
| ------ | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/search?q=`  | Active companies by name/domain + active-company contacts by name/email                                     |
| `GET`  | `/api/companies/facets?me=` | Company tab counts (all/mine/unassigned/archived) + active-company owners                         |
| `POST` | `/api/companies/:id/summary` | AI lead summary (Claude when `ANTHROPIC_API_KEY` set, rule-based otherwise)                    |
| `POST` | `/api/email/send` | Send via connected Office 365 mailbox and log an email activity                                           |
| `GET`  | `/api/calendar/today` | Today's Office 365 calendar events (`{connected:false}` when not connected)                          |

### Sequences

| Method   | Path                                          | Notes                                                                                  |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET`    | `/api/sequences`                              | List sequences with step + active-enrollment counts                                    |
| `POST`   | `/api/sequences`                              | `{ name*, description, steps: [{ day_offset, kind: 'task'\|'auto_email', … }] }`        |
| `GET`/`PUT`/`DELETE` | `/api/sequences/:id`              | Fetch / replace (incl. steps) / delete                                                 |
| `POST`   | `/api/sequences/:id/enroll`                   | `{ company_id*, contact_id, owner }` — generates dated tasks + email runs              |
| `GET`    | `/api/sequences/enrollments/list?company_id=` | Enrollments with per-step progress                                                      |
| `POST`   | `/api/sequences/enrollments/:id/unenroll`     | Cancel remaining steps and delete open tasks                                            |
| `POST`   | `/api/sequences/enrollments/:id/replied`      | Mark replied — stop the cadence and cancel remaining steps                              |
| `GET`    | `/api/reports?from=&to=`                      | Date-range analytics (activity, deals, tasks, sequences, funnel)                       |
| `POST`   | `/api/sequences/enrollments/:id/retry`        | Re-send failed auto-email steps                                                         |
| `POST`   | `/api/sequences/run`                          | Manually trigger the scheduler (auto-runs every 5 min; handy for n8n)                  |
| `GET`/`PUT` | `/api/sequences/smtp`                       | Read / set the separate sending-domain SMTP config (`POST /smtp/test` to verify)       |

### Saved views, bulk actions, webhooks

| Method   | Path                          | Notes                                                                           |
| -------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `GET`    | `/api/views?entity=company`   | List saved views (`company` or `contact`)                                       |
| `POST`/`PUT`/`DELETE` | `/api/views[/:id]`   | `{ entity, name, state }` — `state` is the page's filter/sort preset            |
| `POST`   | `/api/companies/bulk`         | `{ ids, action: 'update'\|'archive'\|'restore'\|'delete', patch: { owner?, lifecycle_stage? } }`; delete requires `{ confirm: "DELETE <count> COMPANY/COMPANIES" }` |
| `POST`   | `/api/contacts/bulk`          | `{ ids, action: 'update'\|'delete', patch: { owner?, lead_status? } }`          |
| `GET`    | `/api/webhooks/events`        | List of emittable event types                                                   |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/webhooks[/:id]` | `{ url, events: [...], secret, active }`                                  |
| `POST`   | `/api/webhooks/:id/test`      | Send a sample payload to verify the endpoint                                     |
| `GET`    | `/api/export/snapshot`        | JSON snapshot of prospecting data; excludes `app_settings` and webhook secrets   |

Webhook events: `company.created`, `contact.created`, `deal.created`,
`deal.stage_changed`, `deal.won`, `deal.lost`, `activity.logged`, `task.completed`,
`sequence.email_sent`. Each delivery POSTs `{ event, data, fired_at }`; if the webhook
has a secret, an `X-CRM-Signature: sha256=<hmac>` header is included for verification.

Step kinds: `task` (creates a dated task — `task_type`, `description`, `priority`) or
`auto_email` (`subject`, `body` with `{{first_name}}`, `{{last_name}}`, `{{name}}`,
`{{title}}`, `{{company}}`, `{{domain}}` merge fields). `day_offset` is days after
enrollment. The auto-email scheduler runs in-process every 5 minutes.
| `POST` | `/api/import`     | `{ companies: [{ name*, domain, …, contacts: [{ name*, … }] }] }` — transactional upsert, max 2000/call   |
| `GET`  | `/api/dashboard`  | All dashboard metrics in one call                                                                         |
| `GET`  | `/api/meta`       | Valid stages / ad-spend ranges / priorities                                                               |
| `GET`  | `/api/health`     | Liveness + DB check                                                                                       |

### Example n8n call flow

```text
1. POST /api/contacts/upsert        { company_domain, name, email, title }
2. POST /api/activities             { contact_id, type: "call", outcome: "connected", body: "..." }
3. POST /api/notes                  { contact_id, body: "transcribed call summary", source: "typed" }
4. GET  /api/companies/lookup?domain=acmehvac.com   → full history payload for the next touch
```

## Importing data

The **Bulk import** page accepts a **CSV or Excel (`.xlsx`) file** — or pasted
rows — with **whatever column names your spreadsheet already uses**. After upload you
map each of your columns to a CRM field; the importer auto-guesses the obvious matches
(e.g. "Business"→Company name, "# Staff"→Employee count) and you adjust the rest. Only
**Company name** must be mapped.

Legacy `.xls` files are not supported; save them as `.xlsx` or CSV before importing.

Mappable fields — company: name (required), domain, website, industry, employee_count,
ad_spend_range, lifecycle_stage, company_phone · contact: first_name, last_name,
title, primary_email, secondary_email, direct_phone, cell_phone, other_phone,
source. Repeat a company across rows to attach multiple contacts. Companies are matched
by normalized domain when available, then by name, so re-importing an enriched list is safer.

The underlying `POST /api/import` endpoint takes a pre-shaped JSON payload (see the API
table above) and is what n8n should call directly; the mapping step is a convenience in
the UI for ad-hoc spreadsheet uploads.
