-- Albatross initial schema: UUID primary keys, created_at/updated_at/deleted_at for sync-ready offline-first design

CREATE TABLE IF NOT EXISTS productions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
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

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
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

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  scene_number TEXT NOT NULL,
  heading TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS location_scene (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  scene_id TEXT NOT NULL REFERENCES scenes(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(location_id, scene_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  production_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phase TEXT DEFAULT 'pre',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS budget_items (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  category_id TEXT NOT NULL REFERENCES budget_categories(id),
  description TEXT NOT NULL,
  estimated_cost REAL NOT NULL DEFAULT 0,
  actual_cost REAL NOT NULL DEFAULT 0,
  vendor TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  category_id TEXT REFERENCES budget_categories(id),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  vendor TEXT,
  notes TEXT,
  expense_type TEXT DEFAULT 'other',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS shoot_days (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  shoot_date TEXT NOT NULL,
  day_number INTEGER,
  call_time TEXT,
  notes TEXT,
  weather_manual TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id),
  shot_number TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS stripboard_items (
  id TEXT PRIMARY KEY,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id),
  scene_id TEXT NOT NULL REFERENCES scenes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(shoot_day_id, scene_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  shoot_day_id TEXT REFERENCES shoot_days(id),
  start_date TEXT,
  end_date TEXT,
  role TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rented',
  vendor TEXT,
  cost REAL,
  shoot_day_id TEXT REFERENCES shoot_days(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  title TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  name TEXT NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS technical_specs (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
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

CREATE TABLE IF NOT EXISTS music_tracks (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  title TEXT NOT NULL,
  artist TEXT,
  publisher_label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS clearances (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
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

CREATE TABLE IF NOT EXISTS cue_sheets (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  generated_at TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS script_documents (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  document_id TEXT REFERENCES documents(id),
  raw_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
