-- Productions: optional marker for template used at creation (e.g. 'demo' for user-created demo-template productions).
-- Used to detect an existing demo-style project before creating another (override confirmation flow).
ALTER TABLE productions ADD COLUMN created_from_template TEXT;
