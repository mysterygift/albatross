-- Repair is_cast values stored as non-integer (e.g. boolean binds) so crew/cast list filters work.
UPDATE people
SET is_cast = CASE
  WHEN is_cast IN (1, '1') OR lower(CAST(is_cast AS TEXT)) IN ('1', 'true', 't') THEN 1
  ELSE 0
END
WHERE deleted_at IS NULL
  AND (is_cast IS NULL OR (is_cast != 0 AND is_cast != 1));
