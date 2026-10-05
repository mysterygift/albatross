-- Crew hours (experimental). Local SQLite only, like the Script Supervisor tables.
--
-- The unit's actual call and wrap are NOT stored here: they live in script_supervisor_day_logs
-- (call_time, wrap_time), and shoot_days.call_time / wrap_time stay the planned schedule.
-- crew_day_hours only holds people whose call or wrap differ from the unit's (late de-rig, lock-up,
-- early pre-light). Day rates come from labour budget line items (budget_item_details).

-- One row per production: how overtime is worked out. Absent = the defaults below.
CREATE TABLE IF NOT EXISTS production_crew_hours_settings (
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
  -- 'scheduled_wrap': overtime starts at the shoot day's planned wrap.
  -- 'day_length': overtime starts standard_day_minutes after each person's call.
  overtime_basis TEXT NOT NULL DEFAULT 'scheduled_wrap'
    CHECK (overtime_basis IN ('scheduled_wrap', 'day_length')),
  standard_day_minutes INTEGER NOT NULL DEFAULT 660 CHECK (standard_day_minutes > 0),
  -- Hourly rate = day rate / hourly_rate_divisor; overtime hour = hourly rate * overtime_multiplier.
  hourly_rate_divisor REAL NOT NULL DEFAULT 10 CHECK (hourly_rate_divisor > 0),
  overtime_multiplier REAL NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier >= 0),
  -- Overtime is billed per started block of this many minutes; 0 bills exact minutes.
  overtime_increment_minutes INTEGER NOT NULL DEFAULT 30 CHECK (overtime_increment_minutes >= 0),
  minimum_rest_minutes INTEGER NOT NULL DEFAULT 660 CHECK (minimum_rest_minutes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A person's call / wrap on one shoot day when it differs from the unit's. NULL = the unit's time.
CREATE TABLE IF NOT EXISTS crew_day_hours (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  shoot_day_id TEXT NOT NULL REFERENCES shoot_days(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  call_time TEXT,
  wrap_time TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_day_hours_day_person_live
  ON crew_day_hours(shoot_day_id, person_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crew_day_hours_production_id ON crew_day_hours(production_id);

-- Per person: on a buyout (no overtime paid), e.g. director, producers, accountant.
CREATE TABLE IF NOT EXISTS crew_hours_person_settings (
  production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  overtime_exempt INTEGER NOT NULL DEFAULT 0 CHECK (overtime_exempt IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (production_id, person_id)
);
