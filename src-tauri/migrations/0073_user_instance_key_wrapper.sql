-- Per-user instance-key wrapper mirror (unlock still uses sidecar; columns for in-DB audit).

ALTER TABLE users ADD COLUMN instance_key_wrap_version INTEGER;
ALTER TABLE users ADD COLUMN instance_key_wrap_salt TEXT;
ALTER TABLE users ADD COLUMN instance_key_wrapped TEXT;
ALTER TABLE users ADD COLUMN instance_key_wrap_created_at TEXT;
ALTER TABLE users ADD COLUMN instance_key_wrap_rotated_at TEXT;
