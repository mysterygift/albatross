-- Add duration_minutes to scenes for stripboard runtime estimation.
-- NULL means unknown; treat as 0 when summing day runtime.
-- Only SCENE strips contribute to estimated runtime (CALL, LUNCH, MOVE, WRAP, NOTE excluded).
ALTER TABLE scenes ADD COLUMN duration_minutes INTEGER;
