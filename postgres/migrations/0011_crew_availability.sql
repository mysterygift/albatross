CREATE TABLE crew_availability (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  person_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  availability TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_crew_availability PRIMARY KEY (id),
  CONSTRAINT fk_crew_availability_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_availability_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_crew_availability_person_id ON crew_availability(person_id);
CREATE INDEX idx_crew_availability_production_id ON crew_availability(production_id);
