CREATE TABLE IF NOT EXISTS data_audit_batches (
  id             TEXT PRIMARY KEY,
  action         TEXT NOT NULL,
  summary        TEXT,
  actor          TEXT,
  request_method TEXT,
  request_path   TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  undoable       BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at      TIMESTAMPTZ,
  undo_batch_id  TEXT,
  undo_error     TEXT
);

CREATE TABLE IF NOT EXISTS data_audit_events (
  id            BIGSERIAL PRIMARY KEY,
  batch_id      TEXT NOT NULL REFERENCES data_audit_batches(id) ON DELETE CASCADE,
  operation     TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  table_name    TEXT NOT NULL,
  record_pk     JSONB NOT NULL,
  before_data   JSONB,
  after_data    JSONB,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at     TIMESTAMPTZ,
  undo_batch_id TEXT
);

CREATE INDEX IF NOT EXISTS data_audit_batches_created_idx ON data_audit_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS data_audit_batches_action_idx ON data_audit_batches (action);
CREATE INDEX IF NOT EXISTS data_audit_events_batch_idx ON data_audit_events (batch_id, id);
CREATE INDEX IF NOT EXISTS data_audit_events_record_idx ON data_audit_events (table_name, record_pk);
