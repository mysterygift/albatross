-- Optional unit on a booking (SQLite 0107). NULL means the whole day (all units).

ALTER TABLE bookings ADD COLUMN shoot_day_unit_id UUID;
ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_4_shoot_day_unit_id FOREIGN KEY (shoot_day_unit_id)
  REFERENCES shoot_day_units(id) ON UPDATE NO ACTION ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_shoot_day_unit ON bookings (shoot_day_unit_id);
