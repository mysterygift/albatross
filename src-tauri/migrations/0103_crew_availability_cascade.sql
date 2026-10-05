-- crew_availability (0074) referenced productions and people without ON DELETE CASCADE, unlike every
-- other production-owned table (see 0004_fk_cascade_refactor.sql). With foreign keys enforced, a
-- production or person with any crew availability rows could not be deleted ("FOREIGN KEY constraint
-- failed"). Rebuild the table with the same cascades as cast_availability; the Postgres schema
-- (postgres/migrations/0011_crew_availability.sql) already has them.

-- Rows left pointing at missing parents (from before foreign keys were enforced) can't be copied.
DELETE FROM crew_availability
WHERE production_id NOT IN (SELECT id FROM productions)
   OR person_id NOT IN (SELECT id FROM people);

CREATE TABLE crew_availability_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO crew_availability_new
  (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at, deleted_at)
SELECT id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at, deleted_at
FROM crew_availability;
DROP TABLE crew_availability;
ALTER TABLE crew_availability_new RENAME TO crew_availability;
CREATE INDEX IF NOT EXISTS idx_crew_availability_person_id ON crew_availability(person_id);
CREATE INDEX IF NOT EXISTS idx_crew_availability_production_id ON crew_availability(production_id);
