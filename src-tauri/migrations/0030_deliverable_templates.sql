-- Deliverable templates: reusable packages for creating standard deliverables on a production.
-- Similar in spirit to task_templates; not production-scoped.

CREATE TABLE deliverable_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE TABLE deliverable_template_items (
  id TEXT PRIMARY KEY,
  deliverable_template_id TEXT NOT NULL REFERENCES deliverable_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  due_offset_days INTEGER NULL,
  default_status TEXT NULL,
  spec_defaults_json TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE INDEX idx_deliverable_template_items_template ON deliverable_template_items(deliverable_template_id);
