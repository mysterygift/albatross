CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID,
  action TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created_at
  ON audit_logs(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_project_created_at
  ON audit_logs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at
  ON audit_logs(action, created_at DESC);
