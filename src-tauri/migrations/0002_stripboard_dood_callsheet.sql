-- Stripboard (multi-unit, strip types), DOOD (scene_cast, availability), Call sheet (key_contacts, shoot_day fields)

-- Units per production (Main Unit, 2nd Unit, etc.)
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Link shoot days to units (one row per day per unit; is_locked blocks DnD)
CREATE TABLE IF NOT EXISTS shoot_day_units (
  id TEXT PRIMARY KEY,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  notes TEXT,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(shoot_day_id, unit_id)
);

-- Extend shoot_days for call sheet fields (nullable; some may exist)
ALTER TABLE shoot_days ADD COLUMN wrap_time TEXT;
ALTER TABLE shoot_days ADD COLUMN meal_times_json TEXT;
ALTER TABLE shoot_days ADD COLUMN weather_json TEXT;
ALTER TABLE shoot_days ADD COLUMN parking_base_address TEXT;
ALTER TABLE shoot_days ADD COLUMN special_notes TEXT;
ALTER TABLE shoot_days ADD COLUMN hospital_name TEXT;
ALTER TABLE shoot_days ADD COLUMN hospital_address TEXT;
ALTER TABLE shoot_days ADD COLUMN police_station_name TEXT;
ALTER TABLE shoot_days ADD COLUMN police_station_address TEXT;

-- SQLite doesn't support ADD COLUMN IF NOT EXISTS; ignore errors if already present
-- Scenes: add title, int_ext, day_night, page_eighths, location_id
ALTER TABLE scenes ADD COLUMN title TEXT;
ALTER TABLE scenes ADD COLUMN int_ext TEXT;
ALTER TABLE scenes ADD COLUMN day_night TEXT;
ALTER TABLE scenes ADD COLUMN page_eighths INTEGER;
ALTER TABLE scenes ADD COLUMN location_id TEXT REFERENCES locations(id);

-- Stripboard strips (all types: SCENE, MOVE, CALL, LUNCH, WRAP, NOTE)
CREATE TABLE IF NOT EXISTS stripboard_strips (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id),
  shoot_day_unit_id TEXT REFERENCES shoot_day_units(id),
  strip_type TEXT NOT NULL,
  scene_id TEXT REFERENCES scenes(id),
  title TEXT,
  description TEXT,
  sort_index REAL NOT NULL DEFAULT 0,
  color_tag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Cast linked to scenes (for DOOD: who works when)
CREATE TABLE IF NOT EXISTS scene_cast (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  scene_id TEXT NOT NULL REFERENCES scenes(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(scene_id, person_id)
);

-- Cast availability windows (UNAVAILABLE = clash if scheduled that day)
CREATE TABLE IF NOT EXISTS cast_availability (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'AVAILABLE',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Key contacts (HoDs) per production for call sheet
CREATE TABLE IF NOT EXISTS key_contacts (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  department TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Call sheet persistence (optional overrides, generated document)
CREATE TABLE IF NOT EXISTS call_sheets (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id),
  shoot_day_unit_id TEXT REFERENCES shoot_day_units(id),
  overrides_json TEXT,
  generated_document_id TEXT REFERENCES documents(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
