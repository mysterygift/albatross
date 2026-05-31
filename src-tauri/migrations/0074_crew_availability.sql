-- Crew unavailability windows (parallel to cast_availability; not used in DooD)
CREATE TABLE IF NOT EXISTS crew_availability (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_crew_availability_person_id ON crew_availability(person_id);
CREATE INDEX IF NOT EXISTS idx_crew_availability_production_id ON crew_availability(production_id);
