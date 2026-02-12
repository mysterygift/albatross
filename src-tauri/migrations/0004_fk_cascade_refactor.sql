-- Foreign keys and cascading deletes refactor.
-- REQUIREMENT: The application MUST run PRAGMA foreign_keys = ON on every SQLite connection
-- (see src/lib/db/client.ts). This migration does not enable it permanently; SQLite does not
-- persist that setting. Without it, FK constraints and cascades will not be enforced.
--
-- Cascade decisions:
-- - production_id -> productions(id) ON DELETE CASCADE: all child rows go with the production.
-- - stripboard_strips.scene_id ON DELETE SET NULL: if a scene is deleted, the strip remains
--   (e.g. as a NOTE/MOVE placeholder) so the schedule is not broken unexpectedly.
-- - scenes.location_id ON DELETE SET NULL: scene can exist without a location.
-- - expenses.category_id, bookings.shoot_day_id, equipment.shoot_day_id ON DELETE SET NULL.
-- - shoot_day_unit_id, document_id references ON DELETE SET NULL where the child can exist without the ref.
--
-- Orphan cleanup: existing DBs may have rows with FK values pointing to missing parents (e.g. if
-- FKs were not enforced). Remove them before recreating tables with FKs so INSERTs succeed.
PRAGMA foreign_keys = OFF;

DELETE FROM scene_cast WHERE production_id NOT IN (SELECT id FROM productions) OR scene_id NOT IN (SELECT id FROM scenes) OR person_id NOT IN (SELECT id FROM people);
DELETE FROM cast_availability WHERE production_id NOT IN (SELECT id FROM productions) OR person_id NOT IN (SELECT id FROM people);
DELETE FROM location_scene WHERE location_id NOT IN (SELECT id FROM locations) OR scene_id NOT IN (SELECT id FROM scenes);
DELETE FROM shots WHERE scene_id NOT IN (SELECT id FROM scenes);
DELETE FROM stripboard_strips WHERE production_id NOT IN (SELECT id FROM productions) OR shoot_day_id NOT IN (SELECT id FROM shoot_days) OR (shoot_day_unit_id IS NOT NULL AND shoot_day_unit_id NOT IN (SELECT id FROM shoot_day_units)) OR (scene_id IS NOT NULL AND scene_id NOT IN (SELECT id FROM scenes));
DELETE FROM stripboard_items WHERE shoot_day_id NOT IN (SELECT id FROM shoot_days) OR scene_id NOT IN (SELECT id FROM scenes);
DELETE FROM shoot_day_units WHERE shoot_day_id NOT IN (SELECT id FROM shoot_days) OR unit_id NOT IN (SELECT id FROM units);
DELETE FROM bookings WHERE production_id NOT IN (SELECT id FROM productions) OR person_id NOT IN (SELECT id FROM people) OR (shoot_day_id IS NOT NULL AND shoot_day_id NOT IN (SELECT id FROM shoot_days));
DELETE FROM equipment WHERE production_id NOT IN (SELECT id FROM productions) OR (shoot_day_id IS NOT NULL AND shoot_day_id NOT IN (SELECT id FROM shoot_days));
DELETE FROM budget_items WHERE production_id NOT IN (SELECT id FROM productions) OR category_id NOT IN (SELECT id FROM budget_categories);
DELETE FROM expenses WHERE production_id NOT IN (SELECT id FROM productions) OR (category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM budget_categories));
DELETE FROM technical_specs WHERE deliverable_id NOT IN (SELECT id FROM deliverables);
DELETE FROM clearances WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM cue_sheets WHERE production_id NOT IN (SELECT id FROM productions) OR (document_id IS NOT NULL AND document_id NOT IN (SELECT id FROM documents));
DELETE FROM call_sheets WHERE production_id NOT IN (SELECT id FROM productions) OR shoot_day_id NOT IN (SELECT id FROM shoot_days) OR (shoot_day_unit_id IS NOT NULL AND shoot_day_unit_id NOT IN (SELECT id FROM shoot_day_units)) OR (generated_document_id IS NOT NULL AND generated_document_id NOT IN (SELECT id FROM documents));
DELETE FROM script_documents WHERE production_id NOT IN (SELECT id FROM productions) OR (document_id IS NOT NULL AND document_id NOT IN (SELECT id FROM documents));
DELETE FROM documents WHERE production_id IS NOT NULL AND production_id NOT IN (SELECT id FROM productions);
DELETE FROM scenes WHERE production_id NOT IN (SELECT id FROM productions) OR (location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM locations));
DELETE FROM deliverables WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM music_tracks WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM key_contacts WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM checklist_items WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM shoot_days WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM budget_categories WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM locations WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM people WHERE production_id NOT IN (SELECT id FROM productions);
DELETE FROM units WHERE production_id NOT IN (SELECT id FROM productions);

