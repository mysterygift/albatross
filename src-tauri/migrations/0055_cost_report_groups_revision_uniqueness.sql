-- Budget versioning follow-up: cost_report_groups uniqueness must be revision-scoped.
-- Previous uniqueness on (production_id, name/code) blocks cloning groups into new revisions.

PRAGMA foreign_keys = OFF;

CREATE TABLE cost_report_groups_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(production_id, budget_revision_id, name)
);

INSERT INTO cost_report_groups_new (
  id,
  production_id,
  budget_revision_id,
  code,
  name,
  sort_order,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  id,
  production_id,
  budget_revision_id,
  code,
  name,
  sort_order,
  created_at,
  updated_at,
  deleted_at
FROM cost_report_groups;

DROP TABLE cost_report_groups;
ALTER TABLE cost_report_groups_new RENAME TO cost_report_groups;

CREATE INDEX IF NOT EXISTS idx_cost_report_groups_production ON cost_report_groups(production_id);
CREATE INDEX IF NOT EXISTS idx_cost_report_groups_budget_revision_id ON cost_report_groups(budget_revision_id);

-- Unique code per revision when code is not null (app validates further).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_report_groups_production_revision_code
  ON cost_report_groups(production_id, budget_revision_id, code)
  WHERE code IS NOT NULL;

PRAGMA foreign_keys = ON;
