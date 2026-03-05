-- Productions: add archive support. Archived productions are hidden from default list; reversible.
ALTER TABLE productions ADD COLUMN archived_at TEXT;
