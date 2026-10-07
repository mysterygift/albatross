-- Risk assessments (SQLite 0092).
-- SQLite end state translated to PostgreSQL types (UUID, TIMESTAMPTZ, JSONB, NUMERIC), same as baseline.sql.

CREATE TABLE hazard_templates (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  control_measures TEXT NOT NULL DEFAULT '',
  at_risk_crew INTEGER NOT NULL DEFAULT 0,
  at_risk_cast INTEGER NOT NULL DEFAULT 0,
  at_risk_public INTEGER NOT NULL DEFAULT 0,
  severity_before INTEGER NOT NULL DEFAULT 3,
  probability_before INTEGER NOT NULL DEFAULT 3,
  severity_after INTEGER NOT NULL DEFAULT 2,
  probability_after INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_hazard_templates PRIMARY KEY (id),
  CONSTRAINT ck_hazard_templates_1 CHECK (severity_before BETWEEN 1 AND 5),
  CONSTRAINT ck_hazard_templates_2 CHECK (probability_before BETWEEN 1 AND 5),
  CONSTRAINT ck_hazard_templates_3 CHECK (severity_after BETWEEN 1 AND 5),
  CONSTRAINT ck_hazard_templates_4 CHECK (probability_after BETWEEN 1 AND 5),
  CONSTRAINT fk_hazard_templates_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE risk_assessments (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  location_id UUID,
  location_name TEXT NOT NULL DEFAULT '',
  activities TEXT NOT NULL DEFAULT '',
  responsible_person_id UUID,
  responsible_person_name TEXT NOT NULL DEFAULT '',
  first_aiders_json JSONB,
  hospital_name TEXT,
  hospital_address TEXT,
  hospital_phone TEXT,
  police_name TEXT,
  police_address TEXT,
  police_phone TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  generated_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_risk_assessments PRIMARY KEY (id),
  CONSTRAINT ck_risk_assessments_1 CHECK (status IN ('draft', 'approved')),
  CONSTRAINT fk_risk_assessments_1_generated_document_id FOREIGN KEY (generated_document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_2_responsible_person_id FOREIGN KEY (responsible_person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_3_location_id FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_risk_assessments_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE risk_assessment_hazards (
  id UUID DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  control_measures TEXT NOT NULL DEFAULT '',
  at_risk_crew INTEGER NOT NULL DEFAULT 0,
  at_risk_cast INTEGER NOT NULL DEFAULT 0,
  at_risk_public INTEGER NOT NULL DEFAULT 0,
  severity_before INTEGER NOT NULL DEFAULT 3,
  probability_before INTEGER NOT NULL DEFAULT 3,
  severity_after INTEGER NOT NULL DEFAULT 2,
  probability_after INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_risk_assessment_hazards PRIMARY KEY (id),
  CONSTRAINT ck_risk_assessment_hazards_1 CHECK (severity_before BETWEEN 1 AND 5),
  CONSTRAINT ck_risk_assessment_hazards_2 CHECK (probability_before BETWEEN 1 AND 5),
  CONSTRAINT ck_risk_assessment_hazards_3 CHECK (severity_after BETWEEN 1 AND 5),
  CONSTRAINT ck_risk_assessment_hazards_4 CHECK (probability_after BETWEEN 1 AND 5),
  CONSTRAINT fk_risk_assessment_hazards_1_risk_assessment_id FOREIGN KEY (risk_assessment_id) REFERENCES risk_assessments(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE risk_assessment_units (
  id UUID DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL,
  shoot_day_unit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_risk_assessment_units PRIMARY KEY (id),
  CONSTRAINT fk_risk_assessment_units_1_shoot_day_unit_id FOREIGN KEY (shoot_day_unit_id) REFERENCES shoot_day_units(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_risk_assessment_units_2_risk_assessment_id FOREIGN KEY (risk_assessment_id) REFERENCES risk_assessments(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX sqlite_autoindex_hazard_templates_2 ON hazard_templates(production_id, name);
CREATE INDEX idx_risk_assessments_shoot_day ON risk_assessments(shoot_day_id);
CREATE INDEX idx_risk_assessments_production ON risk_assessments(production_id);
CREATE INDEX idx_risk_assessment_hazards_ra
  ON risk_assessment_hazards(risk_assessment_id, sort_order);
CREATE INDEX idx_risk_assessment_units_sdu ON risk_assessment_units(shoot_day_unit_id);
CREATE UNIQUE INDEX idx_risk_assessment_units_unique
  ON risk_assessment_units(risk_assessment_id, shoot_day_unit_id);
