-- Hide a global vendor from a specific production without deleting it everywhere.

CREATE TABLE vendor_production_exclusions (
  id UUID DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL,
  production_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_vendor_production_exclusions PRIMARY KEY (id),
  CONSTRAINT fk_vendor_production_exclusions_1_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_vendor_production_exclusions_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT uq_vendor_production_exclusions_vendor_production UNIQUE (vendor_id, production_id)
);

CREATE INDEX idx_vendor_production_exclusions_production_id ON vendor_production_exclusions(production_id);
