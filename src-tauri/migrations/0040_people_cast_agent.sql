-- People: add cast-specific metadata (nullable).
ALTER TABLE people ADD COLUMN cast_number TEXT;
ALTER TABLE people ADD COLUMN agent_name TEXT;
ALTER TABLE people ADD COLUMN agent_email TEXT;
ALTER TABLE people ADD COLUMN agent_phone TEXT;
