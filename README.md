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
- **Outbound sequences (cadences)** — build multi-step plays where each step is
  either a **manual task** (the CRM creates a dated task in your queue) or an
  **auto-email** that sends on its due date. Enroll a company + contact; the
  scheduler advances enrollments, sends due emails (with `{{first_name}}` /
  `{{company}}` merge fields), reconciles completed tasks, and finishes or flags
  enrollments. Auto-emails send through a **separate sending domain** configured in
  Settings — never your primary Office 365 mailbox.

## Quick start (Docker)

```bash
docker compose up --build
# open http://localhost:3001
```

## Quick start (local dev)

Requires Node 20+ and a Postgres database.

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
serves the built React app on a single port.

## Configuration

| Env var             | Default            | Purpose                                                                   |
| ------------------- | ------------------ | ------------------------------------------------------------------------- |
| `DATABASE_URL`      | local Postgres env | Postgres connection string                                                |
| `PORT`              | `3001`             | HTTP port                                                                 |
| `API_KEY`           | _(unset = open)_   | If set, all `/api` calls need `X-Api-Key` header                          |
| `ANTHROPIC_API_KEY` | _(unset)_          | Enables AI-powered company summaries (Claude); falls back to rules if unset |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | _(unset)_ | Microsoft Entra app credentials for the Office 365 email + calendar integration |
| `APP_BASE_URL`      | `http://localhost:3001` | Public base URL, used for the Office 365 OAuth redirect URI          |

## REST API (n8n-ready)

All endpoints accept/return JSON. If `API_KEY` is set, send it as `X-Api-Key`
(or `Authorization: Bearer <key>`).

### Companies

| Method   | Path                              | Notes                                                                                                                                              |
| -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/companies`                  | Filters: `q` (name/domain), `industry`, `ad_spend_range`, `employee_min/max`, `inactive_days`, `last_contact_before/after`, `deal_stage`, `no_deals=true`, `sort`, `order`, `limit`, `offset` |
| `POST`   | `/api/companies`                  | `{ name*, domain, industry, employee_count, ad_spend_range, website }`                                                                              |
| `GET`    | `/api/companies/:id`              | Company record only                                                                                                                                 |
| `GET`    | `/api/companies/:id/full`         | **Single payload:** company + contacts + deals + tasks + full timeline                                                                              |
| `GET`    | `/api/companies/lookup?domain=`   | Same full payload, looked up by domain (or `?name=`)                                                                                                |
| `GET`    | `/api/companies/:id/timeline`     | Chronological notes + activities across all contacts                                                                                                |
| `PATCH`  | `/api/companies/:id`              | Partial update                                                                                                                                      |
| `DELETE` | `/api/companies/:id`              | Cascades to contacts/deals/tasks/notes                                                                                                              |

### Contacts

| Method   | Path                         | Notes                                                                                       |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `GET`    | `/api/contacts`              | Paginated list. Filters: `q` (name/email/phone), `company_id`, `owner`, `unassigned=true`, `lead_status`, `source`, `title`, `has_email/has_phone=true`, `created_after/before`, `last_contact_after/before`, `never_contacted=true`, `inactive_days`, `sort`, `order`, `limit`, `offset` |
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
| `GET`  | `/api/search?q=`  | Companies by name/domain + contacts by name/email                                                         |
| `GET`  | `/api/companies/facets?me=` | Company tab counts (all/mine/unassigned) + distinct owners                                      |
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
| `POST`   | `/api/sequences/enrollments/:id/retry`        | Re-send failed auto-email steps                                                         |
| `POST`   | `/api/sequences/run`                          | Manually trigger the scheduler (auto-runs every 5 min; handy for n8n)                  |
| `GET`/`PUT` | `/api/sequences/smtp`                       | Read / set the separate sending-domain SMTP config (`POST /smtp/test` to verify)       |

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

The **Bulk import** page accepts a **CSV or Excel (`.xlsx`/`.xls`) file** — or pasted
rows — with **whatever column names your spreadsheet already uses**. After upload you
map each of your columns to a CRM field; the importer auto-guesses the obvious matches
(e.g. "Business"→Company name, "# Staff"→Employee count) and you adjust the rest. Only
**Company name** must be mapped.

Mappable fields — company: name (required), domain, website, industry, employee_count,
ad_spend_range, owner, lifecycle_stage · contact: contact_name, contact_title,
contact_email, contact_phone, contact_source. Repeat a company across rows to attach
multiple contacts. Companies are matched by domain (then name) and updated rather than
duplicated, so re-importing an enriched list is safe.

The underlying `POST /api/import` endpoint takes a pre-shaped JSON payload (see the API
table above) and is what n8n should call directly; the mapping step is a convenience in
the UI for ad-hoc spreadsheet uploads.
