-- Track when a user has manually adjusted ranges on a generated section so regeneration preserves them.
ALTER TABLE script_sections ADD COLUMN ranges_user_edited INTEGER NOT NULL DEFAULT 0 CHECK (ranges_user_edited IN (0, 1));
