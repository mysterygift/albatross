-- Chart of accounts: archive instead of delete so historical totals remain correct.
-- listAccounts() includes archived; listPostableAccounts() excludes archived.

ALTER TABLE budget_accounts ADD COLUMN archived_at TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_accounts_production_archived ON budget_accounts(production_id, archived_at);
