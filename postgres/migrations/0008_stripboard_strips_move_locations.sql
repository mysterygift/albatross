-- MOVE strips: optional origin/destination locations for travel routing.
ALTER TABLE stripboard_strips ADD COLUMN origin_location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE stripboard_strips ADD COLUMN destination_location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
