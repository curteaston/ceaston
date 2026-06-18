CREATE TABLE IF NOT EXISTS audit_activities (
  id                  SERIAL PRIMARY KEY,
  event_key           TEXT NOT NULL UNIQUE,
  event_type          TEXT NOT NULL CHECK (event_type IN ('submission', 'inbound_response')),
  audit_id            TEXT,
  event_id            TEXT,
  company_id          INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  external_company_id TEXT,
  company_name        TEXT NOT NULL,
  contact_form_url    TEXT,
  submitted_at        TIMESTAMPTZ,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submission_status   TEXT,
  audit_status        TEXT,
  match_status        TEXT,
  response_kind       TEXT,
  response_label      TEXT,
  response_time_hours NUMERIC,
  response_bucket     TEXT,
  match_reason        TEXT,
  match_score         NUMERIC,
  confidence          TEXT,
  ai_confidence       NUMERIC,
  final_url           TEXT,
  evidence_dir        TEXT,
  result_json         JSONB,
  transcript          TEXT,
  recording_url       TEXT,
  caller_phone        TEXT,
  called_number       TEXT,
  raw_payload         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_activities_company_idx ON audit_activities (company_id);
CREATE INDEX IF NOT EXISTS audit_activities_company_name_idx ON audit_activities (lower(company_name));
CREATE INDEX IF NOT EXISTS audit_activities_audit_id_idx ON audit_activities (audit_id);
CREATE INDEX IF NOT EXISTS audit_activities_occurred_idx ON audit_activities (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_activities_type_idx ON audit_activities (event_type);
