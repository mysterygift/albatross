-- Risk assessments (RAMS): one per shoot day / unit set, with hazards, safety contacts and sign-off.
-- Risk factor (severity x probability) is always computed in code, never stored.

CREATE TABLE IF NOT EXISTS risk_assessments (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  location_name TEXT NOT NULL DEFAULT '',
  activities TEXT NOT NULL DEFAULT '',
  responsible_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  responsible_person_name TEXT NOT NULL DEFAULT '',
  -- JSON array of { name, phone, email } (same precedent as shoot_days.meal_times_json).
  first_aiders_json TEXT,
  hospital_name TEXT,
  hospital_address TEXT,
  hospital_phone TEXT,
  police_name TEXT,
  police_address TEXT,
  police_phone TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  approved_by TEXT,
  approved_at TEXT,
  -- Latest exported PDF. Deleting that document from the Documents hub keeps the RAMS.
  generated_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_production ON risk_assessments(production_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_shoot_day ON risk_assessments(shoot_day_id);

-- Which units a RAMS covers on its shoot day (one or both).
CREATE TABLE IF NOT EXISTS risk_assessment_units (
  id TEXT PRIMARY KEY,
  risk_assessment_id TEXT NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  shoot_day_unit_id TEXT NOT NULL REFERENCES shoot_day_units(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_assessment_units_unique
  ON risk_assessment_units(risk_assessment_id, shoot_day_unit_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_units_sdu ON risk_assessment_units(shoot_day_unit_id);

CREATE TABLE IF NOT EXISTS risk_assessment_hazards (
  id TEXT PRIMARY KEY,
  risk_assessment_id TEXT NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  control_measures TEXT NOT NULL DEFAULT '',
  at_risk_crew INTEGER NOT NULL DEFAULT 0,
  at_risk_cast INTEGER NOT NULL DEFAULT 0,
  at_risk_public INTEGER NOT NULL DEFAULT 0,
  severity_before INTEGER NOT NULL DEFAULT 3 CHECK (severity_before BETWEEN 1 AND 5),
  probability_before INTEGER NOT NULL DEFAULT 3 CHECK (probability_before BETWEEN 1 AND 5),
  severity_after INTEGER NOT NULL DEFAULT 2 CHECK (severity_after BETWEEN 1 AND 5),
  probability_after INTEGER NOT NULL DEFAULT 2 CHECK (probability_after BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_hazards_ra
  ON risk_assessment_hazards(risk_assessment_id, sort_order);

-- Project-scoped reusable hazards ("Save as template"). Hard-deleted, so UNIQUE(name) can be reused.
CREATE TABLE IF NOT EXISTS hazard_templates (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  control_measures TEXT NOT NULL DEFAULT '',
  at_risk_crew INTEGER NOT NULL DEFAULT 0,
  at_risk_cast INTEGER NOT NULL DEFAULT 0,
  at_risk_public INTEGER NOT NULL DEFAULT 0,
  severity_before INTEGER NOT NULL DEFAULT 3 CHECK (severity_before BETWEEN 1 AND 5),
  probability_before INTEGER NOT NULL DEFAULT 3 CHECK (probability_before BETWEEN 1 AND 5),
  severity_after INTEGER NOT NULL DEFAULT 2 CHECK (severity_after BETWEEN 1 AND 5),
  probability_after INTEGER NOT NULL DEFAULT 2 CHECK (probability_after BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (production_id, name)
);
