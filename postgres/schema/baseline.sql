-- PostgreSQL baseline schema for Albatross
-- Strategy: consolidated baseline schema (no replay of SQLite migration chain).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0054 budget_revisions semantic handling:
-- SQLite used randomblob()/hex() during historical backfill.
-- PostgreSQL baseline models only final state using UUID defaults + partial live-revision uniqueness.

CREATE TABLE api_cache (
  key TEXT,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_api_cache PRIMARY KEY (key)
);

CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  name_sort_key TEXT,
  CONSTRAINT pk_clients PRIMARY KEY (id)
);

CREATE TABLE deliverable_templates (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_deliverable_templates PRIMARY KEY (id)
);

CREATE TABLE deliverable_template_items (
  id UUID DEFAULT gen_random_uuid(),
  deliverable_template_id UUID NOT NULL,
  name TEXT NOT NULL,
  due_offset_days INTEGER,
  default_status TEXT,
  spec_defaults_json JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_deliverable_template_items PRIMARY KEY (id),
  CONSTRAINT fk_deliverable_template_items_1_deliverable_template_id FOREIGN KEY (deliverable_template_id) REFERENCES deliverable_templates(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE exchange_rates (
  id UUID DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_exchange_rates PRIMARY KEY (id)
);

CREATE TABLE outbox (
  id UUID DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_outbox PRIMARY KEY (id)
);

CREATE TABLE productions (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  slug TEXT,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  archived_at TIMESTAMPTZ,
  wrapped_at TIMESTAMPTZ,
  created_from_template TEXT,
  is_episodic BOOLEAN NOT NULL DEFAULT FALSE,
  client_id UUID,
  delivery_date DATE,
  production_code TEXT,
  CONSTRAINT pk_productions PRIMARY KEY (id),
  CONSTRAINT ck_productions_1 CHECK (is_episodic IN (FALSE, TRUE)),
  CONSTRAINT fk_productions_1_client_id FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE TABLE breakdown_elements (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  manual_status TEXT NOT NULL DEFAULT 'needed',
  linked_entity_type TEXT,
  linked_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_breakdown_elements PRIMARY KEY (id),
  CONSTRAINT ck_breakdown_elements_1 CHECK (category IN (
    'cast','props','extras','costume','locations','lighting','foley_music','special_fx','stunts','animals_children','vehicles'
  )),
  CONSTRAINT ck_breakdown_elements_2 CHECK (manual_status IN ('needed','sourced')),
  CONSTRAINT ck_breakdown_elements_3 CHECK (linked_entity_type IS NULL OR linked_entity_type IN ('location','person','equipment','music_track')),
  CONSTRAINT fk_breakdown_elements_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE budget_accounts (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_account_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_postable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  color_hex TEXT,
  CONSTRAINT pk_budget_accounts PRIMARY KEY (id),
  CONSTRAINT fk_budget_accounts_1_parent_account_id FOREIGN KEY (parent_account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_budget_accounts_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE budget_categories (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phase TEXT DEFAULT 'pre',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_budget_categories PRIMARY KEY (id),
  CONSTRAINT fk_budget_categories_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE budget_revisions (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_from_revision_id UUID,
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  approval TEXT NOT NULL DEFAULT 'unapproved',
  CONSTRAINT pk_budget_revisions PRIMARY KEY (id),
  CONSTRAINT ck_budget_revisions_1 CHECK (is_live IN (FALSE, TRUE)),
  CONSTRAINT ck_budget_revisions_2 CHECK (approval IN ('unapproved', 'pending', 'approved')),
  CONSTRAINT fk_budget_revisions_1_created_from_revision_id FOREIGN KEY (created_from_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_budget_revisions_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE budget_items (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  category_id UUID,
  account_id UUID,
  description TEXT NOT NULL,
  estimated_cost NUMERIC NOT NULL DEFAULT 0,
  actual_cost NUMERIC NOT NULL DEFAULT 0,
  vendor TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  line_item_type TEXT,
  budget_revision_id UUID,
  CONSTRAINT pk_budget_items PRIMARY KEY (id),
  CONSTRAINT fk_budget_items_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_budget_items_2_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_budget_items_3_category_id FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_budget_items_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE budget_item_details (
  id UUID DEFAULT gen_random_uuid(),
  budget_item_id UUID NOT NULL,
  line_item_type TEXT NOT NULL,
  details_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_budget_item_details PRIMARY KEY (id),
  CONSTRAINT fk_budget_item_details_1_budget_item_id FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE clearances (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  type TEXT NOT NULL,
  item_id UUID NOT NULL,
  status TEXT DEFAULT 'pending',
  requested_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  expiry TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_clearances PRIMARY KEY (id),
  CONSTRAINT fk_clearances_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE contingency_rules (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  base_kind TEXT NOT NULL DEFAULT 'budget',
  scope_mode TEXT NOT NULL DEFAULT 'include_subtrees',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  budget_revision_id UUID,
  CONSTRAINT pk_contingency_rules PRIMARY KEY (id),
  CONSTRAINT fk_contingency_rules_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_contingency_rules_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE contingency_rule_scopes (
  id UUID DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL,
  account_id UUID NOT NULL,
  include_children BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_contingency_rule_scopes PRIMARY KEY (id),
  CONSTRAINT fk_contingency_rule_scopes_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_contingency_rule_scopes_2_rule_id FOREIGN KEY (rule_id) REFERENCES contingency_rules(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE cost_report_groups (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  budget_revision_id UUID,
  code TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_cost_report_groups PRIMARY KEY (id),
  CONSTRAINT fk_cost_report_groups_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_cost_report_groups_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE cost_report_group_accounts (
  id UUID DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  account_id UUID NOT NULL,
  CONSTRAINT pk_cost_report_group_accounts PRIMARY KEY (id),
  CONSTRAINT fk_cost_report_group_accounts_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_cost_report_group_accounts_2_group_id FOREIGN KEY (group_id) REFERENCES cost_report_groups(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID,
  entity_type TEXT,
  entity_id UUID,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_documents PRIMARY KEY (id),
  CONSTRAINT fk_documents_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE cue_sheets (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  document_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_cue_sheets PRIMARY KEY (id),
  CONSTRAINT fk_cue_sheets_1_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_cue_sheets_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE episodes (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_episodes PRIMARY KEY (id),
  CONSTRAINT fk_episodes_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE deliverables (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  recipient TEXT,
  delivery_method TEXT,
  delivered_by TEXT,
  delivered_at TIMESTAMPTZ,
  approval_status TEXT,
  episode_id UUID,
  CONSTRAINT pk_deliverables PRIMARY KEY (id),
  CONSTRAINT fk_deliverables_1_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_deliverables_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE equipment_terms (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_equipment_terms PRIMARY KEY (id),
  CONSTRAINT fk_equipment_terms_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE fringe_rules (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  base_kind TEXT NOT NULL DEFAULT 'budget',
  scope_mode TEXT NOT NULL DEFAULT 'include_subtrees',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  budget_revision_id UUID,
  CONSTRAINT pk_fringe_rules PRIMARY KEY (id),
  CONSTRAINT fk_fringe_rules_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_fringe_rules_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE fringe_rule_scopes (
  id UUID DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL,
  account_id UUID NOT NULL,
  include_children BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_fringe_rule_scopes PRIMARY KEY (id),
  CONSTRAINT fk_fringe_rule_scopes_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_fringe_rule_scopes_2_rule_id FOREIGN KEY (rule_id) REFERENCES fringe_rules(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE hazard_templates (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  control_measures TEXT NOT NULL DEFAULT '',
  at_risk_crew INTEGER NOT NULL DEFAULT 0,
  at_risk_cast INTEGER NOT NULL DEFAULT 0,
  at_risk_public INTEGER NOT NULL DEFAULT 0,
  severity_before INTEGER NOT NULL DEFAULT 3,
  probability_before INTEGER NOT NULL DEFAULT 3,
  severity_after INTEGER NOT NULL DEFAULT 2,
  probability_after INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_hazard_templates PRIMARY KEY (id),
  CONSTRAINT ck_hazard_templates_1 CHECK (severity_before BETWEEN 1 AND 5),
  CONSTRAINT ck_hazard_templates_2 CHECK (probability_before BETWEEN 1 AND 5),
  CONSTRAINT ck_hazard_templates_3 CHECK (severity_after BETWEEN 1 AND 5),
  CONSTRAINT ck_hazard_templates_4 CHECK (probability_after BETWEEN 1 AND 5),
  CONSTRAINT fk_hazard_templates_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE key_contacts (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  department TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_key_contacts PRIMARY KEY (id),
  CONSTRAINT fk_key_contacts_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE locations (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  booked_status TEXT NOT NULL DEFAULT 'unbooked',
  address TEXT,
  availability_constraints TEXT,
  location_fee NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  what3words TEXT,
  parking_info TEXT,
  name_sort_key TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  CONSTRAINT pk_locations PRIMARY KEY (id),
  CONSTRAINT fk_locations_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE music_tracks (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  publisher_label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  episode_id UUID,
  CONSTRAINT pk_music_tracks PRIMARY KEY (id),
  CONSTRAINT fk_music_tracks_1_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_music_tracks_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE people (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_cast BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT,
  phone TEXT,
  department TEXT,
  phases TEXT,
  notes TEXT,
  contributor_form_status TEXT DEFAULT 'not_requested',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  cast_number TEXT,
  agent_name TEXT,
  agent_email TEXT,
  agent_phone TEXT,
  role_name TEXT,
  name_sort_key TEXT,
  CONSTRAINT pk_people PRIMARY KEY (id),
  CONSTRAINT fk_people_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE cast_availability (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  person_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  availability TEXT NOT NULL DEFAULT 'AVAILABLE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_cast_availability PRIMARY KEY (id),
  CONSTRAINT fk_cast_availability_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_cast_availability_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE crew_availability (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  person_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  availability TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_crew_availability PRIMARY KEY (id),
  CONSTRAINT fk_crew_availability_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_availability_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE crew_hours_person_settings (
  production_id UUID NOT NULL,
  person_id UUID NOT NULL,
  overtime_exempt INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_crew_hours_person_settings PRIMARY KEY (production_id, person_id),
  CONSTRAINT ck_crew_hours_person_settings_1 CHECK (overtime_exempt IN (0, 1)),
  CONSTRAINT fk_crew_hours_person_settings_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_hours_person_settings_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE floats (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  budget_item_id UUID NOT NULL,
  person_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  issued_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  budget_revision_id UUID,
  CONSTRAINT pk_floats PRIMARY KEY (id),
  CONSTRAINT fk_floats_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floats_2_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floats_3_budget_item_id FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_floats_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_budget_features (
  production_id UUID,
  tax_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vat_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  default_vat_rate_percent NUMERIC,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_budget_features PRIMARY KEY (production_id),
  CONSTRAINT fk_production_budget_features_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_crew_hierarchy_configs (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  config_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_crew_hierarchy_configs PRIMARY KEY (id),
  CONSTRAINT fk_production_crew_hierarchy_configs_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_crew_hours_settings (
  production_id UUID,
  overtime_basis TEXT NOT NULL DEFAULT 'scheduled_wrap',
  standard_day_minutes INTEGER NOT NULL DEFAULT 660,
  hourly_rate_divisor NUMERIC NOT NULL DEFAULT 10,
  overtime_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  overtime_increment_minutes INTEGER NOT NULL DEFAULT 30,
  minimum_rest_minutes INTEGER NOT NULL DEFAULT 660,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_crew_hours_settings PRIMARY KEY (production_id),
  CONSTRAINT ck_production_crew_hours_settings_1 CHECK (overtime_basis IN ('scheduled_wrap', 'day_length')),
  CONSTRAINT ck_production_crew_hours_settings_2 CHECK (standard_day_minutes > 0),
  CONSTRAINT ck_production_crew_hours_settings_3 CHECK (hourly_rate_divisor > 0),
  CONSTRAINT ck_production_crew_hours_settings_4 CHECK (overtime_multiplier >= 0),
  CONSTRAINT ck_production_crew_hours_settings_5 CHECK (overtime_increment_minutes >= 0),
  CONSTRAINT ck_production_crew_hours_settings_6 CHECK (minimum_rest_minutes >= 0),
  CONSTRAINT fk_production_crew_hours_settings_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_script_supervisor_settings (
  production_id UUID,
  slating_system TEXT NOT NULL DEFAULT 'uk',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_production_script_supervisor_settings PRIMARY KEY (production_id),
  CONSTRAINT ck_production_script_supervisor_settings_1 CHECK (slating_system IN ('uk','us')),
  CONSTRAINT fk_production_script_supervisor_settings_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_task_sections (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_production_task_sections PRIMARY KEY (id),
  CONSTRAINT fk_production_task_sections_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_totals (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  budget_revision_id UUID,
  CONSTRAINT pk_production_totals PRIMARY KEY (id),
  CONSTRAINT fk_production_totals_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_production_totals_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_total_accounts (
  id UUID DEFAULT gen_random_uuid(),
  production_total_id UUID NOT NULL,
  account_id UUID NOT NULL,
  CONSTRAINT pk_production_total_accounts PRIMARY KEY (id),
  CONSTRAINT fk_production_total_accounts_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_production_total_accounts_2_production_total_id FOREIGN KEY (production_total_id) REFERENCES production_totals(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE scenes (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_number TEXT NOT NULL,
  description TEXT,
  title TEXT,
  int_ext TEXT,
  day_night TEXT,
  page_eighths INTEGER,
  location_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  episode_id UUID,
  CONSTRAINT pk_scenes PRIMARY KEY (id),
  CONSTRAINT fk_scenes_1_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_scenes_2_location_id FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_scenes_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE location_scene (
  id UUID DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_location_scene PRIMARY KEY (id),
  CONSTRAINT fk_location_scene_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_location_scene_2_location_id FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE scene_cast (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  person_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_scene_cast PRIMARY KEY (id),
  CONSTRAINT fk_scene_cast_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_scene_cast_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_scene_cast_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_documents (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  document_id UUID,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_documents PRIMARY KEY (id),
  CONSTRAINT fk_script_documents_1_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_documents_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_versions (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  episode_id UUID,
  title TEXT,
  version_label TEXT,
  revision_colour TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_pages_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  previous_script_version_id UUID,
  CONSTRAINT pk_script_versions PRIMARY KEY (id),
  CONSTRAINT fk_script_versions_1_previous_script_version_id FOREIGN KEY (previous_script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_versions_2_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_versions_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_pages (
  id UUID DEFAULT gen_random_uuid(),
  script_version_id UUID NOT NULL,
  scene_id UUID,
  page_number TEXT,
  page_index INTEGER NOT NULL,
  content TEXT,
  eighths INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_pages PRIMARY KEY (id),
  CONSTRAINT fk_script_pages_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_pages_2_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE breakdown_tags (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  element_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  start_page_id UUID NOT NULL,
  start_offset INTEGER NOT NULL,
  end_page_id UUID NOT NULL,
  end_offset INTEGER NOT NULL,
  tagged_text TEXT NOT NULL,
  carried_from_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_breakdown_tags PRIMARY KEY (id),
  CONSTRAINT fk_breakdown_tags_1_carried_from_id FOREIGN KEY (carried_from_id) REFERENCES breakdown_tags(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_breakdown_tags_2_end_page_id FOREIGN KEY (end_page_id) REFERENCES script_pages(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_3_start_page_id FOREIGN KEY (start_page_id) REFERENCES script_pages(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_4_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_5_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_6_element_id FOREIGN KEY (element_id) REFERENCES breakdown_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_breakdown_tags_7_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_elements (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  scene_id UUID,
  script_page_id UUID,
  sort_index NUMERIC NOT NULL,
  element_type TEXT NOT NULL,
  character_name TEXT,
  text TEXT NOT NULL,
  page_number TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_elements PRIMARY KEY (id),
  CONSTRAINT ck_script_elements_1 CHECK (element_type IN ('scene_heading','action','dialogue','transition')),
  CONSTRAINT fk_script_elements_1_script_page_id FOREIGN KEY (script_page_id) REFERENCES script_pages(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_elements_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_elements_3_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_elements_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_revision_items (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  from_script_version_id UUID NOT NULL,
  to_script_version_id UUID NOT NULL,
  item_type TEXT NOT NULL,
  item_id UUID NOT NULL,
  outcome TEXT NOT NULL,
  new_item_id UUID,
  detail TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_revision_items PRIMARY KEY (id),
  CONSTRAINT ck_script_revision_items_1 CHECK (item_type IN ('tramline','annotation','breakdown_tag')),
  CONSTRAINT ck_script_revision_items_2 CHECK (outcome IN ('carried','moved','unmatched','already_lined')),
  CONSTRAINT fk_script_revision_items_1_to_script_version_id FOREIGN KEY (to_script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_revision_items_2_from_script_version_id FOREIGN KEY (from_script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_revision_items_3_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_revision_items_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_sections (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  episode_id UUID,
  label TEXT,
  section_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unplanned',
  notes TEXT,
  is_manual INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  ranges_user_edited INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT pk_script_sections PRIMARY KEY (id),
  CONSTRAINT ck_script_sections_1 CHECK (section_type IN ('dialogue','action','stunt','vfx','pickup','insert','custom')),
  CONSTRAINT ck_script_sections_2 CHECK (status IN ('unplanned','planned','scheduled','shot','omitted')),
  CONSTRAINT ck_script_sections_3 CHECK (ranges_user_edited IN (0, 1)),
  CONSTRAINT fk_script_sections_1_episode_id FOREIGN KEY (episode_id) REFERENCES episodes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_sections_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_sections_3_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_sections_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_section_characters (
  id UUID DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL,
  person_id UUID,
  character_name TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_section_characters PRIMARY KEY (id),
  CONSTRAINT fk_script_section_characters_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_section_characters_2_section_id FOREIGN KEY (section_id) REFERENCES script_sections(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_section_ranges (
  id UUID DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL,
  start_page TEXT,
  start_eighth INTEGER,
  end_page TEXT,
  end_eighth INTEGER,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_script_section_ranges PRIMARY KEY (id),
  CONSTRAINT fk_script_section_ranges_1_section_id FOREIGN KEY (section_id) REFERENCES script_sections(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE seed_meta (
  key TEXT,
  value TEXT,
  CONSTRAINT pk_seed_meta PRIMARY KEY (key)
);

CREATE TABLE server_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  workspace_id UUID,
  account_username TEXT NOT NULL,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_server_connections PRIMARY KEY (id)
);

CREATE TABLE linked_projects (
  production_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  remote_project_id UUID NOT NULL,
  remote_project_url TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TIMESTAMPTZ,
  link_state TEXT NOT NULL DEFAULT 'linked',
  baseline_etag TEXT,
  CONSTRAINT pk_linked_projects PRIMARY KEY (production_id),
  CONSTRAINT ck_linked_projects_1 CHECK (link_state IN ('unlinked', 'publishing', 'linked', 'offline', 'conflict', 'unlinking')),
  CONSTRAINT fk_linked_projects_1_connection_id FOREIGN KEY (connection_id) REFERENCES server_connections(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_linked_projects_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE publish_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  status TEXT NOT NULL,
  progress_stage TEXT,
  progress_message TEXT,
  total_bytes INTEGER,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  CONSTRAINT pk_publish_jobs PRIMARY KEY (id),
  CONSTRAINT fk_publish_jobs_1_connection_id FOREIGN KEY (connection_id) REFERENCES server_connections(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_publish_jobs_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE server_outbox_pending (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  payload_json JSONB,
  expected_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  CONSTRAINT pk_server_outbox_pending PRIMARY KEY (id),
  CONSTRAINT fk_server_outbox_pending_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE settings (
  key TEXT,
  value TEXT NOT NULL,
  CONSTRAINT pk_settings PRIMARY KEY (key)
);

CREATE TABLE shooting_blocs (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_shooting_blocs PRIMARY KEY (id),
  CONSTRAINT ck_shooting_blocs_1 CHECK (start_date <= end_date),
  CONSTRAINT fk_shooting_blocs_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shoot_days (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_date DATE NOT NULL,
  day_number INTEGER,
  call_time TEXT,
  notes TEXT,
  weather_manual TEXT,
  wrap_time TEXT,
  meal_times_json JSONB,
  weather_json JSONB,
  parking_base_address TEXT,
  special_notes TEXT,
  hospital_name TEXT,
  hospital_address TEXT,
  police_station_name TEXT,
  police_station_address TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  shooting_bloc_id UUID,
  movement_pins_json TEXT,
  CONSTRAINT pk_shoot_days PRIMARY KEY (id),
  CONSTRAINT fk_shoot_days_1_shooting_bloc_id FOREIGN KEY (shooting_bloc_id) REFERENCES shooting_blocs(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_days_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE bookings (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  person_id UUID NOT NULL,
  shoot_day_id UUID,
  start_date DATE,
  end_date DATE,
  role TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_bookings PRIMARY KEY (id),
  CONSTRAINT fk_bookings_1_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_bookings_2_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_bookings_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE crew_day_hours (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  person_id UUID NOT NULL,
  call_time TEXT,
  wrap_time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_crew_day_hours PRIMARY KEY (id),
  CONSTRAINT fk_crew_day_hours_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_day_hours_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_crew_day_hours_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE equipment (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rented',
  vendor TEXT,
  shoot_day_id UUID,
  notes TEXT,
  item_uuid TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'planned',
  department TEXT,
  vendor_id UUID,
  invoice_id UUID,
  rental_start_date DATE,
  return_due_date DATE,
  returned_at TIMESTAMPTZ,
  replacement_value NUMERIC,
  serial_number TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  quantity INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT pk_equipment PRIMARY KEY (id),
  CONSTRAINT ck_equipment_1 CHECK (quantity >= 1),
  CONSTRAINT fk_equipment_1_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_equipment_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE equipment_lists (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID,
  name TEXT NOT NULL,
  department TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_equipment_lists PRIMARY KEY (id),
  CONSTRAINT fk_equipment_lists_1_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_equipment_lists_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE equipment_list_items (
  id UUID DEFAULT gen_random_uuid(),
  equipment_list_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  checked_out BOOLEAN NOT NULL DEFAULT FALSE,
  checked_back_in BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT pk_equipment_list_items PRIMARY KEY (id),
  CONSTRAINT ck_equipment_list_items_1 CHECK (quantity >= 1),
  CONSTRAINT fk_equipment_list_items_1_equipment_id FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_equipment_list_items_2_equipment_list_id FOREIGN KEY (equipment_list_id) REFERENCES equipment_lists(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE risk_assessments (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  location_id UUID,
  location_name TEXT NOT NULL DEFAULT '',
  activities TEXT NOT NULL DEFAULT '',
  responsible_person_id UUID,
  responsible_person_name TEXT NOT NULL DEFAULT '',
  first_aiders_json JSONB,
  hospital_name TEXT,
  hospital_address TEXT,
  hospital_phone TEXT,
  police_name TEXT,
  police_address TEXT,
  police_phone TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  generated_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_risk_assessments PRIMARY KEY (id),
  CONSTRAINT ck_risk_assessments_1 CHECK (status IN ('draft', 'approved')),
  CONSTRAINT fk_risk_assessments_1_generated_document_id FOREIGN KEY (generated_document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_2_responsible_person_id FOREIGN KEY (responsible_person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_3_location_id FOREIGN KEY (location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_risk_assessments_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_risk_assessments_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE risk_assessment_hazards (
  id UUID DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  control_measures TEXT NOT NULL DEFAULT '',
  at_risk_crew INTEGER NOT NULL DEFAULT 0,
  at_risk_cast INTEGER NOT NULL DEFAULT 0,
  at_risk_public INTEGER NOT NULL DEFAULT 0,
  severity_before INTEGER NOT NULL DEFAULT 3,
  probability_before INTEGER NOT NULL DEFAULT 3,
  severity_after INTEGER NOT NULL DEFAULT 2,
  probability_after INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_risk_assessment_hazards PRIMARY KEY (id),
  CONSTRAINT ck_risk_assessment_hazards_1 CHECK (severity_before BETWEEN 1 AND 5),
  CONSTRAINT ck_risk_assessment_hazards_2 CHECK (probability_before BETWEEN 1 AND 5),
  CONSTRAINT ck_risk_assessment_hazards_3 CHECK (severity_after BETWEEN 1 AND 5),
  CONSTRAINT ck_risk_assessment_hazards_4 CHECK (probability_after BETWEEN 1 AND 5),
  CONSTRAINT fk_risk_assessment_hazards_1_risk_assessment_id FOREIGN KEY (risk_assessment_id) REFERENCES risk_assessments(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_supervisor_day_logs (
  shoot_day_id UUID,
  production_id UUID NOT NULL,
  call_time TEXT,
  first_shot_time TEXT,
  lunch_start_time TEXT,
  lunch_end_time TEXT,
  first_shot_after_lunch_time TEXT,
  camera_wrap_time TEXT,
  wrap_time TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_script_supervisor_day_logs PRIMARY KEY (shoot_day_id),
  CONSTRAINT fk_script_supervisor_day_logs_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_supervisor_day_logs_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_supervisor_scene_progress (
  scene_id UUID,
  production_id UUID NOT NULL,
  marked_status TEXT,
  completed_shoot_day_id UUID,
  credited_eighths INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  timed_seconds INTEGER,
  CONSTRAINT pk_script_supervisor_scene_progress PRIMARY KEY (scene_id),
  CONSTRAINT ck_script_supervisor_scene_progress_1 CHECK (marked_status IS NULL OR marked_status IN ('complete','omitted')),
  CONSTRAINT ck_script_supervisor_scene_progress_2 CHECK (credited_eighths IS NULL OR credited_eighths >= 0),
  CONSTRAINT ck_script_supervisor_scene_progress_3 CHECK (timed_seconds IS NULL OR timed_seconds >= 0),
  CONSTRAINT fk_script_supervisor_scene_progress_1_completed_shoot_day_id FOREIGN KEY (completed_shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_supervisor_scene_progress_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_supervisor_scene_progress_3_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shots (
  id UUID DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL,
  shot_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  subject TEXT,
  shot_size TEXT,
  support TEXT,
  lens TEXT,
  duration_seconds INTEGER,
  camera_movement TEXT,
  notes TEXT,
  estimated_shoot_minutes INTEGER,
  shot_description TEXT,
  CONSTRAINT pk_shots PRIMARY KEY (id),
  CONSTRAINT fk_shots_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shot_cast (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shot_id UUID NOT NULL,
  person_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_shot_cast PRIMARY KEY (id),
  CONSTRAINT fk_shot_cast_1_person_id FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shot_cast_2_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shot_cast_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shot_script_sections (
  id UUID DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL,
  script_section_id UUID NOT NULL,
  coverage_notes TEXT,
  sort_index NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_shot_script_sections PRIMARY KEY (id),
  CONSTRAINT fk_shot_script_sections_1_script_section_id FOREIGN KEY (script_section_id) REFERENCES script_sections(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shot_script_sections_2_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE storyboard_imports (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_id UUID,
  source_filename TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_storyboard_imports PRIMARY KEY (id),
  CONSTRAINT ck_storyboard_imports_1 CHECK (source_type IN ('athena_pdf_import')),
  CONSTRAINT ck_storyboard_imports_2 CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT fk_storyboard_imports_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_storyboard_imports_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE storyboard_images (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  shot_id UUID NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_import_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_storyboard_images PRIMARY KEY (id),
  CONSTRAINT ck_storyboard_images_1 CHECK (source_type IN ('manual', 'athena_pdf_import')),
  CONSTRAINT fk_storyboard_images_1_source_import_id FOREIGN KEY (source_import_id) REFERENCES storyboard_imports(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_storyboard_images_2_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_images_3_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_images_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE stripboard_items (
  id UUID DEFAULT gen_random_uuid(),
  shoot_day_id UUID NOT NULL,
  scene_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_stripboard_items PRIMARY KEY (id),
  CONSTRAINT fk_stripboard_items_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_stripboard_items_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_client_identity (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  device_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_client_identity PRIMARY KEY (id)
);

CREATE TABLE sync_mutation_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  client_id UUID NOT NULL,
  local_sequence INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  base_epoch TEXT NOT NULL,
  base_cursor INTEGER NOT NULL,
  protocol_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  registry_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  request_hash TEXT,
  accepted_cursor INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_mutation_batches PRIMARY KEY (id),
  CONSTRAINT ck_sync_mutation_batches_1 CHECK (local_sequence >= 0),
  CONSTRAINT ck_sync_mutation_batches_2 CHECK (length(base_epoch) > 0),
  CONSTRAINT ck_sync_mutation_batches_3 CHECK (base_cursor >= 0),
  CONSTRAINT ck_sync_mutation_batches_4 CHECK (length(protocol_version) > 0),
  CONSTRAINT ck_sync_mutation_batches_5 CHECK (schema_version > 0),
  CONSTRAINT ck_sync_mutation_batches_6 CHECK (length(registry_hash) > 0),
  CONSTRAINT ck_sync_mutation_batches_7 CHECK (state IN ('pending', 'in_flight', 'blocked', 'accepted', 'failed')),
  CONSTRAINT ck_sync_mutation_batches_8 CHECK (attempt_count >= 0),
  CONSTRAINT ck_sync_mutation_batches_9 CHECK (accepted_cursor IS NULL OR accepted_cursor >= 0),
  CONSTRAINT fk_sync_mutation_batches_1_client_id FOREIGN KEY (client_id) REFERENCES sync_client_identity(id) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT fk_sync_mutation_batches_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_mutations (
  batch_id UUID NOT NULL,
  operation_index INTEGER NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  base_server_version INTEGER,
  base_values_json JSONB,
  patch_json JSONB,
  full_row_json JSONB,
  local_result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_mutations PRIMARY KEY (batch_id, operation_index),
  CONSTRAINT ck_sync_mutations_1 CHECK (operation_index >= 0),
  CONSTRAINT ck_sync_mutations_2 CHECK (operation IN ('create', 'patch', 'delete')),
  CONSTRAINT ck_sync_mutations_3 CHECK (base_server_version IS NULL OR base_server_version > 0),
  CONSTRAINT ck_sync_mutations_4 CHECK ((operation = 'create' AND base_server_version IS NULL AND base_values_json IS NULL AND patch_json IS NULL AND full_row_json IS NOT NULL)
    OR
    (operation = 'patch' AND base_server_version > 0 AND base_values_json IS NOT NULL AND patch_json IS NOT NULL AND full_row_json IS NULL)
    OR
    (operation = 'delete' AND base_server_version > 0 AND base_values_json IS NOT NULL AND patch_json IS NULL AND full_row_json IS NULL)),
  CONSTRAINT fk_sync_mutations_1_batch_id FOREIGN KEY (batch_id) REFERENCES sync_mutation_batches(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  operation_index INTEGER NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  conflict_type TEXT NOT NULL,
  base_snapshot_json JSONB,
  local_snapshot_json JSONB,
  server_snapshot_json JSONB,
  changed_fields_json JSONB,
  server_version INTEGER,
  server_cursor INTEGER,
  state TEXT NOT NULL DEFAULT 'unresolved',
  resolution_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_conflicts PRIMARY KEY (id),
  CONSTRAINT ck_sync_conflicts_1 CHECK (conflict_type IN ('same_field', 'update_delete', 'delete_update', 'dependent_row')),
  CONSTRAINT ck_sync_conflicts_2 CHECK (state IN ('unresolved', 'resolved', 'discarded')),
  CONSTRAINT ck_sync_conflicts_3 CHECK (server_version IS NULL OR server_version >= 0),
  CONSTRAINT ck_sync_conflicts_4 CHECK (server_cursor IS NULL OR server_cursor >= 0),
  CONSTRAINT fk_sync_conflicts_1_batch_id FOREIGN KEY (batch_id, operation_index) REFERENCES sync_mutations(batch_id, operation_index) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_sync_conflicts_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_project_state (
  production_id UUID NOT NULL,
  connection_id UUID,
  server_project_id UUID,
  mode TEXT NOT NULL DEFAULT 'local_only',
  epoch TEXT,
  applied_cursor INTEGER NOT NULL DEFAULT 0,
  head_cursor INTEGER NOT NULL DEFAULT 0,
  protocol_version TEXT,
  schema_version INTEGER,
  registry_hash TEXT,
  credential_ref TEXT,
  rebootstrap_reason TEXT,
  last_sync_started_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_project_state PRIMARY KEY (production_id),
  CONSTRAINT ck_sync_project_state_1 CHECK (mode IN (
    'local_only',
    'enabling',
    'collaborative',
    'offline',
    'paused',
    'conflicts',
    'disabling',
    'needs_rebootstrap'
  )),
  CONSTRAINT ck_sync_project_state_2 CHECK (applied_cursor >= 0),
  CONSTRAINT ck_sync_project_state_3 CHECK (head_cursor >= 0),
  CONSTRAINT ck_sync_project_state_4 CHECK (head_cursor >= applied_cursor),
  CONSTRAINT fk_sync_project_state_1_connection_id FOREIGN KEY (connection_id) REFERENCES server_connections(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_sync_project_state_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_apply_guard (
  production_id UUID NOT NULL,
  guarded_cursor INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_apply_guard PRIMARY KEY (production_id),
  CONSTRAINT ck_sync_apply_guard_1 CHECK (guarded_cursor >= 0),
  CONSTRAINT fk_sync_apply_guard_1_production_id FOREIGN KEY (production_id) REFERENCES sync_project_state(production_id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sync_row_state (
  production_id UUID NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  server_version INTEGER NOT NULL,
  applied_cursor INTEGER NOT NULL,
  is_tombstone INTEGER NOT NULL DEFAULT 0,
  row_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_sync_row_state PRIMARY KEY (production_id, entity_table, entity_id),
  CONSTRAINT ck_sync_row_state_1 CHECK (server_version > 0),
  CONSTRAINT ck_sync_row_state_2 CHECK (applied_cursor >= 0),
  CONSTRAINT ck_sync_row_state_3 CHECK (is_tombstone IN (0, 1)),
  CONSTRAINT fk_sync_row_state_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE task_templates (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_task_templates PRIMARY KEY (id)
);

CREATE TABLE task_template_items (
  id UUID DEFAULT gen_random_uuid(),
  task_template_id UUID NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  due_offset_days INTEGER,
  assigned_department TEXT,
  priority INTEGER,
  section_name TEXT,
  parent_template_item_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_task_template_items PRIMARY KEY (id),
  CONSTRAINT fk_task_template_items_1_parent_template_item_id FOREIGN KEY (parent_template_item_id) REFERENCES task_template_items(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_task_template_items_2_task_template_id FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE tax_credit_schemes (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  net_rate NUMERIC NOT NULL,
  cap_percent NUMERIC,
  min_qualifying_percent NUMERIC,
  max_qualifying_amount NUMERIC,
  max_core_budget NUMERIC,
  is_vfx BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_tax_credit_schemes PRIMARY KEY (id),
  CONSTRAINT fk_tax_credit_schemes_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE technical_specs (
  id UUID DEFAULT gen_random_uuid(),
  deliverable_id UUID NOT NULL,
  resolution TEXT,
  codec TEXT,
  audio TEXT,
  captions TEXT,
  aspect_ratio TEXT,
  platform TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  bitrate TEXT,
  subtitles TEXT,
  graphics TEXT,
  language TEXT,
  audio_mix TEXT,
  CONSTRAINT pk_technical_specs PRIMARY KEY (id),
  CONSTRAINT fk_technical_specs_1_deliverable_id FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE units (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_units PRIMARY KEY (id),
  CONSTRAINT fk_units_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shoot_day_sides_exports (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  unit_id UUID,
  document_id UUID,
  script_version_id UUID,
  export_label TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_shoot_day_sides_exports PRIMARY KEY (id),
  CONSTRAINT fk_shoot_day_sides_exports_1_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_day_sides_exports_2_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_day_sides_exports_3_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_day_sides_exports_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shoot_day_sides_exports_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE shoot_day_units (
  id UUID DEFAULT gen_random_uuid(),
  shoot_day_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  notes TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  movement_order_json TEXT,
  CONSTRAINT pk_shoot_day_units PRIMARY KEY (id),
  CONSTRAINT fk_shoot_day_units_1_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shoot_day_units_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE call_sheets (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  shoot_day_unit_id UUID,
  overrides_json JSONB,
  generated_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_call_sheets PRIMARY KEY (id),
  CONSTRAINT fk_call_sheets_1_generated_document_id FOREIGN KEY (generated_document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_call_sheets_2_shoot_day_unit_id FOREIGN KEY (shoot_day_unit_id) REFERENCES shoot_day_units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_call_sheets_3_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_call_sheets_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE risk_assessment_units (
  id UUID DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL,
  shoot_day_unit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_risk_assessment_units PRIMARY KEY (id),
  CONSTRAINT fk_risk_assessment_units_1_shoot_day_unit_id FOREIGN KEY (shoot_day_unit_id) REFERENCES shoot_day_units(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_risk_assessment_units_2_risk_assessment_id FOREIGN KEY (risk_assessment_id) REFERENCES risk_assessments(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE slates (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID NOT NULL,
  unit_id UUID,
  scene_id UUID,
  shot_id UUID,
  slate_prefix TEXT NOT NULL DEFAULT '',
  slate_number INTEGER NOT NULL,
  shot_type TEXT,
  shot_code TEXT,
  description TEXT,
  camera TEXT,
  lens TEXT,
  stop TEXT,
  filter TEXT,
  sound_mode TEXT NOT NULL DEFAULT 'sync',
  int_ext TEXT,
  day_night TEXT,
  camera_roll TEXT,
  sound_roll TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  slating_system TEXT NOT NULL DEFAULT 'uk',
  CONSTRAINT pk_slates PRIMARY KEY (id),
  CONSTRAINT ck_slates_1 CHECK (shot_type IS NULL OR shot_type IN ('master','single','multiple','insert','other')),
  CONSTRAINT ck_slates_2 CHECK (sound_mode IN ('sync','mute','wild_track')),
  CONSTRAINT ck_slates_3 CHECK (slating_system IN ('uk','us')),
  CONSTRAINT fk_slates_1_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_slates_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_slates_3_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_slates_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_slates_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_annotations (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  element_id UUID NOT NULL,
  slate_id UUID,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  carried_from_id UUID,
  CONSTRAINT pk_script_annotations PRIMARY KEY (id),
  CONSTRAINT ck_script_annotations_1 CHECK (kind IN ('line_change','ad_lib','cut','note','vfx','sfx','continuity')),
  CONSTRAINT fk_script_annotations_1_carried_from_id FOREIGN KEY (carried_from_id) REFERENCES script_annotations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_script_annotations_2_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotations_3_element_id FOREIGN KEY (element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotations_4_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotations_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE stripboard_strips (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  shoot_day_id UUID,
  shoot_day_unit_id UUID,
  strip_type TEXT NOT NULL,
  scene_id UUID,
  shot_id UUID,
  title TEXT,
  description TEXT,
  estimated_minutes INTEGER,
  sort_index NUMERIC NOT NULL DEFAULT 0,
  color_tag TEXT,
  strip_status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  origin_location_id UUID,
  destination_location_id UUID,
  CONSTRAINT pk_stripboard_strips PRIMARY KEY (id),
  CONSTRAINT ck_stripboard_strips_1 CHECK (strip_type IN ('SHOT','SCENE','MOVE','CALL','LUNCH','WRAP','NOTE')),
  CONSTRAINT ck_stripboard_strips_2 CHECK (strip_status IN ('SCHEDULED','UNSCHEDULED','BONEYARD')),
  CONSTRAINT fk_stripboard_strips_1_destination_location_id FOREIGN KEY (destination_location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_2_origin_location_id FOREIGN KEY (origin_location_id) REFERENCES locations(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_3_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_4_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_5_shoot_day_unit_id FOREIGN KEY (shoot_day_unit_id) REFERENCES shoot_day_units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_6_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_stripboard_strips_7_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE takes (
  id UUID DEFAULT gen_random_uuid(),
  slate_id UUID NOT NULL,
  take_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ng_reason TEXT,
  duration_ms INTEGER,
  end_board INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_takes PRIMARY KEY (id),
  CONSTRAINT ck_takes_1 CHECK (status IN ('pending','print','hold','ng','incomplete')),
  CONSTRAINT ck_takes_2 CHECK (ng_reason IS NULL OR ng_reason IN ('performance','camera','sound','focus','continuity','other')),
  CONSTRAINT fk_takes_1_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE continuity_media (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  document_id UUID NOT NULL,
  slate_id UUID,
  take_id UUID,
  scene_id UUID,
  tags TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_continuity_media PRIMARY KEY (id),
  CONSTRAINT fk_continuity_media_1_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_continuity_media_2_take_id FOREIGN KEY (take_id) REFERENCES takes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_continuity_media_3_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_continuity_media_4_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_continuity_media_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE script_annotation_takes (
  annotation_id UUID NOT NULL,
  take_id UUID NOT NULL,
  CONSTRAINT pk_script_annotation_takes PRIMARY KEY (annotation_id, take_id),
  CONSTRAINT fk_script_annotation_takes_1_take_id FOREIGN KEY (take_id) REFERENCES takes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_script_annotation_takes_2_annotation_id FOREIGN KEY (annotation_id) REFERENCES script_annotations(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE tramlines (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  slate_id UUID NOT NULL,
  script_version_id UUID NOT NULL,
  camera TEXT NOT NULL DEFAULT '',
  start_element_id UUID NOT NULL,
  end_element_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  carried_from_id UUID,
  CONSTRAINT pk_tramlines PRIMARY KEY (id),
  CONSTRAINT fk_tramlines_1_carried_from_id FOREIGN KEY (carried_from_id) REFERENCES tramlines(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_tramlines_2_end_element_id FOREIGN KEY (end_element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_3_start_element_id FOREIGN KEY (start_element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_4_script_version_id FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_5_slate_id FOREIGN KEY (slate_id) REFERENCES slates(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramlines_6_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE tramline_segments (
  id UUID DEFAULT gen_random_uuid(),
  tramline_id UUID NOT NULL,
  element_id UUID NOT NULL,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_tramline_segments PRIMARY KEY (id),
  CONSTRAINT ck_tramline_segments_1 CHECK (state IN ('off','not_covered')),
  CONSTRAINT fk_tramline_segments_1_element_id FOREIGN KEY (element_id) REFERENCES script_elements(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_tramline_segments_2_tramline_id FOREIGN KEY (tramline_id) REFERENCES tramlines(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMPTZ,
  dek_salt TEXT,
  instance_key_wrap_version INTEGER,
  instance_key_wrap_salt TEXT,
  instance_key_wrapped TEXT,
  instance_key_wrap_created_at TIMESTAMPTZ,
  instance_key_wrap_rotated_at TIMESTAMPTZ,
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT ck_users_1 CHECK (role IN ('user', 'admin')),
  CONSTRAINT ck_users_2 CHECK (username = lower(username))
);

CREATE TABLE audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  target_user_id UUID,
  project_id UUID,
  action TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_audit_logs PRIMARY KEY (id),
  CONSTRAINT fk_audit_logs_1_target_user_id FOREIGN KEY (target_user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_2_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE TABLE project_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  user_id UUID NOT NULL,
  access_level TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT pk_project_memberships PRIMARY KEY (id),
  CONSTRAINT ck_project_memberships_1 CHECK (access_level IN ('viewer', 'editor', 'administrator')),
  CONSTRAINT fk_project_memberships_1_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_project_memberships_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT pk_sessions PRIMARY KEY (id),
  CONSTRAINT fk_sessions_1_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vat_reclaim_rates (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  transaction_type TEXT NOT NULL,
  reclaim_percent NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_vat_reclaim_rates PRIMARY KEY (id),
  CONSTRAINT fk_vat_reclaim_rates_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendors (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  primary_contact_full_name TEXT,
  primary_contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  company_name_sort_key TEXT,
  CONSTRAINT pk_vendors PRIMARY KEY (id),
  CONSTRAINT fk_vendors_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  category_id UUID,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  vendor TEXT,
  notes TEXT,
  expense_type TEXT DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  account_id UUID,
  transaction_type TEXT,
  vendor_id UUID,
  vat_rate_percent NUMERIC,
  vat_reclaimed_amount NUMERIC,
  vat_reclaim_date DATE,
  vat_reclaim_reference TEXT,
  CONSTRAINT pk_expenses PRIMARY KEY (id),
  CONSTRAINT fk_expenses_1_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_expenses_2_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_expenses_3_category_id FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_expenses_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE budget_item_expense_links (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  budget_item_id UUID NOT NULL,
  expense_id UUID NOT NULL,
  matched_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  budget_revision_id UUID,
  CONSTRAINT pk_budget_item_expense_links PRIMARY KEY (id),
  CONSTRAINT ck_budget_item_expense_links_1 CHECK (matched_amount > 0),
  CONSTRAINT fk_budget_item_expense_links_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_budget_item_expense_links_2_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_budget_item_expense_links_3_budget_item_id FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE expense_receipts (
  id UUID DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  document_id UUID NOT NULL,
  receipt_date DATE,
  amount NUMERIC,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_expense_receipts PRIMARY KEY (id),
  CONSTRAINT fk_expense_receipts_1_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_expense_receipts_2_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE expense_tax_credit_allocations (
  id UUID DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  tax_credit_scheme_id UUID NOT NULL,
  qualifying_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_expense_tax_credit_allocations PRIMARY KEY (id),
  CONSTRAINT fk_expense_tax_credit_allocations_1_tax_credit_scheme_id FOREIGN KEY (tax_credit_scheme_id) REFERENCES tax_credit_schemes(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_expense_tax_credit_allocations_2_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE expense_transaction_details (
  id UUID DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  transaction_type TEXT NOT NULL,
  details_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_expense_transaction_details PRIMARY KEY (id),
  CONSTRAINT fk_expense_transaction_details_1_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE float_expense_links (
  id UUID DEFAULT gen_random_uuid(),
  float_id UUID NOT NULL,
  expense_id UUID NOT NULL,
  matched_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  budget_revision_id UUID,
  CONSTRAINT pk_float_expense_links PRIMARY KEY (id),
  CONSTRAINT ck_float_expense_links_1 CHECK (matched_amount > 0),
  CONSTRAINT fk_float_expense_links_1_budget_revision_id FOREIGN KEY (budget_revision_id) REFERENCES budget_revisions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_float_expense_links_2_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_float_expense_links_3_float_id FOREIGN KEY (float_id) REFERENCES floats(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendor_production_exclusions (
  id UUID DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL,
  production_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_vendor_production_exclusions PRIMARY KEY (id),
  CONSTRAINT fk_vendor_production_exclusions_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_vendor_production_exclusions_2_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendor_purchase_orders (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  vendor_id UUID NOT NULL,
  po_number TEXT NOT NULL,
  description TEXT,
  issue_date DATE,
  due_date DATE,
  amount NUMERIC,
  status TEXT NOT NULL,
  approval BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  currency_code TEXT,
  exchange_rate NUMERIC,
  CONSTRAINT pk_vendor_purchase_orders PRIMARY KEY (id),
  CONSTRAINT ck_vendor_purchase_orders_1 CHECK (status IN ('draft', 'issued', 'approved', 'closed', 'cancelled')),
  CONSTRAINT fk_vendor_purchase_orders_1_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_vendor_purchase_orders_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendor_invoices (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  vendor_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE,
  due_date DATE,
  amount NUMERIC,
  tax NUMERIC,
  currency_code TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  po_id UUID,
  CONSTRAINT pk_vendor_invoices PRIMARY KEY (id),
  CONSTRAINT ck_vendor_invoices_1 CHECK (status IN ('draft', 'received', 'approved', 'paid', 'overdue')),
  CONSTRAINT fk_vendor_invoices_1_po_id FOREIGN KEY (po_id) REFERENCES vendor_purchase_orders(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_vendor_invoices_2_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_vendor_invoices_3_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE production_tasks (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  description TEXT NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  due_date DATE,
  assigned_department TEXT,
  priority INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  parent_task_id UUID,
  section_id UUID,
  vendor_invoice_id UUID,
  equipment_id UUID,
  CONSTRAINT pk_production_tasks PRIMARY KEY (id),
  CONSTRAINT fk_production_tasks_1_equipment_id FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_production_tasks_2_vendor_invoice_id FOREIGN KEY (vendor_invoice_id) REFERENCES vendor_invoices(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_production_tasks_3_section_id FOREIGN KEY (section_id) REFERENCES production_task_sections(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_production_tasks_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendor_invoice_expenses (
  id UUID DEFAULT gen_random_uuid(),
  vendor_invoice_id UUID NOT NULL,
  expense_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_vendor_invoice_expenses PRIMARY KEY (id),
  CONSTRAINT fk_vendor_invoice_expenses_1_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_vendor_invoice_expenses_2_vendor_invoice_id FOREIGN KEY (vendor_invoice_id) REFERENCES vendor_invoices(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendor_purchase_order_amendments (
  id UUID DEFAULT gen_random_uuid(),
  vendor_purchase_order_id UUID NOT NULL,
  previous_amount NUMERIC,
  new_amount NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_vendor_purchase_order_amendments PRIMARY KEY (id),
  CONSTRAINT fk_vendor_purchase_order_amendments_1_vendor_purchase_order_id FOREIGN KEY (vendor_purchase_order_id) REFERENCES vendor_purchase_orders(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE vendor_purchase_order_expenses (
  id UUID DEFAULT gen_random_uuid(),
  vendor_purchase_order_id UUID NOT NULL,
  expense_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  allocated_amount NUMERIC,
  CONSTRAINT pk_vendor_purchase_order_expenses PRIMARY KEY (id),
  CONSTRAINT fk_vendor_purchase_order_expenses_1_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_vendor_purchase_order_expenses_2_vendor_purchase_order_id FOREIGN KEY (vendor_purchase_order_id) REFERENCES vendor_purchase_orders(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_project_created_at ON audit_logs(project_id, created_at DESC);
CREATE INDEX idx_audit_logs_target_created_at ON audit_logs(target_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created_at ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_bookings_shoot_day_id ON bookings(shoot_day_id);
CREATE INDEX idx_bookings_person_id ON bookings(person_id);
CREATE INDEX idx_bookings_production_id ON bookings(production_id);
CREATE INDEX idx_breakdown_elements_production_category ON breakdown_elements(production_id, category);
CREATE INDEX idx_breakdown_tags_carried_from_id ON breakdown_tags(carried_from_id);
CREATE INDEX idx_breakdown_tags_element_id ON breakdown_tags(element_id);
CREATE INDEX idx_breakdown_tags_version_scene ON breakdown_tags(script_version_id, scene_id);
CREATE INDEX idx_breakdown_tags_production_id ON breakdown_tags(production_id);
CREATE INDEX idx_budget_accounts_production_archived ON budget_accounts(production_id, archived_at);
CREATE INDEX idx_budget_accounts_parent ON budget_accounts(parent_account_id);
CREATE INDEX idx_budget_accounts_production_id ON budget_accounts(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_budget_accounts_2 ON budget_accounts(production_id, code);
CREATE INDEX idx_budget_categories_production_id ON budget_categories(production_id);
CREATE INDEX idx_budget_item_details_budget_item_id ON budget_item_details(budget_item_id);
CREATE UNIQUE INDEX sqlite_autoindex_budget_item_details_2 ON budget_item_details(budget_item_id);
CREATE INDEX idx_budget_item_expense_links_budget_revision_id ON budget_item_expense_links(budget_revision_id);
CREATE INDEX idx_budget_item_expense_links_expense_id ON budget_item_expense_links(expense_id);
CREATE INDEX idx_budget_item_expense_links_budget_item_id ON budget_item_expense_links(budget_item_id);
CREATE INDEX idx_budget_item_expense_links_production_id ON budget_item_expense_links(production_id);
CREATE UNIQUE INDEX idx_budget_item_expense_links_active_pair
  ON budget_item_expense_links(budget_item_id, expense_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_budget_items_budget_revision_id ON budget_items(budget_revision_id);
CREATE INDEX idx_budget_items_account_id ON budget_items(account_id);
CREATE INDEX idx_budget_items_category_id ON budget_items(category_id);
CREATE INDEX idx_budget_items_production_id ON budget_items(production_id);
CREATE UNIQUE INDEX idx_budget_revisions_one_live_per_production
  ON budget_revisions(production_id)
  WHERE is_live = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_budget_revisions_production_id
  ON budget_revisions(production_id);
CREATE INDEX idx_call_sheets_shoot_day_id ON call_sheets(shoot_day_id);
CREATE INDEX idx_call_sheets_production_id ON call_sheets(production_id);
CREATE INDEX idx_cast_availability_person_id ON cast_availability(person_id);
CREATE INDEX idx_cast_availability_production_id ON cast_availability(production_id);
CREATE INDEX idx_clearances_production_id ON clearances(production_id);
CREATE INDEX idx_clients_name_sort_key ON clients(name_sort_key);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_contingency_rule_scopes_rule ON contingency_rule_scopes(rule_id);
CREATE UNIQUE INDEX sqlite_autoindex_contingency_rule_scopes_2 ON contingency_rule_scopes(rule_id, account_id);
CREATE INDEX idx_contingency_rules_budget_revision_id ON contingency_rules(budget_revision_id);
CREATE INDEX idx_contingency_rules_production ON contingency_rules(production_id);
CREATE INDEX idx_continuity_media_scene_id ON continuity_media(scene_id);
CREATE INDEX idx_continuity_media_take_id ON continuity_media(take_id);
CREATE INDEX idx_continuity_media_slate_id ON continuity_media(slate_id);
CREATE INDEX idx_continuity_media_document_id ON continuity_media(document_id);
CREATE INDEX idx_continuity_media_production_id ON continuity_media(production_id);
CREATE INDEX idx_cost_report_group_accounts_group ON cost_report_group_accounts(group_id);
CREATE UNIQUE INDEX sqlite_autoindex_cost_report_group_accounts_2 ON cost_report_group_accounts(group_id, account_id);
CREATE UNIQUE INDEX idx_cost_report_groups_production_revision_code
  ON cost_report_groups(production_id, budget_revision_id, code)
  WHERE code IS NOT NULL;
CREATE INDEX idx_cost_report_groups_budget_revision_id ON cost_report_groups(budget_revision_id);
CREATE INDEX idx_cost_report_groups_production ON cost_report_groups(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_cost_report_groups_2 ON cost_report_groups(production_id, budget_revision_id, name);
CREATE INDEX idx_crew_availability_production_id ON crew_availability(production_id);
CREATE INDEX idx_crew_availability_person_id ON crew_availability(person_id);
CREATE INDEX idx_crew_day_hours_production_id ON crew_day_hours(production_id);
CREATE UNIQUE INDEX idx_crew_day_hours_day_person_live
  ON crew_day_hours(shoot_day_id, person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cue_sheets_production_id ON cue_sheets(production_id);
CREATE INDEX idx_deliverable_template_items_template ON deliverable_template_items(deliverable_template_id);
CREATE INDEX idx_deliverables_production_episode ON deliverables(production_id, episode_id);
CREATE INDEX idx_deliverables_production_id ON deliverables(production_id);
CREATE INDEX idx_documents_production_id ON documents(production_id);
CREATE INDEX idx_episodes_production_sort ON episodes(production_id, sort_order);
CREATE UNIQUE INDEX idx_equipment_production_item_uuid ON equipment(production_id, item_uuid);
CREATE INDEX idx_equipment_production_id ON equipment(production_id);
CREATE INDEX idx_equipment_list_items_equipment_id ON equipment_list_items(equipment_id);
CREATE INDEX idx_equipment_list_items_list_id ON equipment_list_items(equipment_list_id);
CREATE INDEX idx_equipment_lists_shoot_day_id ON equipment_lists(shoot_day_id) WHERE shoot_day_id IS NOT NULL;
CREATE INDEX idx_equipment_lists_production_id ON equipment_lists(production_id);
CREATE INDEX idx_equipment_terms_production_type ON equipment_terms(production_id, type);
CREATE UNIQUE INDEX sqlite_autoindex_equipment_terms_2 ON equipment_terms(production_id, type, value);
CREATE INDEX idx_exchange_rates_base_quote ON exchange_rates(base_currency, quote_currency);
CREATE UNIQUE INDEX sqlite_autoindex_exchange_rates_2 ON exchange_rates(base_currency, quote_currency);
CREATE UNIQUE INDEX idx_expense_receipts_document ON expense_receipts(document_id);
CREATE INDEX idx_expense_receipts_expense ON expense_receipts(expense_id);
CREATE INDEX idx_expense_tax_credit_allocations_scheme ON expense_tax_credit_allocations(tax_credit_scheme_id);
CREATE INDEX idx_expense_tax_credit_allocations_expense ON expense_tax_credit_allocations(expense_id);
CREATE UNIQUE INDEX idx_expense_tax_credit_allocations_active_pair
  ON expense_tax_credit_allocations(expense_id, tax_credit_scheme_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_expense_transaction_details_expense_id ON expense_transaction_details(expense_id);
CREATE UNIQUE INDEX sqlite_autoindex_expense_transaction_details_2 ON expense_transaction_details(expense_id);
CREATE INDEX idx_expenses_vendor_id ON expenses(vendor_id);
CREATE INDEX idx_expenses_account_id ON expenses(account_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_production_id ON expenses(production_id);
CREATE UNIQUE INDEX idx_float_expense_links_active_revision_expense
  ON float_expense_links(budget_revision_id, expense_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_float_expense_links_budget_revision_id ON float_expense_links(budget_revision_id);
CREATE INDEX idx_float_expense_links_expense_id ON float_expense_links(expense_id);
CREATE INDEX idx_float_expense_links_float_id ON float_expense_links(float_id);
CREATE UNIQUE INDEX idx_float_expense_links_active_pair
  ON float_expense_links(float_id, expense_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_floats_budget_revision_id ON floats(budget_revision_id);
CREATE INDEX idx_floats_budget_item_id ON floats(budget_item_id);
CREATE INDEX idx_floats_person_id ON floats(person_id);
CREATE INDEX idx_floats_production_id ON floats(production_id);
CREATE INDEX idx_fringe_rule_scopes_rule ON fringe_rule_scopes(rule_id);
CREATE UNIQUE INDEX sqlite_autoindex_fringe_rule_scopes_2 ON fringe_rule_scopes(rule_id, account_id);
CREATE INDEX idx_fringe_rules_budget_revision_id ON fringe_rules(budget_revision_id);
CREATE INDEX idx_fringe_rules_production ON fringe_rules(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_hazard_templates_2 ON hazard_templates(production_id, name);
CREATE INDEX idx_key_contacts_production_id ON key_contacts(production_id);
CREATE INDEX idx_linked_projects_connection ON linked_projects(connection_id);
CREATE INDEX idx_location_scene_location_id ON location_scene(location_id);
CREATE INDEX idx_location_scene_scene_id ON location_scene(scene_id);
CREATE UNIQUE INDEX sqlite_autoindex_location_scene_2 ON location_scene(location_id, scene_id);
CREATE INDEX idx_locations_name_sort_key ON locations(name_sort_key);
CREATE INDEX idx_locations_production_id ON locations(production_id);
CREATE INDEX idx_music_tracks_production_episode ON music_tracks(production_id, episode_id);
CREATE INDEX idx_music_tracks_production_id ON music_tracks(production_id);
CREATE INDEX idx_people_name_sort_key ON people(name_sort_key);
CREATE INDEX idx_people_production_id ON people(production_id);
CREATE INDEX idx_production_crew_hierarchy_configs_production_id
  ON production_crew_hierarchy_configs(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_production_crew_hierarchy_configs_2 ON production_crew_hierarchy_configs(production_id);
CREATE INDEX idx_task_sections_production ON production_task_sections(production_id);
CREATE UNIQUE INDEX idx_task_sections_production_name
  ON production_task_sections(production_id, name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_production_tasks_equipment_id
  ON production_tasks(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_production_tasks_vendor_invoice_id
  ON production_tasks(vendor_invoice_id) WHERE vendor_invoice_id IS NOT NULL;
CREATE INDEX idx_production_tasks_production_id ON production_tasks(production_id);
CREATE INDEX idx_production_total_accounts_total ON production_total_accounts(production_total_id);
CREATE UNIQUE INDEX sqlite_autoindex_production_total_accounts_2 ON production_total_accounts(production_total_id, account_id);
CREATE INDEX idx_production_totals_budget_revision_id ON production_totals(budget_revision_id);
CREATE INDEX idx_production_totals_production ON production_totals(production_id);
CREATE INDEX idx_productions_client_id ON productions(client_id);
CREATE UNIQUE INDEX productions_slug_unique ON productions(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_memberships_project_lookup
  ON project_memberships(production_id, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_project_memberships_user_lookup
  ON project_memberships(user_id, production_id)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_project_memberships_unique_active
  ON project_memberships(production_id, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_risk_assessment_hazards_ra
  ON risk_assessment_hazards(risk_assessment_id, sort_order);
CREATE INDEX idx_risk_assessment_units_sdu ON risk_assessment_units(shoot_day_unit_id);
CREATE UNIQUE INDEX idx_risk_assessment_units_unique
  ON risk_assessment_units(risk_assessment_id, shoot_day_unit_id);
CREATE INDEX idx_risk_assessments_shoot_day ON risk_assessments(shoot_day_id);
CREATE INDEX idx_risk_assessments_production ON risk_assessments(production_id);
CREATE INDEX idx_scene_cast_person_id ON scene_cast(person_id);
CREATE INDEX idx_scene_cast_scene_id ON scene_cast(scene_id);
CREATE INDEX idx_scene_cast_production_id ON scene_cast(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_scene_cast_2 ON scene_cast(scene_id, person_id);
CREATE INDEX idx_scenes_production_episode ON scenes(production_id, episode_id);
CREATE INDEX idx_scenes_location_id ON scenes(location_id);
CREATE INDEX idx_scenes_production_id ON scenes(production_id);
CREATE INDEX idx_script_annotation_takes_take_id ON script_annotation_takes(take_id);
CREATE INDEX idx_script_annotations_carried_from_id ON script_annotations(carried_from_id);
CREATE INDEX idx_script_annotations_script_version_id ON script_annotations(script_version_id);
CREATE INDEX idx_script_annotations_slate_id ON script_annotations(slate_id);
CREATE INDEX idx_script_annotations_element_id ON script_annotations(element_id);
CREATE INDEX idx_script_annotations_production_id ON script_annotations(production_id);
CREATE INDEX idx_script_documents_production_id ON script_documents(production_id);
CREATE INDEX idx_script_elements_script_page_id ON script_elements(script_page_id);
CREATE INDEX idx_script_elements_scene_id ON script_elements(scene_id);
CREATE INDEX idx_script_elements_version_sort ON script_elements(script_version_id, sort_index);
CREATE INDEX idx_script_elements_production_id ON script_elements(production_id);
CREATE INDEX idx_script_pages_scene_id ON script_pages(scene_id);
CREATE INDEX idx_script_pages_script_version_id ON script_pages(script_version_id);
CREATE UNIQUE INDEX idx_script_revision_items_live
  ON script_revision_items(item_type, item_id, to_script_version_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_script_revision_items_to ON script_revision_items(to_script_version_id);
CREATE INDEX idx_script_revision_items_from ON script_revision_items(from_script_version_id);
CREATE INDEX idx_script_revision_items_item ON script_revision_items(item_type, item_id);
CREATE INDEX idx_script_revision_items_scene_to ON script_revision_items(scene_id, to_script_version_id);
CREATE INDEX idx_script_revision_items_production_id ON script_revision_items(production_id);
CREATE INDEX idx_script_section_characters_person_id ON script_section_characters(person_id);
CREATE INDEX idx_script_section_characters_section_id ON script_section_characters(section_id);
CREATE INDEX idx_script_section_ranges_section_id ON script_section_ranges(section_id);
CREATE INDEX idx_script_sections_episode_id ON script_sections(episode_id);
CREATE INDEX idx_script_sections_scene_id ON script_sections(scene_id);
CREATE INDEX idx_script_sections_script_version_id ON script_sections(script_version_id);
CREATE INDEX idx_script_sections_production_id ON script_sections(production_id);
CREATE INDEX idx_script_supervisor_day_logs_production_id
  ON script_supervisor_day_logs(production_id);
CREATE INDEX idx_script_supervisor_scene_progress_completed_day
  ON script_supervisor_scene_progress(completed_shoot_day_id);
CREATE INDEX idx_script_supervisor_scene_progress_production_id
  ON script_supervisor_scene_progress(production_id);
CREATE INDEX idx_script_versions_previous
  ON script_versions(previous_script_version_id);
CREATE INDEX idx_script_versions_episode_id ON script_versions(episode_id);
CREATE INDEX idx_script_versions_production_id ON script_versions(production_id);
CREATE INDEX idx_server_outbox_production ON server_outbox_pending(production_id, created_at);
CREATE INDEX idx_sessions_user_id_active ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_sessions_token_hash_unique ON sessions(token_hash);
CREATE INDEX idx_shoot_day_sides_exports_script_version_id ON shoot_day_sides_exports(script_version_id);
CREATE INDEX idx_shoot_day_sides_exports_document_id ON shoot_day_sides_exports(document_id);
CREATE INDEX idx_shoot_day_sides_exports_unit_id ON shoot_day_sides_exports(unit_id);
CREATE INDEX idx_shoot_day_sides_exports_shoot_day_id ON shoot_day_sides_exports(shoot_day_id);
CREATE INDEX idx_shoot_day_sides_exports_production_id ON shoot_day_sides_exports(production_id);
CREATE INDEX idx_shoot_day_units_unit_id ON shoot_day_units(unit_id);
CREATE INDEX idx_shoot_day_units_shoot_day_id ON shoot_day_units(shoot_day_id);
CREATE UNIQUE INDEX sqlite_autoindex_shoot_day_units_2 ON shoot_day_units(shoot_day_id, unit_id);
CREATE INDEX idx_shoot_days_shooting_bloc_id ON shoot_days(shooting_bloc_id);
CREATE INDEX idx_shoot_days_production_id ON shoot_days(production_id);
CREATE INDEX idx_shooting_blocs_production ON shooting_blocs(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_shot_cast_2 ON shot_cast(shot_id, person_id);
CREATE INDEX idx_shot_script_sections_script_section_id ON shot_script_sections(script_section_id);
CREATE INDEX idx_shot_script_sections_shot_id ON shot_script_sections(shot_id);
CREATE UNIQUE INDEX sqlite_autoindex_shot_script_sections_2 ON shot_script_sections(shot_id, script_section_id);
CREATE INDEX idx_shots_scene_id ON shots(scene_id);
CREATE UNIQUE INDEX idx_slates_live_us_setup
  ON slates(scene_id, slate_number) WHERE deleted_at IS NULL AND slating_system = 'us';
CREATE UNIQUE INDEX idx_slates_live_number
  ON slates(production_id, slate_prefix, slate_number) WHERE deleted_at IS NULL AND slating_system = 'uk';
CREATE INDEX idx_slates_shot_id ON slates(shot_id);
CREATE INDEX idx_slates_scene_id ON slates(scene_id);
CREATE INDEX idx_slates_unit_id ON slates(unit_id);
CREATE INDEX idx_slates_shoot_day_id ON slates(shoot_day_id);
CREATE INDEX idx_slates_production_id ON slates(production_id);
CREATE INDEX idx_storyboard_images_shot_sort
  ON storyboard_images(shot_id, sort_order, created_at);
CREATE INDEX idx_storyboard_images_shot_id
  ON storyboard_images(shot_id);
CREATE INDEX idx_storyboard_images_scene_id
  ON storyboard_images(scene_id);
CREATE INDEX idx_storyboard_images_production_id
  ON storyboard_images(production_id);
CREATE INDEX idx_storyboard_imports_scene_id
  ON storyboard_imports(scene_id);
CREATE INDEX idx_storyboard_imports_production_id
  ON storyboard_imports(production_id);
CREATE INDEX idx_stripboard_items_scene_id ON stripboard_items(scene_id);
CREATE INDEX idx_stripboard_items_shoot_day_id ON stripboard_items(shoot_day_id);
CREATE UNIQUE INDEX sqlite_autoindex_stripboard_items_2 ON stripboard_items(shoot_day_id, scene_id);
CREATE INDEX idx_stripboard_strips_shot_id ON stripboard_strips(shot_id);
CREATE INDEX idx_stripboard_strips_strip_status ON stripboard_strips(strip_status);
CREATE INDEX idx_stripboard_strips_scene_id ON stripboard_strips(scene_id);
CREATE INDEX idx_stripboard_strips_shoot_day_id ON stripboard_strips(shoot_day_id);
CREATE INDEX idx_stripboard_strips_production_id ON stripboard_strips(production_id);
CREATE INDEX idx_sync_conflicts_entity
  ON sync_conflicts(production_id, entity_table, entity_id, state);
CREATE INDEX idx_sync_conflicts_production_state
  ON sync_conflicts(production_id, state, created_at);
CREATE INDEX idx_sync_mutation_batches_client
  ON sync_mutation_batches(client_id, created_at);
CREATE INDEX idx_sync_mutation_batches_ready
  ON sync_mutation_batches(production_id, state, next_attempt_at, local_sequence);
CREATE UNIQUE INDEX sqlite_autoindex_sync_mutation_batches_2 ON sync_mutation_batches(production_id, local_sequence);
CREATE INDEX idx_sync_mutations_entity
  ON sync_mutations(entity_table, entity_id);
CREATE INDEX idx_sync_project_state_mode
  ON sync_project_state(mode);
CREATE INDEX idx_sync_project_state_connection
  ON sync_project_state(connection_id);
CREATE INDEX idx_sync_row_state_cursor
  ON sync_row_state(production_id, applied_cursor);
CREATE UNIQUE INDEX idx_takes_live_number
  ON takes(slate_id, take_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_takes_slate_id ON takes(slate_id);
CREATE INDEX idx_task_template_items_parent ON task_template_items(parent_template_item_id);
CREATE INDEX idx_task_template_items_template ON task_template_items(task_template_id);
CREATE INDEX idx_tax_credit_schemes_production ON tax_credit_schemes(production_id);
CREATE INDEX idx_technical_specs_deliverable_id ON technical_specs(deliverable_id);
CREATE INDEX idx_tramline_segments_element_id ON tramline_segments(element_id);
CREATE UNIQUE INDEX sqlite_autoindex_tramline_segments_2 ON tramline_segments(tramline_id, element_id);
CREATE INDEX idx_tramlines_carried_from_id ON tramlines(carried_from_id);
CREATE UNIQUE INDEX idx_tramlines_live_slate_camera
  ON tramlines(slate_id, script_version_id, camera) WHERE deleted_at IS NULL;
CREATE INDEX idx_tramlines_end_element_id ON tramlines(end_element_id);
CREATE INDEX idx_tramlines_start_element_id ON tramlines(start_element_id);
CREATE INDEX idx_tramlines_script_version_id ON tramlines(script_version_id);
CREATE INDEX idx_tramlines_slate_id ON tramlines(slate_id);
CREATE INDEX idx_tramlines_production_id ON tramlines(production_id);
CREATE INDEX idx_units_production_id ON units(production_id);
CREATE UNIQUE INDEX idx_users_username_unique ON users(username);
CREATE INDEX idx_vat_reclaim_rates_production ON vat_reclaim_rates(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_vat_reclaim_rates_2 ON vat_reclaim_rates(production_id, transaction_type);
CREATE INDEX idx_vendor_invoice_expenses_expense ON vendor_invoice_expenses(expense_id);
CREATE INDEX idx_vendor_invoice_expenses_invoice ON vendor_invoice_expenses(vendor_invoice_id);
CREATE UNIQUE INDEX sqlite_autoindex_vendor_invoice_expenses_2 ON vendor_invoice_expenses(vendor_invoice_id, expense_id);
CREATE INDEX idx_vendor_invoices_po_id ON vendor_invoices(po_id);
CREATE INDEX idx_vendor_invoices_vendor_active ON vendor_invoices(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vendor_invoices_vendor_id ON vendor_invoices(vendor_id);
CREATE INDEX idx_vendor_invoices_production_id ON vendor_invoices(production_id);
CREATE INDEX idx_vendor_production_exclusions_production_id
  ON vendor_production_exclusions(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_vendor_production_exclusions_2 ON vendor_production_exclusions(vendor_id, production_id);
CREATE INDEX idx_vendor_po_amendments_po
  ON vendor_purchase_order_amendments(vendor_purchase_order_id);
CREATE INDEX idx_vendor_po_expenses_expense ON vendor_purchase_order_expenses(expense_id);
CREATE INDEX idx_vendor_po_expenses_po ON vendor_purchase_order_expenses(vendor_purchase_order_id);
CREATE UNIQUE INDEX sqlite_autoindex_vendor_purchase_order_expenses_2 ON vendor_purchase_order_expenses(vendor_purchase_order_id, expense_id);
CREATE INDEX idx_vendor_purchase_orders_vendor_active
  ON vendor_purchase_orders(vendor_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_vendor_purchase_orders_vendor_id
  ON vendor_purchase_orders(vendor_id);
CREATE INDEX idx_vendor_purchase_orders_production_id
  ON vendor_purchase_orders(production_id);
CREATE INDEX idx_vendors_company_name_sort_key ON vendors(company_name_sort_key);
CREATE INDEX idx_vendors_is_global ON vendors(is_global) WHERE deleted_at IS NULL;
CREATE INDEX idx_vendors_company_name ON vendors(production_id, company_name);
CREATE INDEX idx_vendors_production_id ON vendors(production_id);