PRAGMA foreign_keys = ON;

-- ========== units ==========
CREATE TABLE units_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO units_new SELECT * FROM units;
DROP TABLE units;
ALTER TABLE units_new RENAME TO units;
CREATE INDEX IF NOT EXISTS idx_units_production_id ON units(production_id);

-- ========== people ==========
CREATE TABLE people_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_cast INTEGER NOT NULL DEFAULT 0,
  email TEXT,
  phone TEXT,
  department TEXT,
  phases TEXT,
  notes TEXT,
  contributor_form_status TEXT DEFAULT 'not_requested',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO people_new SELECT * FROM people;
DROP TABLE people;
ALTER TABLE people_new RENAME TO people;
CREATE INDEX IF NOT EXISTS idx_people_production_id ON people(production_id);

-- ========== locations ==========
CREATE TABLE locations_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  booked_status TEXT NOT NULL DEFAULT 'unbooked',
  address TEXT,
  availability_constraints TEXT,
  permit_fee REAL,
  location_fee REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO locations_new SELECT * FROM locations;
DROP TABLE locations;
ALTER TABLE locations_new RENAME TO locations;
CREATE INDEX IF NOT EXISTS idx_locations_production_id ON locations(production_id);

-- ========== budget_categories ==========
CREATE TABLE budget_categories_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phase TEXT DEFAULT 'pre',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO budget_categories_new SELECT * FROM budget_categories;
DROP TABLE budget_categories;
ALTER TABLE budget_categories_new RENAME TO budget_categories;
CREATE INDEX IF NOT EXISTS idx_budget_categories_production_id ON budget_categories(production_id);

-- ========== shoot_days ==========
CREATE TABLE shoot_days_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_date TEXT NOT NULL,
  day_number INTEGER,
  call_time TEXT,
  notes TEXT,
  weather_manual TEXT,
  wrap_time TEXT,
  meal_times_json TEXT,
  weather_json TEXT,
  parking_base_address TEXT,
  special_notes TEXT,
  hospital_name TEXT,
  hospital_address TEXT,
  police_station_name TEXT,
  police_station_address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO shoot_days_new SELECT * FROM shoot_days;
DROP TABLE shoot_days;
ALTER TABLE shoot_days_new RENAME TO shoot_days;
CREATE INDEX IF NOT EXISTS idx_shoot_days_production_id ON shoot_days(production_id);

-- ========== checklist_items ==========
CREATE TABLE checklist_items_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO checklist_items_new SELECT * FROM checklist_items;
DROP TABLE checklist_items;
ALTER TABLE checklist_items_new RENAME TO checklist_items;
CREATE INDEX IF NOT EXISTS idx_checklist_items_production_id ON checklist_items(production_id);

-- ========== deliverables ==========
CREATE TABLE deliverables_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO deliverables_new SELECT * FROM deliverables;
DROP TABLE deliverables;
ALTER TABLE deliverables_new RENAME TO deliverables;
CREATE INDEX IF NOT EXISTS idx_deliverables_production_id ON deliverables(production_id);

-- ========== music_tracks ==========
CREATE TABLE music_tracks_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  publisher_label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO music_tracks_new SELECT * FROM music_tracks;
DROP TABLE music_tracks;
ALTER TABLE music_tracks_new RENAME TO music_tracks;
CREATE INDEX IF NOT EXISTS idx_music_tracks_production_id ON music_tracks(production_id);

-- ========== key_contacts ==========
CREATE TABLE key_contacts_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO key_contacts_new SELECT * FROM key_contacts;
DROP TABLE key_contacts;
ALTER TABLE key_contacts_new RENAME TO key_contacts;
CREATE INDEX IF NOT EXISTS idx_key_contacts_production_id ON key_contacts(production_id);

-- ========== scenes (references productions, locations; location_id SET NULL) ==========
CREATE TABLE scenes_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  scene_number TEXT NOT NULL,
  heading TEXT,
  description TEXT,
  title TEXT,
  int_ext TEXT,
  day_night TEXT,
  page_eighths INTEGER,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO scenes_new SELECT * FROM scenes;
