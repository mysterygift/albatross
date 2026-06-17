-- Global vendors: identity shared across all productions; finance data stays per-production.

ALTER TABLE vendors ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_vendors_is_global ON vendors(is_global) WHERE deleted_at IS NULL;
