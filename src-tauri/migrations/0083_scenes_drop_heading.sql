-- Preserve display text in title when heading was the only label.
UPDATE scenes
SET title = COALESCE(NULLIF(TRIM(title), ''), NULLIF(TRIM(heading), ''))
WHERE (title IS NULL OR TRIM(title) = '')
  AND heading IS NOT NULL AND TRIM(heading) != '';

ALTER TABLE scenes DROP COLUMN heading;
