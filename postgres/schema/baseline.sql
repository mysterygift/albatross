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

CREATE TABLE contingency_rule_scopes (
  id UUID DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL,
  account_id UUID NOT NULL,
  include_children BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_contingency_rule_scopes PRIMARY KEY (id),
  CONSTRAINT fk_contingency_rule_scopes_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_contingency_rule_scopes_2_rule_id FOREIGN KEY (rule_id) REFERENCES contingency_rules(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE cost_report_group_accounts (
  id UUID DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  account_id UUID NOT NULL,
  CONSTRAINT pk_cost_report_group_accounts PRIMARY KEY (id),
  CONSTRAINT fk_cost_report_group_accounts_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_cost_report_group_accounts_2_group_id FOREIGN KEY (group_id) REFERENCES cost_report_groups(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE deliverable_templates (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_deliverable_templates PRIMARY KEY (id)
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
  CONSTRAINT pk_equipment_list_items PRIMARY KEY (id),
  CONSTRAINT fk_equipment_list_items_1_equipment_id FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_equipment_list_items_2_equipment_list_id FOREIGN KEY (equipment_list_id) REFERENCES equipment_lists(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE exchange_rates (
  id UUID DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_exchange_rates PRIMARY KEY (id)
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
  CONSTRAINT pk_expenses PRIMARY KEY (id),
  CONSTRAINT fk_expenses_1_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_expenses_2_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_expenses_3_category_id FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_expenses_4_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE fringe_rule_scopes (
  id UUID DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL,
  account_id UUID NOT NULL,
  include_children BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT pk_fringe_rule_scopes PRIMARY KEY (id),
  CONSTRAINT fk_fringe_rule_scopes_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_fringe_rule_scopes_2_rule_id FOREIGN KEY (rule_id) REFERENCES fringe_rules(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE locations (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  name TEXT NOT NULL,
  booked_status TEXT NOT NULL DEFAULT 'unbooked',
  address TEXT,
  availability_constraints TEXT,
  permit_fee NUMERIC,
  location_fee NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  what3words TEXT,
  parking_info TEXT,
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

CREATE TABLE outbox (
  id UUID DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_outbox PRIMARY KEY (id)
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
  CONSTRAINT pk_people PRIMARY KEY (id),
  CONSTRAINT fk_people_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE production_total_accounts (
  id UUID DEFAULT gen_random_uuid(),
  production_total_id UUID NOT NULL,
  account_id UUID NOT NULL,
  CONSTRAINT pk_production_total_accounts PRIMARY KEY (id),
  CONSTRAINT fk_production_total_accounts_1_account_id FOREIGN KEY (account_id) REFERENCES budget_accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_production_total_accounts_2_production_total_id FOREIGN KEY (production_total_id) REFERENCES production_totals(id) ON UPDATE NO ACTION ON DELETE CASCADE
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
  CONSTRAINT pk_productions PRIMARY KEY (id),
  CONSTRAINT ck_productions_1 CHECK (is_episodic IN (FALSE, TRUE))
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

CREATE TABLE scenes (
  id UUID DEFAULT gen_random_uuid(),
  production_id UUID NOT NULL,
  scene_number TEXT NOT NULL,
  heading TEXT,
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

CREATE TABLE seed_meta (
  key TEXT,
  value TEXT,
  CONSTRAINT pk_seed_meta PRIMARY KEY (key)
);

CREATE TABLE settings (
  key TEXT,
  value TEXT NOT NULL,
  CONSTRAINT pk_settings PRIMARY KEY (key)
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
  CONSTRAINT pk_shoot_day_units PRIMARY KEY (id),
  CONSTRAINT fk_shoot_day_units_1_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_shoot_day_units_2_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE
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
  CONSTRAINT pk_shoot_days PRIMARY KEY (id),
  CONSTRAINT fk_shoot_days_1_shooting_bloc_id FOREIGN KEY (shooting_bloc_id) REFERENCES shooting_blocs(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_shoot_days_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE shots (
  id UUID DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL,
  shot_number TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  subject TEXT,
  action_description TEXT,
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
  CONSTRAINT pk_stripboard_strips PRIMARY KEY (id),
  CONSTRAINT ck_stripboard_strips_1 CHECK (strip_type IN ('SHOT','SCENE','MOVE','CALL','LUNCH','WRAP','NOTE')),
  CONSTRAINT ck_stripboard_strips_2 CHECK (strip_status IN ('SCHEDULED','UNSCHEDULED','BONEYARD')),
  CONSTRAINT fk_stripboard_strips_1_shot_id FOREIGN KEY (shot_id) REFERENCES shots(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_2_scene_id FOREIGN KEY (scene_id) REFERENCES scenes(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_3_shoot_day_unit_id FOREIGN KEY (shoot_day_unit_id) REFERENCES shoot_day_units(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT fk_stripboard_strips_4_shoot_day_id FOREIGN KEY (shoot_day_id) REFERENCES shoot_days(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_stripboard_strips_5_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
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

CREATE TABLE task_templates (
  id UUID DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_task_templates PRIMARY KEY (id)
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

CREATE TABLE vendor_purchase_order_expenses (
  id UUID DEFAULT gen_random_uuid(),
  vendor_purchase_order_id UUID NOT NULL,
  expense_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_vendor_purchase_order_expenses PRIMARY KEY (id),
  CONSTRAINT fk_vendor_purchase_order_expenses_1_expense_id FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT fk_vendor_purchase_order_expenses_2_vendor_purchase_order_id FOREIGN KEY (vendor_purchase_order_id) REFERENCES vendor_purchase_orders(id) ON UPDATE NO ACTION ON DELETE CASCADE
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
  CONSTRAINT pk_vendor_purchase_orders PRIMARY KEY (id),
  CONSTRAINT ck_vendor_purchase_orders_1 CHECK (status IN ('draft', 'issued', 'approved', 'closed', 'cancelled')),
  CONSTRAINT fk_vendor_purchase_orders_1_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT fk_vendor_purchase_orders_2_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
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
  CONSTRAINT pk_vendors PRIMARY KEY (id),
  CONSTRAINT fk_vendors_1_production_id FOREIGN KEY (production_id) REFERENCES productions(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX idx_bookings_shoot_day_id ON bookings(shoot_day_id);
CREATE INDEX idx_bookings_person_id ON bookings(person_id);
CREATE INDEX idx_bookings_production_id ON bookings(production_id);
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
CREATE INDEX idx_contingency_rule_scopes_rule ON contingency_rule_scopes(rule_id);
CREATE UNIQUE INDEX sqlite_autoindex_contingency_rule_scopes_2 ON contingency_rule_scopes(rule_id, account_id);
CREATE INDEX idx_contingency_rules_budget_revision_id ON contingency_rules(budget_revision_id);
CREATE INDEX idx_contingency_rules_production ON contingency_rules(production_id);
CREATE INDEX idx_cost_report_group_accounts_group ON cost_report_group_accounts(group_id);
CREATE UNIQUE INDEX sqlite_autoindex_cost_report_group_accounts_2 ON cost_report_group_accounts(group_id, account_id);
CREATE UNIQUE INDEX idx_cost_report_groups_production_revision_code
  ON cost_report_groups(production_id, budget_revision_id, code)
  WHERE code IS NOT NULL;
CREATE INDEX idx_cost_report_groups_budget_revision_id ON cost_report_groups(budget_revision_id);
CREATE INDEX idx_cost_report_groups_production ON cost_report_groups(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_cost_report_groups_2 ON cost_report_groups(production_id, budget_revision_id, name);
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
CREATE INDEX idx_key_contacts_production_id ON key_contacts(production_id);
CREATE INDEX idx_location_scene_location_id ON location_scene(location_id);
CREATE INDEX idx_location_scene_scene_id ON location_scene(scene_id);
CREATE UNIQUE INDEX sqlite_autoindex_location_scene_2 ON location_scene(location_id, scene_id);
CREATE INDEX idx_locations_production_id ON locations(production_id);
CREATE INDEX idx_music_tracks_production_episode ON music_tracks(production_id, episode_id);
CREATE INDEX idx_music_tracks_production_id ON music_tracks(production_id);
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
CREATE UNIQUE INDEX productions_slug_unique ON productions(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_scene_cast_person_id ON scene_cast(person_id);
CREATE INDEX idx_scene_cast_scene_id ON scene_cast(scene_id);
CREATE INDEX idx_scene_cast_production_id ON scene_cast(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_scene_cast_2 ON scene_cast(scene_id, person_id);
CREATE INDEX idx_scenes_production_episode ON scenes(production_id, episode_id);
CREATE INDEX idx_scenes_location_id ON scenes(location_id);
CREATE INDEX idx_scenes_production_id ON scenes(production_id);
CREATE INDEX idx_script_documents_production_id ON script_documents(production_id);
CREATE INDEX idx_shoot_day_units_unit_id ON shoot_day_units(unit_id);
CREATE INDEX idx_shoot_day_units_shoot_day_id ON shoot_day_units(shoot_day_id);
CREATE UNIQUE INDEX sqlite_autoindex_shoot_day_units_2 ON shoot_day_units(shoot_day_id, unit_id);
CREATE INDEX idx_shoot_days_shooting_bloc_id ON shoot_days(shooting_bloc_id);
CREATE INDEX idx_shoot_days_production_id ON shoot_days(production_id);
CREATE INDEX idx_shooting_blocs_production ON shooting_blocs(production_id);
CREATE UNIQUE INDEX sqlite_autoindex_shot_cast_2 ON shot_cast(shot_id, person_id);
CREATE INDEX idx_shots_scene_id ON shots(scene_id);
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
CREATE INDEX idx_task_template_items_parent ON task_template_items(parent_template_item_id);
CREATE INDEX idx_task_template_items_template ON task_template_items(task_template_id);
CREATE INDEX idx_technical_specs_deliverable_id ON technical_specs(deliverable_id);
CREATE INDEX idx_units_production_id ON units(production_id);
CREATE INDEX idx_vendor_invoice_expenses_expense ON vendor_invoice_expenses(expense_id);
CREATE INDEX idx_vendor_invoice_expenses_invoice ON vendor_invoice_expenses(vendor_invoice_id);
CREATE UNIQUE INDEX sqlite_autoindex_vendor_invoice_expenses_2 ON vendor_invoice_expenses(vendor_invoice_id, expense_id);
CREATE INDEX idx_vendor_invoices_po_id ON vendor_invoices(po_id);
CREATE INDEX idx_vendor_invoices_vendor_active ON vendor_invoices(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vendor_invoices_vendor_id ON vendor_invoices(vendor_id);
CREATE INDEX idx_vendor_invoices_production_id ON vendor_invoices(production_id);
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
CREATE INDEX idx_vendors_company_name ON vendors(production_id, company_name);
CREATE INDEX idx_vendors_production_id ON vendors(production_id);
CREATE INDEX idx_scenes_production_scene_number_active
  ON scenes(production_id, scene_number)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_shots_scene_shot_number_active
  ON shots(scene_id, shot_number)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_stripboard_strips_board_lookup_active
  ON stripboard_strips(production_id, strip_status, shoot_day_id, shoot_day_unit_id, sort_index)
  WHERE deleted_at IS NULL;
