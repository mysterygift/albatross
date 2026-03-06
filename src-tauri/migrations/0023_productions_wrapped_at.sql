-- Productions: add wrapped/completed timestamp. Used when production is completed and archived via Wrap Production.
ALTER TABLE productions ADD COLUMN wrapped_at TEXT;
