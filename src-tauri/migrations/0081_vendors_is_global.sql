-- Global vendors: identity shared across all productions; finance data stays per-production.

ALTER TABLE vendors ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_vendors_is_global ON vendors(is_global) WHERE deleted_at IS NULL;
