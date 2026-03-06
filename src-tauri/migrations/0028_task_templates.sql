-- Task templates: global reusable task definitions for quick task generation.
-- Templates are not production-scoped; they can be applied to any production.

CREATE TABLE task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE TABLE task_template_items (
  id TEXT PRIMARY KEY,
  task_template_id TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  notes TEXT NULL,
  due_offset_days INTEGER NULL,
  assigned_department TEXT NULL,
  priority INTEGER NULL,
  section_name TEXT NULL,
  parent_template_item_id TEXT NULL REFERENCES task_template_items(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE INDEX idx_task_template_items_template ON task_template_items(task_template_id);
CREATE INDEX idx_task_template_items_parent ON task_template_items(parent_template_item_id);