DROP TABLE scenes;
ALTER TABLE scenes_new RENAME TO scenes;
CREATE INDEX IF NOT EXISTS idx_scenes_production_id ON scenes(production_id);
CREATE INDEX IF NOT EXISTS idx_scenes_location_id ON scenes(location_id);

-- ========== documents ==========
CREATE TABLE documents_new (
  id TEXT PRIMARY KEY,
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO documents_new SELECT * FROM documents;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;
CREATE INDEX IF NOT EXISTS idx_documents_production_id ON documents(production_id);

-- ========== shots ==========
CREATE TABLE shots_new (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  shot_number TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO shots_new SELECT * FROM shots;
DROP TABLE shots;
ALTER TABLE shots_new RENAME TO shots;
CREATE INDEX IF NOT EXISTS idx_shots_scene_id ON shots(scene_id);

-- ========== location_scene ==========
CREATE TABLE location_scene_new (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(location_id, scene_id)
);
INSERT INTO location_scene_new SELECT * FROM location_scene;
DROP TABLE location_scene;
ALTER TABLE location_scene_new RENAME TO location_scene;
CREATE INDEX IF NOT EXISTS idx_location_scene_scene_id ON location_scene(scene_id);
CREATE INDEX IF NOT EXISTS idx_location_scene_location_id ON location_scene(location_id);

-- ========== stripboard_items ==========
CREATE TABLE stripboard_items_new (
  id TEXT PRIMARY KEY,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(shoot_day_id, scene_id)
);
INSERT INTO stripboard_items_new SELECT * FROM stripboard_items;
DROP TABLE stripboard_items;
ALTER TABLE stripboard_items_new RENAME TO stripboard_items;
CREATE INDEX IF NOT EXISTS idx_stripboard_items_shoot_day_id ON stripboard_items(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_items_scene_id ON stripboard_items(scene_id);

-- ========== shoot_day_units ==========
CREATE TABLE shoot_day_units_new (
  id TEXT PRIMARY KEY,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  notes TEXT,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(shoot_day_id, unit_id)
);
INSERT INTO shoot_day_units_new SELECT * FROM shoot_day_units;
DROP TABLE shoot_day_units;
ALTER TABLE shoot_day_units_new RENAME TO shoot_day_units;
CREATE INDEX IF NOT EXISTS idx_shoot_day_units_shoot_day_id ON shoot_day_units(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_shoot_day_units_unit_id ON shoot_day_units(unit_id);

-- ========== stripboard_strips (scene_id and shoot_day_unit_id SET NULL) ==========
CREATE TABLE stripboard_strips_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  shoot_day_unit_id TEXT REFERENCES shoot_day_units(id) ON DELETE SET NULL,
  strip_type TEXT NOT NULL,
  scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  sort_index REAL NOT NULL DEFAULT 0,
  color_tag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO stripboard_strips_new SELECT * FROM stripboard_strips;
DROP TABLE stripboard_strips;
ALTER TABLE stripboard_strips_new RENAME TO stripboard_strips;
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_production_id ON stripboard_strips(production_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_shoot_day_id ON stripboard_strips(shoot_day_id);
CREATE INDEX IF NOT EXISTS idx_stripboard_strips_scene_id ON stripboard_strips(scene_id);

-- ========== scene_cast ==========
CREATE TABLE scene_cast_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(scene_id, person_id)
);
INSERT INTO scene_cast_new SELECT * FROM scene_cast;
DROP TABLE scene_cast;
ALTER TABLE scene_cast_new RENAME TO scene_cast;
CREATE INDEX IF NOT EXISTS idx_scene_cast_production_id ON scene_cast(production_id);
CREATE INDEX IF NOT EXISTS idx_scene_cast_scene_id ON scene_cast(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_cast_person_id ON scene_cast(person_id);

-- ========== cast_availability ==========
CREATE TABLE cast_availability_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'AVAILABLE',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO cast_availability_new SELECT * FROM cast_availability;
DROP TABLE cast_availability;
ALTER TABLE cast_availability_new RENAME TO cast_availability;
CREATE INDEX IF NOT EXISTS idx_cast_availability_production_id ON cast_availability(production_id);
CREATE INDEX IF NOT EXISTS idx_cast_availability_person_id ON cast_availability(person_id);

-- ========== bookings (shoot_day_id SET NULL) ==========
CREATE TABLE bookings_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE SET NULL,
  start_date TEXT,
  end_date TEXT,
  role TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO bookings_new SELECT * FROM bookings;
DROP TABLE bookings;
ALTER TABLE bookings_new RENAME TO bookings;
CREATE INDEX IF NOT EXISTS idx_bookings_production_id ON bookings(production_id);
CREATE INDEX IF NOT EXISTS idx_bookings_person_id ON bookings(person_id);
CREATE INDEX IF NOT EXISTS idx_bookings_shoot_day_id ON bookings(shoot_day_id);

-- ========== equipment (shoot_day_id SET NULL) ==========
CREATE TABLE equipment_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rented',
  vendor TEXT,
  cost REAL,
  shoot_day_id TEXT REFERENCES shoot_days(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO equipment_new SELECT * FROM equipment;
DROP TABLE equipment;
ALTER TABLE equipment_new RENAME TO equipment;
CREATE INDEX IF NOT EXISTS idx_equipment_production_id ON equipment(production_id);

-- ========== budget_items ==========
CREATE TABLE budget_items_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  estimated_cost REAL NOT NULL DEFAULT 0,
  actual_cost REAL NOT NULL DEFAULT 0,
  vendor TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO budget_items_new SELECT * FROM budget_items;
DROP TABLE budget_items;
ALTER TABLE budget_items_new RENAME TO budget_items;
CREATE INDEX IF NOT EXISTS idx_budget_items_production_id ON budget_items(production_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_category_id ON budget_items(category_id);

-- ========== expenses (category_id SET NULL) ==========
CREATE TABLE expenses_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  vendor TEXT,
  notes TEXT,
  expense_type TEXT DEFAULT 'other',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO expenses_new SELECT * FROM expenses;
DROP TABLE expenses;
ALTER TABLE expenses_new RENAME TO expenses;
CREATE INDEX IF NOT EXISTS idx_expenses_production_id ON expenses(production_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);

-- ========== technical_specs ==========
CREATE TABLE technical_specs_new (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  resolution TEXT,
  codec TEXT,
  audio TEXT,
  captions TEXT,
  aspect_ratio TEXT,
  platform TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO technical_specs_new SELECT * FROM technical_specs;
DROP TABLE technical_specs;
ALTER TABLE technical_specs_new RENAME TO technical_specs;
CREATE INDEX IF NOT EXISTS idx_technical_specs_deliverable_id ON technical_specs(deliverable_id);

-- ========== clearances ==========
CREATE TABLE clearances_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  requested_at TEXT,
  granted_at TEXT,
  expiry TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO clearances_new SELECT * FROM clearances;
DROP TABLE clearances;
ALTER TABLE clearances_new RENAME TO clearances;
CREATE INDEX IF NOT EXISTS idx_clearances_production_id ON clearances(production_id);

-- ========== cue_sheets (document_id SET NULL) ==========
CREATE TABLE cue_sheets_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO cue_sheets_new SELECT * FROM cue_sheets;
DROP TABLE cue_sheets;
ALTER TABLE cue_sheets_new RENAME TO cue_sheets;
CREATE INDEX IF NOT EXISTS idx_cue_sheets_production_id ON cue_sheets(production_id);

-- ========== call_sheets (shoot_day_unit_id, generated_document_id SET NULL) ==========
CREATE TABLE call_sheets_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  shoot_day_unit_id TEXT REFERENCES shoot_day_units(id) ON DELETE SET NULL,
  overrides_json TEXT,
  generated_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO call_sheets_new SELECT * FROM call_sheets;
DROP TABLE call_sheets;
ALTER TABLE call_sheets_new RENAME TO call_sheets;
CREATE INDEX IF NOT EXISTS idx_call_sheets_production_id ON call_sheets(production_id);
CREATE INDEX IF NOT EXISTS idx_call_sheets_shoot_day_id ON call_sheets(shoot_day_id);

-- ========== script_documents (document_id SET NULL) ==========
CREATE TABLE script_documents_new (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  raw_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO script_documents_new SELECT * FROM script_documents;
DROP TABLE script_documents;
ALTER TABLE script_documents_new RENAME TO script_documents;
CREATE INDEX IF NOT EXISTS idx_script_documents_production_id ON script_documents(production_id);
