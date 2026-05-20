-- Client PII field encryption support: sort key for encrypted names + per-user DEK salt.

ALTER TABLE users ADD COLUMN dek_salt TEXT;

ALTER TABLE clients ADD COLUMN name_sort_key TEXT;

CREATE INDEX idx_clients_name_sort_key ON clients(name_sort_key);
