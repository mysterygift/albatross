CREATE TABLE production_budget_features (
  production_id UUID NOT NULL,
  tax_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  default_vat_rate_percent NUMERIC,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_budget_features PRIMARY KEY (production_id),
  CONSTRAINT fk_production_budget_features_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE tax_credit_schemes (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  net_rate NUMERIC NOT NULL,
  cap_percent NUMERIC,
  min_qualifying_percent NUMERIC,
  max_qualifying_amount NUMERIC,
  max_core_budget NUMERIC,
  is_vfx BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_tax_credit_schemes PRIMARY KEY (id),
  CONSTRAINT fk_tax_credit_schemes_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE expense_tax_credit_allocations (
  id UUID DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  tax_credit_scheme_id UUID NOT NULL,
  qualifying_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_expense_tax_credit_allocations PRIMARY KEY (id),
  CONSTRAINT ck_expense_tax_credit_allocations_1 CHECK (qualifying_amount > 0),
  CONSTRAINT fk_expense_tax_credit_allocations_1_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_expense_tax_credit_allocations_2_tax_credit_scheme_id FOREIGN KEY (tax_credit_scheme_id) REFERENCES tax_credit_schemes(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_expense_tax_credit_allocations_active_pair
  ON expense_tax_credit_allocations(expense_id, tax_credit_scheme_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tax_credit_schemes_production ON tax_credit_schemes(production_id);
CREATE INDEX idx_expense_tax_credit_allocations_expense ON expense_tax_credit_allocations(expense_id);
CREATE INDEX idx_expense_tax_credit_allocations_scheme ON expense_tax_credit_allocations(tax_credit_scheme_id);

ALTER TABLE expenses ADD COLUMN vat_rate_percent NUMERIC;
