-- Deliverables: delivery tracking and recipient.
-- approval_status: pending | approved | rejected (nullable).
ALTER TABLE deliverables ADD COLUMN recipient TEXT;
ALTER TABLE deliverables ADD COLUMN delivery_method TEXT;
ALTER TABLE deliverables ADD COLUMN delivered_by TEXT;
ALTER TABLE deliverables ADD COLUMN delivered_at TEXT;
ALTER TABLE deliverables ADD COLUMN approval_status TEXT;

-- Technical specs: structured audio/subtitle/graphics and language.
ALTER TABLE technical_specs ADD COLUMN bitrate TEXT;
ALTER TABLE technical_specs ADD COLUMN subtitles TEXT;
ALTER TABLE technical_specs ADD COLUMN graphics TEXT;
ALTER TABLE technical_specs ADD COLUMN language TEXT;
ALTER TABLE technical_specs ADD COLUMN audio_mix TEXT;
