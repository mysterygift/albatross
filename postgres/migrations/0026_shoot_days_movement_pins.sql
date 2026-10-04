-- Shoot days: map pins (unit base, parking dispensations, ...) shown on the movement order maps.
ALTER TABLE shoot_days ADD COLUMN movement_pins_json TEXT;
