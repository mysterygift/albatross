-- Application-layer encryption support for people, vendors, and locations.

ALTER TABLE people ADD COLUMN name_sort_key TEXT;
ALTER TABLE vendors ADD COLUMN company_name_sort_key TEXT;
ALTER TABLE locations ADD COLUMN name_sort_key TEXT;

CREATE INDEX idx_people_name_sort_key ON people(name_sort_key);
CREATE INDEX idx_vendors_company_name_sort_key ON vendors(company_name_sort_key);
CREATE INDEX idx_locations_name_sort_key ON locations(name_sort_key);
