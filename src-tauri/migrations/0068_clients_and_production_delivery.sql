-- Instance-scoped clients (reusable across productions) and optional production delivery date.

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

ALTER TABLE productions ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE productions ADD COLUMN delivery_date TEXT;

CREATE INDEX IF NOT EXISTS idx_productions_client_id ON productions(client_id);
