CREATE TABLE IF NOT EXISTS companies (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  domain           TEXT,
  industry         TEXT DEFAULT 'HVAC',
  employee_count   INTEGER,
  ad_spend_range   TEXT,
  website          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_uniq ON companies (lower(domain)) WHERE domain IS NOT NULL AND domain <> '';
CREATE INDEX IF NOT EXISTS companies_industry_idx ON companies (industry);
CREATE INDEX IF NOT EXISTS companies_last_activity_idx ON companies (last_activity_at);
-- Additive migrations for databases created before these columns existed.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'lead';
CREATE INDEX IF NOT EXISTS companies_lifecycle_idx ON companies (lifecycle_stage);

-- Key-value store for integration credentials and app-level settings.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  title             TEXT,
  email             TEXT,
  phone             TEXT,
  source            TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company_id);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts (lower(email));
-- Additive migrations for databases created before these columns existed.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'new';
CREATE INDEX IF NOT EXISTS contacts_lead_status_idx ON contacts (lead_status);

CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  contact_id   INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  due_date     DATE,
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  owner        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS tasks_company_idx ON tasks (company_id);
CREATE INDEX IF NOT EXISTS tasks_contact_idx ON tasks (contact_id);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks (due_date) WHERE NOT completed;

-- Outbound sequences (cadences): ordered steps that are either manual tasks
-- or auto-sent emails (sent from a separate sending domain, never the primary mailbox).
CREATE TABLE IF NOT EXISTS sequences (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id          SERIAL PRIMARY KEY,
  sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL,
  day_offset  INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','auto_email')),
  task_type   TEXT,                      -- call/email/linkedin/general (kind=task)
  description TEXT,                       -- task title (kind=task)
  priority    TEXT DEFAULT 'medium',
  subject     TEXT,                       -- (kind=auto_email)
  body        TEXT                        -- (kind=auto_email)
);
CREATE INDEX IF NOT EXISTS sequence_steps_seq_idx ON sequence_steps (sequence_id, step_order);

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id          SERIAL PRIMARY KEY,
  sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  owner       TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','unenrolled')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS seq_enroll_company_idx ON sequence_enrollments (company_id);
CREATE INDEX IF NOT EXISTS seq_enroll_status_idx ON sequence_enrollments (status);
-- Allow a 'replied' status (added after initial release): drop the original inline CHECK.
ALTER TABLE sequence_enrollments DROP CONSTRAINT IF EXISTS sequence_enrollments_status_check;

CREATE TABLE IF NOT EXISTS sequence_step_runs (
  id            SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_id       INTEGER NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  due_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped','sent','failed')),
  task_id       INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS seq_run_due_idx ON sequence_step_runs (due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS seq_run_enroll_idx ON sequence_step_runs (enrollment_id);

-- Saved views: named, reusable filter/sort presets per entity (company | contact).
CREATE TABLE IF NOT EXISTS saved_views (
  id         SERIAL PRIMARY KEY,
  entity     TEXT NOT NULL CHECK (entity IN ('company', 'contact')),
  name       TEXT NOT NULL,
  state      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_views_entity_idx ON saved_views (entity);

-- Outbound webhooks: POST a JSON payload to a URL (e.g. n8n) when CRM events fire.
CREATE TABLE IF NOT EXISTS webhooks (
  id          SERIAL PRIMARY KEY,
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',
  secret      TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status TEXT,
  last_fired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS deals (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  value               NUMERIC(12,2) DEFAULT 0,
  stage               TEXT NOT NULL DEFAULT 'lead',
  probability         INTEGER,
  expected_close_date DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_company_idx ON deals (company_id);
CREATE INDEX IF NOT EXISTS deals_stage_idx ON deals (stage);

CREATE TABLE IF NOT EXISTS notes (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id    INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','voice')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_company_idx ON notes (company_id);
CREATE INDEX IF NOT EXISTS notes_contact_idx ON notes (contact_id);

CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'call' CHECK (type IN ('call','email','sms','meeting','linkedin','stage_change','other')),
  outcome     TEXT,
  body        TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_company_idx ON activities (company_id);
CREATE INDEX IF NOT EXISTS activities_contact_idx ON activities (contact_id);
CREATE INDEX IF NOT EXISTS activities_occurred_idx ON activities (occurred_at);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_status TEXT;
