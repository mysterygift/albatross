-- Instance-scoped clients and optional production delivery date.

CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_clients PRIMARY KEY (id)
);

CREATE INDEX idx_clients_name ON clients(name);

ALTER TABLE productions ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE productions ADD COLUMN delivery_date DATE;

CREATE INDEX idx_productions_client_id ON productions(client_id);
