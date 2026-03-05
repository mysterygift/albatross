-- Stage 5: Fringes and contingency as configurable derived layers (display-only).
-- Rules define rate + base_kind + scope; scopes reference budget_accounts (subtrees).

CREATE TABLE IF NOT EXISTS fringe_rules (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  base_kind TEXT NOT NULL DEFAULT 'budget',
  scope_mode TEXT NOT NULL DEFAULT 'include_subtrees',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS fringe_rule_scopes (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES fringe_rules(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES budget_accounts(id) ON DELETE CASCADE,
  include_children INTEGER NOT NULL DEFAULT 1,
  UNIQUE(rule_id, account_id)
);

CREATE TABLE IF NOT EXISTS contingency_rules (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  base_kind TEXT NOT NULL DEFAULT 'budget',
  scope_mode TEXT NOT NULL DEFAULT 'include_subtrees',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS contingency_rule_scopes (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES contingency_rules(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES budget_accounts(id) ON DELETE CASCADE,
  include_children INTEGER NOT NULL DEFAULT 1,
  UNIQUE(rule_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_fringe_rules_production ON fringe_rules(production_id);
CREATE INDEX IF NOT EXISTS idx_fringe_rule_scopes_rule ON fringe_rule_scopes(rule_id);
CREATE INDEX IF NOT EXISTS idx_contingency_rules_production ON contingency_rules(production_id);
CREATE INDEX IF NOT EXISTS idx_contingency_rule_scopes_rule ON contingency_rule_scopes(rule_id);
