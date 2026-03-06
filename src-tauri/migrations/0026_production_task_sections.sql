-- User-defined task sections for production-stage organization (e.g. Development, Pre-Production, Shoot, Post, Delivery).

CREATE TABLE production_task_sections (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE UNIQUE INDEX idx_task_sections_production_name
  ON production_task_sections(production_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_sections_production ON production_task_sections(production_id);
