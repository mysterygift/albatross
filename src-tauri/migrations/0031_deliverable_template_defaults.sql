-- Default deliverable templates (lightweight; no platform-specific compliance).
-- Streaming Package: common streaming deliverables.
INSERT INTO deliverable_templates (id, name, description, created_at, updated_at) VALUES
  ('dtpl-streaming-001', 'Streaming Package', 'Common deliverables for streaming platforms (e.g. Netflix, Amazon style).', datetime('now'), datetime('now'));
INSERT INTO deliverable_template_items (id, deliverable_template_id, name, due_offset_days, default_status, spec_defaults_json, sort_order, created_at, updated_at) VALUES
  ('dti-streaming-001', 'dtpl-streaming-001', 'Picture Master', 60, 'not_started', '{"resolution":"1920x1080","codec":"ProRes 422 HQ"}', 0, datetime('now'), datetime('now')),
  ('dti-streaming-002', 'dtpl-streaming-001', 'Textless Master', 67, 'not_started', '{"resolution":"1920x1080","codec":"ProRes 422 HQ"}', 1, datetime('now'), datetime('now')),
  ('dti-streaming-003', 'dtpl-streaming-001', 'Stereo Mix', 60, 'not_started', '{"audio_mix":"Stereo"}', 2, datetime('now'), datetime('now')),
  ('dti-streaming-004', 'dtpl-streaming-001', '5.1 Surround Mix', 60, 'not_started', '{"audio_mix":"5.1"}', 3, datetime('now'), datetime('now')),
  ('dti-streaming-005', 'dtpl-streaming-001', 'Closed Captions', 67, 'not_started', '{"subtitles":"CC"}', 4, datetime('now'), datetime('now')),
  ('dti-streaming-006', 'dtpl-streaming-001', 'QC Report', 70, 'not_started', null, 5, datetime('now'), datetime('now'));

-- Festival Package: lean set for film festivals.
INSERT INTO deliverable_templates (id, name, description, created_at, updated_at) VALUES
  ('dtpl-festival-001', 'Festival Package', 'Lean set for film festival submissions.', datetime('now'), datetime('now'));
INSERT INTO deliverable_template_items (id, deliverable_template_id, name, due_offset_days, default_status, spec_defaults_json, sort_order, created_at, updated_at) VALUES
  ('dti-festival-001', 'dtpl-festival-001', 'Screening Master', 0, 'not_started', '{"resolution":"1920x1080","codec":"H.264"}', 0, datetime('now'), datetime('now')),
  ('dti-festival-002', 'dtpl-festival-001', 'Stereo Mix', 0, 'not_started', '{"audio_mix":"Stereo"}', 1, datetime('now'), datetime('now')),
  ('dti-festival-003', 'dtpl-festival-001', 'Subtitle File', 0, 'not_started', '{"subtitles":"SRT"}', 2, datetime('now'), datetime('now'));

-- Broadcast Package: typical broadcaster delivery.
INSERT INTO deliverable_templates (id, name, description, created_at, updated_at) VALUES
  ('dtpl-broadcast-001', 'Broadcast Package', 'Typical deliverables for broadcaster delivery.', datetime('now'), datetime('now'));
INSERT INTO deliverable_template_items (id, deliverable_template_id, name, due_offset_days, default_status, spec_defaults_json, sort_order, created_at, updated_at) VALUES
  ('dti-broadcast-001', 'dtpl-broadcast-001', 'HD Master', 45, 'not_started', '{"resolution":"1920x1080","codec":"XDCAM"}', 0, datetime('now'), datetime('now')),
  ('dti-broadcast-002', 'dtpl-broadcast-001', 'Stereo Mix', 45, 'not_started', '{"audio_mix":"Stereo"}', 1, datetime('now'), datetime('now')),
  ('dti-broadcast-003', 'dtpl-broadcast-001', 'SDH Captions', 48, 'not_started', '{"subtitles":"SDH"}', 2, datetime('now'), datetime('now')),
  ('dti-broadcast-004', 'dtpl-broadcast-001', 'Delivery Report', 50, 'not_started', null, 3, datetime('now'), datetime('now'));
