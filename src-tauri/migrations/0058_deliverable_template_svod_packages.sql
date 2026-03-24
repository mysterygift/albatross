-- Major SVOD template expansion.
-- Baseline templates only: intended as practical starting points, not strict platform compliance checks.
-- Future template additions should follow the same deterministic ID pattern and stable sort ordering.

INSERT INTO deliverable_templates (id, name, description, created_at, updated_at) VALUES
  ('dtpl-netflix-001', 'Netflix Package (SVOD)', 'Baseline Netflix-oriented SVOD deliverables for large productions.', datetime('now'), datetime('now')),
  ('dtpl-prime-001', 'Amazon Prime Video Package (SVOD)', 'Baseline Amazon Prime Video deliverables for large SVOD productions.', datetime('now'), datetime('now')),
  ('dtpl-hulu-001', 'Hulu Package (SVOD)', 'Baseline Hulu-oriented SVOD deliverables for large productions.', datetime('now'), datetime('now')),
  ('dtpl-disney-001', 'Disney+ Package (SVOD)', 'Baseline Disney+ deliverables for large SVOD productions.', datetime('now'), datetime('now')),
  ('dtpl-apple-001', 'Apple TV Package (SVOD)', 'Baseline Apple TV deliverables for large SVOD productions.', datetime('now'), datetime('now'));

