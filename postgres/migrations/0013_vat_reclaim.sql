CREATE TABLE vat_reclaim_rates (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  transaction_type TEXT NOT NULL,
  reclaim_percent NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_vat_reclaim_rates PRIMARY KEY (id),
  CONSTRAINT ck_vat_reclaim_rates_1 CHECK (reclaim_percent >= 0 AND reclaim_percent <= 100),
  CONSTRAINT fk_vat_reclaim_rates_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_vat_reclaim_rates_production_type ON vat_reclaim_rates(production_id, transaction_type);
CREATE INDEX idx_vat_reclaim_rates_production ON vat_reclaim_rates(production_id);

ALTER TABLE expenses ADD COLUMN vat_reclaimed_amount NUMERIC;
ALTER TABLE expenses ADD COLUMN vat_reclaim_date DATE;
ALTER TABLE expenses ADD COLUMN vat_reclaim_reference TEXT;
