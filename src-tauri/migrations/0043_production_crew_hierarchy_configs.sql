-- Production-scoped crew hierarchy config (departments, roles, HOD, task mapping).
-- One row per production; config_json holds full hierarchy. Runtime consumers still use
-- global hierarchy until a later stage.

CREATE TABLE IF NOT EXISTS production_crew_hierarchy_configs (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(production_id)
);

CREATE INDEX IF NOT EXISTS idx_production_crew_hierarchy_configs_production_id
  ON production_crew_hierarchy_configs(production_id);