INSERT INTO deliverable_template_items (id, deliverable_template_id, name, due_offset_days, default_status, spec_defaults_json, sort_order, created_at, updated_at) VALUES
  ('dti-netflix-001', 'dtpl-netflix-001', 'IMF Picture Master', 56, 'not_started', '{"platform":"Netflix","resolution":"3840x2160","codec":"IMF","notes":"Validate against latest Netflix delivery requirements."}', 0, datetime('now'), datetime('now')),
  ('dti-netflix-002', 'dtpl-netflix-001', 'Textless IMF Elements', 63, 'not_started', '{"platform":"Netflix","graphics":"Textless","codec":"IMF"}', 1, datetime('now'), datetime('now')),
  ('dti-netflix-003', 'dtpl-netflix-001', 'Dolby Atmos Master', 56, 'not_started', '{"platform":"Netflix","audio_mix":"Atmos"}', 2, datetime('now'), datetime('now')),
  ('dti-netflix-004', 'dtpl-netflix-001', '5.1 Print Master', 56, 'not_started', '{"platform":"Netflix","audio_mix":"5.1"}', 3, datetime('now'), datetime('now')),
  ('dti-netflix-005', 'dtpl-netflix-001', 'Stereo Print Master', 56, 'not_started', '{"platform":"Netflix","audio_mix":"Stereo"}', 4, datetime('now'), datetime('now')),
  ('dti-netflix-006', 'dtpl-netflix-001', 'M&E 5.1', 59, 'not_started', '{"platform":"Netflix","audio_mix":"5.1","notes":"Music and Effects mix."}', 5, datetime('now'), datetime('now')),
  ('dti-netflix-007', 'dtpl-netflix-001', 'Timed Text / Captions Package', 63, 'not_started', '{"platform":"Netflix","subtitles":"CC/SDH","captions":"Timed Text"}', 6, datetime('now'), datetime('now')),
  ('dti-netflix-008', 'dtpl-netflix-001', 'QC and Delivery Metadata', 66, 'not_started', '{"platform":"Netflix","notes":"Include technical QC and delivery manifests."}', 7, datetime('now'), datetime('now')),

  ('dti-prime-001', 'dtpl-prime-001', 'UHD/HD Mezzanine Master', 56, 'not_started', '{"platform":"Amazon Prime Video","resolution":"3840x2160","codec":"ProRes 422 HQ","notes":"Use native frame rate mezzanine."}', 0, datetime('now'), datetime('now')),
  ('dti-prime-002', 'dtpl-prime-001', 'SDR Companion Master (for HDR)', 59, 'not_started', '{"platform":"Amazon Prime Video","resolution":"3840x2160","codec":"ProRes 422 HQ","notes":"Match HDR runtime and edit boundaries."}', 1, datetime('now'), datetime('now')),
  ('dti-prime-003', 'dtpl-prime-001', '5.1 Audio Master', 56, 'not_started', '{"platform":"Amazon Prime Video","audio_mix":"5.1"}', 2, datetime('now'), datetime('now')),
  ('dti-prime-004', 'dtpl-prime-001', 'Stereo Audio Master', 56, 'not_started', '{"platform":"Amazon Prime Video","audio_mix":"Stereo"}', 3, datetime('now'), datetime('now')),
  ('dti-prime-005', 'dtpl-prime-001', 'Captions / SDH', 63, 'not_started', '{"platform":"Amazon Prime Video","subtitles":"SDH","captions":"CC"}', 4, datetime('now'), datetime('now')),
  ('dti-prime-006', 'dtpl-prime-001', 'Subtitle Package', 63, 'not_started', '{"platform":"Amazon Prime Video","subtitles":"SRT/TTML"}', 5, datetime('now'), datetime('now')),
  ('dti-prime-007', 'dtpl-prime-001', 'QC Report', 66, 'not_started', '{"platform":"Amazon Prime Video","notes":"Automated + manual compliance QC."}', 6, datetime('now'), datetime('now')),
  ('dti-prime-008', 'dtpl-prime-001', 'Delivery Inventory / Metadata', 66, 'not_started', '{"platform":"Amazon Prime Video","notes":"Include inventory and metadata package."}', 7, datetime('now'), datetime('now')),

  ('dti-hulu-001', 'dtpl-hulu-001', 'HD/UHD Mezzanine Master', 56, 'not_started', '{"platform":"Hulu","resolution":"3840x2160","codec":"ProRes 422 HQ"}', 0, datetime('now'), datetime('now')),
  ('dti-hulu-002', 'dtpl-hulu-001', '5.1 Audio Master', 56, 'not_started', '{"platform":"Hulu","audio_mix":"5.1"}', 1, datetime('now'), datetime('now')),
  ('dti-hulu-003', 'dtpl-hulu-001', 'Stereo Audio Master', 56, 'not_started', '{"platform":"Hulu","audio_mix":"Stereo"}', 2, datetime('now'), datetime('now')),
  ('dti-hulu-004', 'dtpl-hulu-001', 'Captions / SDH Package', 63, 'not_started', '{"platform":"Hulu","subtitles":"SDH","captions":"CC"}', 3, datetime('now'), datetime('now')),
  ('dti-hulu-005', 'dtpl-hulu-001', 'Subtitle File Package', 63, 'not_started', '{"platform":"Hulu","subtitles":"SRT/TTML"}', 4, datetime('now'), datetime('now')),
  ('dti-hulu-006', 'dtpl-hulu-001', 'Textless / Graphics-safe Master', 63, 'not_started', '{"platform":"Hulu","graphics":"Textless"}', 5, datetime('now'), datetime('now')),
  ('dti-hulu-007', 'dtpl-hulu-001', 'QC and Delivery Metadata', 66, 'not_started', '{"platform":"Hulu","notes":"Include QC summary and partner metadata handoff."}', 6, datetime('now'), datetime('now')),

  ('dti-disney-001', 'dtpl-disney-001', 'Picture Master', 56, 'not_started', '{"platform":"Disney+","resolution":"3840x2160","codec":"ProRes 422 HQ"}', 0, datetime('now'), datetime('now')),
  ('dti-disney-002', 'dtpl-disney-001', 'Textless Master / Elements', 63, 'not_started', '{"platform":"Disney+","graphics":"Textless"}', 1, datetime('now'), datetime('now')),
  ('dti-disney-003', 'dtpl-disney-001', 'Dolby Atmos Master', 56, 'not_started', '{"platform":"Disney+","audio_mix":"Atmos"}', 2, datetime('now'), datetime('now')),
  ('dti-disney-004', 'dtpl-disney-001', '5.1 Audio Master', 56, 'not_started', '{"platform":"Disney+","audio_mix":"5.1"}', 3, datetime('now'), datetime('now')),
  ('dti-disney-005', 'dtpl-disney-001', 'Stereo Audio Master', 56, 'not_started', '{"platform":"Disney+","audio_mix":"Stereo"}', 4, datetime('now'), datetime('now')),
  ('dti-disney-006', 'dtpl-disney-001', 'M&E Mix', 59, 'not_started', '{"platform":"Disney+","audio_mix":"5.1","notes":"Music and Effects mix."}', 5, datetime('now'), datetime('now')),
  ('dti-disney-007', 'dtpl-disney-001', 'Caption / Subtitle Package', 63, 'not_started', '{"platform":"Disney+","subtitles":"CC/SDH/TTML"}', 6, datetime('now'), datetime('now')),
  ('dti-disney-008', 'dtpl-disney-001', 'Archival Elements Package', 66, 'not_started', '{"platform":"Disney+","notes":"Track required archival and production elements."}', 7, datetime('now'), datetime('now')),
  ('dti-disney-009', 'dtpl-disney-001', 'Final QC / Conformance Report', 66, 'not_started', '{"platform":"Disney+","notes":"Final technical compliance report."}', 8, datetime('now'), datetime('now')),

  ('dti-apple-001', 'dtpl-apple-001', 'Master Mezzanine', 56, 'not_started', '{"platform":"Apple TV","resolution":"3840x2160","codec":"ProRes 422 HQ"}', 0, datetime('now'), datetime('now')),
  ('dti-apple-002', 'dtpl-apple-001', '5.1 Audio Master', 56, 'not_started', '{"platform":"Apple TV","audio_mix":"5.1"}', 1, datetime('now'), datetime('now')),
  ('dti-apple-003', 'dtpl-apple-001', 'Stereo Audio Master', 56, 'not_started', '{"platform":"Apple TV","audio_mix":"Stereo"}', 2, datetime('now'), datetime('now')),
  ('dti-apple-004', 'dtpl-apple-001', 'Closed Caption File', 63, 'not_started', '{"platform":"Apple TV","captions":"CC"}', 3, datetime('now'), datetime('now')),
  ('dti-apple-005', 'dtpl-apple-001', 'Timed Text / Subtitle Package', 63, 'not_started', '{"platform":"Apple TV","subtitles":"TTML/SRT"}', 4, datetime('now'), datetime('now')),
  ('dti-apple-006', 'dtpl-apple-001', 'Artwork and Metadata Handoff', 66, 'not_started', '{"platform":"Apple TV","notes":"Include artwork and metadata package."}', 5, datetime('now'), datetime('now')),
  ('dti-apple-007', 'dtpl-apple-001', 'QC Report', 66, 'not_started', '{"platform":"Apple TV","notes":"Technical and packaging QC report."}', 6, datetime('now'), datetime('now'));
