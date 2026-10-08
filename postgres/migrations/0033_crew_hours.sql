-- Crew hours and overtime (SQLite 0102).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE crew_hours_person_settings (
  production_id UUID NOT NULL,
  person_id UUID NOT NULL,
  overtime_exempt INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_crew_hours_person_settings PRIMARY KEY (production_id, person_id),
  CONSTRAINT ck_crew_hours_person_settings_1 CHECK (overtime_exempt IN (0, 1)),
  CONSTRAINT fk_crew_hours_person_settings_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_hours_person_settings_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_crew_hours_settings (
  production_id UUID,
  overtime_basis TEXT NOT NULL DEFAULT 'scheduled_wrap',
  standard_day_minutes INTEGER NOT NULL DEFAULT 660,
  hourly_rate_divisor NUMERIC NOT NULL DEFAULT 10,
  overtime_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  overtime_increment_minutes INTEGER NOT NULL DEFAULT 30,
  minimum_rest_minutes INTEGER NOT NULL DEFAULT 660,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_crew_hours_settings PRIMARY KEY (production_id),
  CONSTRAINT ck_production_crew_hours_settings_1 CHECK (overtime_basis IN ('scheduled_wrap', 'day_length')),
  CONSTRAINT ck_production_crew_hours_settings_2 CHECK (standard_day_minutes > 0),
  CONSTRAINT ck_production_crew_hours_settings_3 CHECK (hourly_rate_divisor > 0),
  CONSTRAINT ck_production_crew_hours_settings_4 CHECK (overtime_multiplier >= 0),
  CONSTRAINT ck_production_crew_hours_settings_5 CHECK (overtime_increment_minutes >= 0),
  CONSTRAINT ck_production_crew_hours_settings_6 CHECK (minimum_rest_minutes >= 0),
  CONSTRAINT fk_production_crew_hours_settings_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE crew_day_hours (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  person_id UUID NOT NULL,
  call_time TEXT,
  wrap_time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_crew_day_hours PRIMARY KEY (id),
  CONSTRAINT fk_crew_day_hours_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_day_hours_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_day_hours_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_crew_day_hours_production_id ON crew_day_hours(production_id);
CREATE UNIQUE INDEX idx_crew_day_hours_day_person_live
  ON crew_day_hours(shoot_day_id, person_id) WHERE deleted_at IS NULL;
