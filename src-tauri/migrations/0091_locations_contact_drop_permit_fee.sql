-- Locations: permit fee is no longer tracked; add a per-location contact.
ALTER TABLE locations DROP COLUMN permit_fee;

ALTER TABLE locations ADD COLUMN contact_name TEXT;
ALTER TABLE locations ADD COLUMN contact_email TEXT;
ALTER TABLE locations ADD COLUMN contact_phone TEXT;
