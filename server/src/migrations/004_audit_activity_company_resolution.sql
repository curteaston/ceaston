CREATE INDEX IF NOT EXISTS audit_activities_external_company_idx
  ON audit_activities (external_company_id)
  WHERE external_company_id IS NOT NULL AND external_company_id <> '';
