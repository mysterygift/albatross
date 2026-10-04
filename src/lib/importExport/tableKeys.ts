/**
 * Tables added in formatVersion 9: script sections / sides builder, then script supervisor.
 * Parents come before children; self-referencing tables (`script_versions`, `tramlines`, `script_annotations`)
 * are ordered row-by-row in `planImportStatements`.
 */
export const APF_V9_TABLE_KEYS = [
  'script_versions',
  'script_pages',
  'script_sections',
  'script_section_ranges',
  'script_section_characters',
  'shot_script_sections',
  'shoot_day_sides_exports',
  'production_script_supervisor_settings',
  'slates',
  'takes',
  'script_supervisor_scene_progress',
  'script_supervisor_day_logs',
  'script_elements',
  'tramlines',
  'tramline_segments',
  'script_annotations',
  'script_annotation_takes',
  'continuity_media',
  'script_revision_items',
] as const

/**
 * v1 table keys for `data/production.json` → `tables`.
 * Names match SQLite table names per docs/project-import-export-audit.md §2 (INCLUDE set).
 * Order matches audit §3 import layers for documentation; export/import need not sort JSON by this array.
 */
export const APF_V1_TABLE_KEYS = [
  'productions',
  'episodes',
  'shooting_blocs',
  'units',
  'people',
  'locations',
  'shoot_days',
  'budget_categories',
  'budget_accounts',
  'budget_revisions',
  'vendors',
  'key_contacts',
  'checklist_items',
  'equipment_terms',
  'music_tracks',
  'production_task_sections',
  'deliverables',
  'fringe_rules',
  'contingency_rules',
  'production_budget_features',
  'tax_credit_schemes',
  'vat_reclaim_rates',
  'cost_report_groups',
  'production_totals',
  'production_crew_hierarchy_configs',
  'scenes',
  'shoot_day_units',
  'vendor_purchase_orders',
  'bookings',
  'cast_availability',
  'crew_availability',
  'shots',
  'location_scene',
  'stripboard_items',
  'stripboard_strips',
  'scene_cast',
  'shot_cast',
  'budget_items',
  'vendor_invoices',
  'expenses',
  'floats',
  'technical_specs',
  'clearances',
  'budget_item_details',
  'expense_transaction_details',
  'expense_tax_credit_allocations',
  'budget_item_expense_links',
  'float_expense_links',
  'vendor_invoice_expenses',
  'vendor_purchase_order_expenses',
  'vendor_purchase_order_amendments',
  'equipment',
  'equipment_lists',
  'equipment_list_items',
  'production_tasks',
  'fringe_rule_scopes',
  'contingency_rule_scopes',
  'cost_report_group_accounts',
  'production_total_accounts',
  'documents',
  'expense_receipts',
  'cue_sheets',
  'call_sheets',
  'script_documents',
  'hazard_templates',
  'risk_assessments',
  'risk_assessment_units',
  'risk_assessment_hazards',
  ...APF_V9_TABLE_KEYS,
] as const

export type ApfV1TableKey = (typeof APF_V1_TABLE_KEYS)[number]

export function isApfV1TableKey(key: string): key is ApfV1TableKey {
  return (APF_V1_TABLE_KEYS as readonly string[]).includes(key)
}
