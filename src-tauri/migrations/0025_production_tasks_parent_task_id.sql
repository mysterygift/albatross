-- Add parent_task_id to production_tasks for subtask nesting.
-- NULL = top-level task; non-null = subtask of another task in the same production.

ALTER TABLE production_tasks ADD COLUMN parent_task_id TEXT;
