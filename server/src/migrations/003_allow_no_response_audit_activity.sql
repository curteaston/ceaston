ALTER TABLE audit_activities
  DROP CONSTRAINT IF EXISTS audit_activities_event_type_check;

ALTER TABLE audit_activities
  ADD CONSTRAINT audit_activities_event_type_check
  CHECK (event_type IN ('submission', 'inbound_response', 'no_response'));
