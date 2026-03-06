-- Replace checklist_items with production_tasks (task system).
-- Migrate: title -> description, status='complete' -> is_complete=1, is_required=1 -> priority=1.

CREATE TABLE production_tasks (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  due_date TEXT,
  assigned_department TEXT,
  priority INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO production_tasks (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, created_at, updated_at, deleted_at)
SELECT
  id,
  production_id,
  title,
  CASE WHEN status = 'complete' THEN 1 ELSE 0 END,
  NULL,
  NULL,
  NULL,
  CASE WHEN is_required = 1 THEN 1 ELSE NULL END,
  created_at,
  updated_at,
  deleted_at
FROM checklist_items;

DROP TABLE checklist_items;

CREATE INDEX IF NOT EXISTS idx_production_tasks_production_id ON production_tasks(production_id);
