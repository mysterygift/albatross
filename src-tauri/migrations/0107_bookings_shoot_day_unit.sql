-- Optional unit on a booking, so crew can be called to one unit of a multi-unit shoot day.
-- NULL means the whole day (all units), which is how every existing booking behaves.
ALTER TABLE bookings ADD COLUMN shoot_day_unit_id TEXT REFERENCES shoot_day_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_shoot_day_unit ON bookings(shoot_day_unit_id);
