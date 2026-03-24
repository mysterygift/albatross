-- Budget revisions (BV1 foundation): allow multiple budget scenarios per production.
-- This migration is additive and backfills a default live revision ("Current budget")
-- for productions that already have budget-scoped data.

CREATE TABLE IF NOT EXISTS budget_revisions (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_from_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE SET NULL,
  is_live INTEGER NOT NULL DEFAULT 0 CHECK (is_live IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_budget_revisions_production_id
  ON budget_revisions(production_id);

-- Enforce at most one active live revision per production.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_revisions_one_live_per_production
  ON budget_revisions(production_id)
  WHERE is_live = 1 AND deleted_at IS NULL;

-- Revision-scoped tables get a revision FK.
ALTER TABLE budget_items ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE production_totals ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE cost_report_groups ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE budget_item_expense_links ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE floats ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE float_expense_links ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE fringe_rules ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;
ALTER TABLE contingency_rules ADD COLUMN budget_revision_id TEXT REFERENCES budget_revisions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_budget_items_budget_revision_id ON budget_items(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_production_totals_budget_revision_id ON production_totals(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_cost_report_groups_budget_revision_id ON cost_report_groups(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_budget_item_expense_links_budget_revision_id ON budget_item_expense_links(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_floats_budget_revision_id ON floats(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_float_expense_links_budget_revision_id ON float_expense_links(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_fringe_rules_budget_revision_id ON fringe_rules(budget_revision_id);
CREATE INDEX IF NOT EXISTS idx_contingency_rules_budget_revision_id ON contingency_rules(budget_revision_id);

-- Backfill one default live revision for productions that already hold budget-scoped data.
-- Includes soft-deleted rows to avoid orphaning historical data.
CREATE TEMP TABLE _budget_revision_backfill_targets (
  production_id TEXT PRIMARY KEY,
  budget_revision_id TEXT NOT NULL
);

INSERT INTO _budget_revision_backfill_targets (production_id, budget_revision_id)
SELECT production_id,
       lower(hex(randomblob(4))) || '-' ||
       lower(hex(randomblob(2))) || '-' ||
       lower(hex(randomblob(2))) || '-' ||
       lower(hex(randomblob(2))) || '-' ||
       lower(hex(randomblob(6)))
FROM (
  SELECT production_id FROM budget_items
  UNION
  SELECT production_id FROM production_totals
  UNION
  SELECT production_id FROM cost_report_groups
  UNION
  SELECT production_id FROM budget_item_expense_links
  UNION
  SELECT production_id FROM floats
  UNION
  SELECT f.production_id
    FROM float_expense_links l
    INNER JOIN floats f ON f.id = l.float_id
  UNION
  SELECT production_id FROM fringe_rules
  UNION
  SELECT production_id FROM contingency_rules
) t
WHERE production_id IS NOT NULL;

INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
SELECT
  b.budget_revision_id,
  b.production_id,
  'Current budget',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM _budget_revision_backfill_targets b;

UPDATE budget_items
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = budget_items.production_id
)
WHERE budget_revision_id IS NULL;

UPDATE production_totals
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = production_totals.production_id
)
WHERE budget_revision_id IS NULL;

UPDATE cost_report_groups
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = cost_report_groups.production_id
)
WHERE budget_revision_id IS NULL;

UPDATE budget_item_expense_links
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = budget_item_expense_links.production_id
)
WHERE budget_revision_id IS NULL;

UPDATE floats
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = floats.production_id
)
WHERE budget_revision_id IS NULL;

UPDATE float_expense_links
SET budget_revision_id = (
  SELECT f.budget_revision_id
  FROM floats f
  WHERE f.id = float_expense_links.float_id
)
WHERE budget_revision_id IS NULL;

UPDATE fringe_rules
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = fringe_rules.production_id
)
WHERE budget_revision_id IS NULL;

UPDATE contingency_rules
SET budget_revision_id = (
  SELECT b.budget_revision_id
  FROM _budget_revision_backfill_targets b
  WHERE b.production_id = contingency_rules.production_id
)
WHERE budget_revision_id IS NULL;

DROP TABLE _budget_revision_backfill_targets;
