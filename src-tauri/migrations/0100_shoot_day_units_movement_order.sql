-- Shoot day units: hand-entered movement order values (revision label, unit base time, per-leg depart/arrive times).
ALTER TABLE shoot_day_units ADD COLUMN movement_order_json TEXT;
