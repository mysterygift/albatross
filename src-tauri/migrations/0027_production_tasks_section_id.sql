-- Add section_id to production_tasks for section assignment.
-- NULL = unsectioned; non-null = task belongs to a section in the same production.

ALTER TABLE production_tasks ADD COLUMN section_id TEXT REFERENCES production_task_sections(id);
