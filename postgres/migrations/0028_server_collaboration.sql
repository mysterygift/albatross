-- Client-side collaboration state (SQLite 0067): server connections, linked productions, publish jobs, legacy outbox.
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE server_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  workspace_id UUID,
  account_username TEXT NOT NULL,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_server_connections PRIMARY KEY (id)
);

CREATE TABLE linked_projects (
  production_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  remote_project_id UUID NOT NULL,
  remote_project_url TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TIMESTAMPTZ,
  link_state TEXT NOT NULL DEFAULT 'linked',
  baseline_etag TEXT,
  CONSTRAINT pk_linked_projects PRIMARY KEY (production_id),
  CONSTRAINT ck_linked_projects_1 CHECK (link_state IN ('unlinked', 'publishing', 'linked', 'offline', 'conflict', 'unlinking')),
  CONSTRAINT fk_linked_projects_1_connection_id FOREIGN KEY (connection_id) REFERENCES server_connections(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_linked_projects_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE publish_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  status TEXT NOT NULL,
  progress_stage TEXT,
  progress_message TEXT,
  total_bytes INTEGER,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  CONSTRAINT pk_publish_jobs PRIMARY KEY (id),
  CONSTRAINT fk_publish_jobs_1_connection_id FOREIGN KEY (connection_id) REFERENCES server_connections(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_publish_jobs_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE server_outbox_pending (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  payload_json JSONB,
  expected_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  CONSTRAINT pk_server_outbox_pending PRIMARY KEY (id),
  CONSTRAINT fk_server_outbox_pending_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_linked_projects_connection ON linked_projects(connection_id);
CREATE INDEX idx_server_outbox_production ON server_outbox_pending(production_id, created_at);
