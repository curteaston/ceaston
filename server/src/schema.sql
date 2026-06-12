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
