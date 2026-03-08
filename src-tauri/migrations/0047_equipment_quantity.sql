-- Equipment quantity: count of identical units per registry row (e.g. 8× Sandbags).
-- Existing rows backfilled to quantity = 1.

ALTER TABLE equipment ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);
