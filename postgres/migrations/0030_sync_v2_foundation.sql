-- Sync-v2 durable client state (SQLite 0087).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE sync_client_identity (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  device_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_client_identity PRIMARY KEY (id)
);

CREATE TABLE sync_mutation_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  client_id UUID NOT NULL,
  local_sequence INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  base_epoch TEXT NOT NULL,
  base_cursor INTEGER NOT NULL,
  protocol_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  registry_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  request_hash TEXT,
  accepted_cursor INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_mutation_batches PRIMARY KEY (id),
  CONSTRAINT ck_sync_mutation_batches_1 CHECK (local_sequence >= 0),
  CONSTRAINT ck_sync_mutation_batches_2 CHECK (length(base_epoch) > 0),
  CONSTRAINT ck_sync_mutation_batches_3 CHECK (base_cursor >= 0),
  CONSTRAINT ck_sync_mutation_batches_4 CHECK (length(protocol_version) > 0),
  CONSTRAINT ck_sync_mutation_batches_5 CHECK (schema_version > 0),
  CONSTRAINT ck_sync_mutation_batches_6 CHECK (length(registry_hash) > 0),
  CONSTRAINT ck_sync_mutation_batches_7 CHECK (state IN ('pending', 'in_flight', 'blocked', 'accepted', 'failed')),
  CONSTRAINT ck_sync_mutation_batches_8 CHECK (attempt_count >= 0),
  CONSTRAINT ck_sync_mutation_batches_9 CHECK (accepted_cursor IS NULL OR accepted_cursor >= 0),
  CONSTRAINT fk_sync_mutation_batches_1_client_id FOREIGN KEY (client_id) REFERENCES sync_client_identity(id) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT fk_sync_mutation_batches_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_mutations (
  batch_id UUID NOT NULL,
  operation_index INTEGER NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  base_server_version INTEGER,
  base_values_json JSONB,
  patch_json JSONB,
  full_row_json JSONB,
  local_result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_mutations PRIMARY KEY (batch_id, operation_index),
  CONSTRAINT ck_sync_mutations_1 CHECK (operation_index >= 0),
  CONSTRAINT ck_sync_mutations_2 CHECK (operation IN ('create', 'patch', 'delete')),
  CONSTRAINT ck_sync_mutations_3 CHECK (base_server_version IS NULL OR base_server_version > 0),
  CONSTRAINT ck_sync_mutations_4 CHECK ((operation = 'create' AND base_server_version IS NULL AND base_values_json IS NULL AND patch_json IS NULL AND full_row_json IS NOT NULL)
    OR
    (operation = 'patch' AND base_server_version > 0 AND base_values_json IS NOT NULL AND patch_json IS NOT NULL AND full_row_json IS NULL)
    OR
    (operation = 'delete' AND base_server_version > 0 AND base_values_json IS NOT NULL AND patch_json IS NULL AND full_row_json IS NULL)),
  CONSTRAINT fk_sync_mutations_1_batch_id FOREIGN KEY (batch_id) REFERENCES sync_mutation_batches(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  operation_index INTEGER NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  conflict_type TEXT NOT NULL,
  base_snapshot_json JSONB,
  local_snapshot_json JSONB,
  server_snapshot_json JSONB,
  changed_fields_json JSONB,
  server_version INTEGER,
  server_cursor INTEGER,
  state TEXT NOT NULL DEFAULT 'unresolved',
  resolution_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_conflicts PRIMARY KEY (id),
  CONSTRAINT ck_sync_conflicts_1 CHECK (conflict_type IN ('same_field', 'update_delete', 'delete_update', 'dependent_row')),
  CONSTRAINT ck_sync_conflicts_2 CHECK (state IN ('unresolved', 'resolved', 'discarded')),
  CONSTRAINT ck_sync_conflicts_3 CHECK (server_version IS NULL OR server_version >= 0),
  CONSTRAINT ck_sync_conflicts_4 CHECK (server_cursor IS NULL OR server_cursor >= 0),
  CONSTRAINT fk_sync_conflicts_1_batch_id FOREIGN KEY (batch_id, operation_index) REFERENCES sync_mutations(batch_id, operation_index) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_sync_conflicts_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_project_state (
  production_id UUID NOT NULL,
  connection_id UUID,
  server_project_id UUID,
  mode TEXT NOT NULL DEFAULT 'local_only',
  epoch TEXT,
  applied_cursor INTEGER NOT NULL DEFAULT 0,
  head_cursor INTEGER NOT NULL DEFAULT 0,
  protocol_version TEXT,
  schema_version INTEGER,
  registry_hash TEXT,
  credential_ref TEXT,
  rebootstrap_reason TEXT,
  last_sync_started_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_project_state PRIMARY KEY (production_id),
  CONSTRAINT ck_sync_project_state_1 CHECK (mode IN (
    'local_only',
    'enabling',
    'collaborative',
    'offline',
    'paused',
    'conflicts',
    'disabling',
    'needs_rebootstrap'
  )),
  CONSTRAINT ck_sync_project_state_2 CHECK (applied_cursor >= 0),
  CONSTRAINT ck_sync_project_state_3 CHECK (head_cursor >= 0),
  CONSTRAINT ck_sync_project_state_4 CHECK (head_cursor >= applied_cursor),
  CONSTRAINT fk_sync_project_state_1_connection_id FOREIGN KEY (connection_id) REFERENCES server_connections(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_sync_project_state_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_apply_guard (
  production_id UUID NOT NULL,
  guarded_cursor INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_apply_guard PRIMARY KEY (production_id),
  CONSTRAINT ck_sync_apply_guard_1 CHECK (guarded_cursor >= 0),
  CONSTRAINT fk_sync_apply_guard_1_production_id FOREIGN KEY (production_id) REFERENCES sync_project_state(production_id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_row_state (
  production_id UUID NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  server_version INTEGER NOT NULL,
  applied_cursor INTEGER NOT NULL,
  is_tombstone INTEGER NOT NULL DEFAULT 0,
  row_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_row_state PRIMARY KEY (production_id, entity_table, entity_id),
  CONSTRAINT ck_sync_row_state_1 CHECK (server_version > 0),
  CONSTRAINT ck_sync_row_state_2 CHECK (applied_cursor >= 0),
  CONSTRAINT ck_sync_row_state_3 CHECK (is_tombstone IN (0, 1)),
  CONSTRAINT fk_sync_row_state_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_sync_mutation_batches_client
  ON sync_mutation_batches(client_id, created_at);
CREATE INDEX idx_sync_mutation_batches_ready
  ON sync_mutation_batches(production_id, state, next_attempt_at, local_sequence);
CREATE UNIQUE INDEX sqlite_autoindex_sync_mutation_batches_2 ON sync_mutation_batches(production_id, local_sequence);
CREATE INDEX idx_sync_mutations_entity
  ON sync_mutations(entity_table, entity_id);
CREATE INDEX idx_sync_conflicts_entity
  ON sync_conflicts(production_id, entity_table, entity_id, state);
CREATE INDEX idx_sync_conflicts_production_state
  ON sync_conflicts(production_id, state, created_at);
CREATE INDEX idx_sync_project_state_mode
  ON sync_project_state(mode);
CREATE INDEX idx_sync_project_state_connection
  ON sync_project_state(connection_id);
CREATE INDEX idx_sync_row_state_cursor
  ON sync_row_state(production_id, applied_cursor);
