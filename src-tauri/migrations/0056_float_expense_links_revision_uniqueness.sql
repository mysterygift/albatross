-- Budget versioning follow-up: float-expense uniqueness must be revision-scoped.
-- Old global unique(expense_id) blocks cloning float matches into new revisions.

DROP INDEX IF EXISTS idx_float_expense_links_active_expense;

CREATE UNIQUE INDEX IF NOT EXISTS idx_float_expense_links_active_revision_expense
  ON float_expense_links(budget_revision_id, expense_id)
  WHERE deleted_at IS NULL;
