-- Receipt proof for an expense (works without a vendor, for every transaction type).
-- The file itself is a `documents` row (entity_type = 'expense_receipt', entity_id = expense id);
-- this table carries the optional receipt metadata (date / amount / reference) keyed to that document.

CREATE TABLE expense_receipts (
  id UUID DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  document_id UUID NOT NULL,
  receipt_date DATE,
  amount NUMERIC,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_expense_receipts PRIMARY KEY (id),
  CONSTRAINT fk_expense_receipts_1_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_expense_receipts_2_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_expense_receipts_expense ON expense_receipts(expense_id);
CREATE UNIQUE INDEX idx_expense_receipts_document ON expense_receipts(document_id);
