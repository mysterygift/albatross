/** Domain types for Albatross. All IDs are UUIDs. Timestamps are ISO8601 strings. */

export type SoftDeletable = {
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Instance-scoped client (person or business), reusable across productions. */
export type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
} & SoftDeletable

export type Production = {
  id: string
  name: string
  slug: string
  /** ISO 4217 code; all stored budget numbers are in this currency. Default GBP. */
  currency_code: string
  notes: string | null
  /** Optional link to an instance-scoped client. */
  client_id: string | null
  /** Target delivery date (ISO YYYY-MM-DD). */
  delivery_date: string | null
  /** When true, production uses episodic mode. Irreversible once enabled (app-enforced). */
  is_episodic: boolean
  /** When set, production was completed/wrapped (e.g. via Wrap Production workflow). */
  wrapped_at: string | null
  /** When set, production is archived (hidden from default list); reversible. */
  archived_at: string | null
  /** When set to 'demo', production was created from the Demo template (used for override confirmation). */
  created_from_template: string | null
} & SoftDeletable

export type Episode = {
  id: string
  production_id: string
  name: string
  sort_order: number
} & SoftDeletable

/** Inclusive calendar date range; dates are ISO `YYYY-MM-DD` strings. */
export type ShootingBloc = {
  id: string
  production_id: string
  name: string
  start_date: string
  end_date: string
} & SoftDeletable

export type Person = {
  id: string
  production_id: string
  name: string
  is_cast: number
  email: string | null
  phone: string | null
  department: string | null
  phases: string | null
  notes: string | null
  contributor_form_status: 'not_requested' | 'requested' | 'signed' | 'expired'
  cast_number: string | null
  agent_name: string | null
  agent_email: string | null
  agent_phone: string | null
  /** Cast role (e.g. character name); null for crew or when unset. */
  role_name: string | null
} & SoftDeletable

export type Location = {
  id: string
  production_id: string
  name: string
  booked_status: 'unbooked' | 'hold' | 'booked' | 'wrap'
  /** Canonical full address used by logistics documents such as Movement Orders. */
  address: string | null
  what3words: string | null
  parking_info: string | null
  availability_constraints: string | null
  permit_fee: number | null
  location_fee: number | null
  notes: string | null
} & SoftDeletable

export type Document = {
  id: string
  production_id: string | null
  entity_type: string | null
  entity_id: string | null
  file_name: string
  file_path: string
  mime_type: string | null
} & SoftDeletable

export type BudgetCategory = {
  id: string
  production_id: string
  code: string
  name: string
  phase: 'pre' | 'production' | 'post'
} & SoftDeletable

/**
 * Hierarchical Chart of Accounts for film/TV production budgets.
 * Account codes are stored as TEXT (e.g. '1000', '2513') for future flexibility.
 * Leaf-only posting rule: only accounts with is_postable = true may receive
 * budget line items or expenses; parent accounts are for rollups only.
 */
export type BudgetAccount = {
  id: string
  production_id: string
  code: string
  name: string
  parent_account_id: string | null
  sort_order: number
  is_postable: boolean
  /** Optional custom band colour for rollup accounts (UI only). 6-digit hex e.g. #9DBBAA. */
  color_hex: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Supported line item types for typed classification (mirrors expense transaction types). */
export type LineItemType = 'labour' | 'purchase' | 'rental' | 'allow' | 'deposit'

export type BudgetItem = {
  id: string
  production_id: string
  budget_revision_id: string | null
  /** Legacy; may be null when row uses account_id (chart of accounts). */
  category_id: string | null
  /** Optional link to chart of accounts (budget_accounts.id). Leaf accounts only. */
  account_id: string | null
  description: string
  estimated_cost: number
  /** Deprecated for actual calculations. Actuals come from expenses. May be repurposed as "committed" in future. */
  actual_cost: number
  vendor: string | null
  status: string
  /** Typed classification discriminator; null when unclassified. */
  line_item_type: LineItemType | null
} & SoftDeletable

export type BudgetItemDetails = {
  id: string
  budget_item_id: string
  line_item_type: LineItemType
  /** JSON payload; structure per line_item_type (opaque in this stage). */
  details_json: string
  created_at: string
  updated_at: string
}

export type BudgetItemWithDetails = {
  budget_item: BudgetItem
  details: BudgetItemDetails | null
}

/** Petty cash float allocated from a budget line item to a crew member (allocation only; not reconciliation). */
export type PettyCashFloat = {
  id: string
  production_id: string
  budget_revision_id: string | null
  budget_item_id: string
  person_id: string
  amount: number
  currency: string
  issued_date: string
  notes: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

/** Reconciliation of an expense against a petty cash float (matched_amount only; no budget mutations). */
export type FloatExpenseLink = {
  id: string
  budget_revision_id: string | null
  float_id: string
  expense_id: string
  matched_amount: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

/** Derived float reconciliation status (not stored in DB). */
export type PettyCashFloatReconciliationStatus = 'unmatched' | 'partial' | 'matched' | 'overspent'

export type Vendor = {
  id: string
  production_id: string
  company_name: string
  primary_contact_full_name: string | null
  primary_contact_email: string | null
} & SoftDeletable

/** Invoice lifecycle status. Enforced in DB via CHECK; use this union in TS. */
export type VendorInvoiceStatus = 'draft' | 'received' | 'approved' | 'paid' | 'overdue'

export type VendorInvoice = {
  id: string
  production_id: string
  vendor_id: string
  /** Optional link to a vendor purchase order. */
  po_id: string | null
  invoice_number: string
  issue_date: string | null
  due_date: string | null
  amount: number | null
  tax: number | null
  currency_code: string | null
  status: VendorInvoiceStatus
  notes: string | null
} & SoftDeletable

/** Link between a vendor invoice and an expense (one invoice, many expenses). */
export type VendorInvoiceExpenseLink = {
  id: string
  vendor_invoice_id: string
  expense_id: string
  created_at: string
  updated_at: string
}

/** Link between a vendor purchase order and an expense (one PO, many expenses). */
export type VendorPurchaseOrderExpenseLink = {
  id: string
  vendor_purchase_order_id: string
  expense_id: string
  created_at: string
  updated_at: string
}

/** Purchase order lifecycle status. Enforced in DB via CHECK; use this union in TS. */
export type PurchaseOrderStatus =
  | 'draft'
  | 'issued'
  | 'approved'
  | 'closed'
  | 'cancelled'

export type VendorPurchaseOrder = {
  id: string
  production_id: string
  vendor_id: string
  po_number: string
  description: string | null
  issue_date: string | null
  due_date: string | null
  amount: number | null
  status: PurchaseOrderStatus
  approval: number
  notes: string | null
} & SoftDeletable

export type ExpenseTransactionType = 'labour' | 'purchase' | 'rental' | 'allow' | 'deposit'

/** Transaction type key for VAT reclaim rate lookup; includes legacy/untyped spend. */
export type VatReclaimTransactionType = ExpenseTransactionType | 'untyped'

export type Expense = {
  id: string
  production_id: string
  category_id: string | null
  /** Optional link to chart of accounts (budget_accounts.id). Leaf accounts only. */
  account_id: string | null
  /** Typed transaction discriminator; null for legacy/untyped spend. */
  transaction_type: ExpenseTransactionType | null
  /** Optional normalized vendor link; legacy vendor string remains in vendor. */
  vendor_id: string | null
  amount: number
  date: string
  vendor: string | null
  notes: string | null
  expense_type: 'petty_cash' | 'per_diem' | 'other'
  /** VAT rate as percent (e.g. 20 for 20%); null when unset or VAT tracking disabled. */
  vat_rate_percent: number | null
  /** Amount of VAT actually reclaimed from HMRC (or equivalent). */
  vat_reclaimed_amount: number | null
  /** Date reclaim was received or submitted (ISO YYYY-MM-DD). */
  vat_reclaim_date: string | null
  /** Reference for the reclaim (e.g. HMRC submission ref). */
  vat_reclaim_reference: string | null
} & SoftDeletable

/** Per-transaction-type VAT reclaim % for a production (share of VAT paid that is reclaimable). */
export type VatReclaimRate = {
  id: string
  production_id: string
  transaction_type: VatReclaimTransactionType
  reclaim_percent: number
  created_at: string
  updated_at: string
}

/** Per-production budget feature toggles (tax credits, VAT). Data preserved when toggles off. */
export type ProductionBudgetFeatures = {
  production_id: string
  tax_credits_enabled: boolean
  vat_tracking_enabled: boolean
  /** Default VAT % for new expenses when VAT tracking is enabled. */
  default_vat_rate_percent: number | null
  created_at: string
  updated_at: string
}

/** Configurable tax credit scheme (e.g. AVEC live action, California Film & TV). */
export type TaxCreditScheme = {
  id: string
  production_id: string
  name: string
  /** Net credit rate as decimal (e.g. 0.255 = 25.5%). */
  net_rate: number
  /** Max qualifying spend as fraction of total core spend (e.g. 0.80); null = no cap. */
  cap_percent: number | null
  /** Minimum qualifying spend as fraction of total core spend (warning threshold). */
  min_qualifying_percent: number | null
  /** Absolute cap on qualifying spend for this scheme. */
  max_qualifying_amount: number | null
  /** Production ineligible when total core spend exceeds this amount. */
  max_core_budget: number | null
  is_vfx: boolean
  is_enabled: boolean
  sort_order: number
} & SoftDeletable

/** Portion of an expense tagged as qualifying for a tax credit scheme. */
export type ExpenseTaxCreditAllocation = {
  id: string
  expense_id: string
  tax_credit_scheme_id: string
  qualifying_amount: number
} & SoftDeletable

export type ExpenseTransactionDetails = {
  id: string
  expense_id: string
  transaction_type: ExpenseTransactionType
  /** JSON string payload; structured per transaction type. */
  details_json: string
  created_at: string
  updated_at: string
}

/** Link between a budget line item and an expense for reconciliation. Supports partial matching. */
export type BudgetItemExpenseLink = {
  id: string
  production_id: string
  budget_revision_id: string | null
  budget_item_id: string
  expense_id: string
  matched_amount: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Derived status for a line item based on matched amount vs estimated_cost. */
export type BudgetItemReconciliationStatus = 'unmatched' | 'partial' | 'matched' | 'overspent'

/** Derived status for an expense based on allocated amount vs amount. */
export type ExpenseReconciliationStatus = 'unallocated' | 'partial' | 'allocated'

/** Derived budget layer: percentage applied to a scoped base (budget or actual). */
export type FringeRule = {
  id: string
  production_id: string
  budget_revision_id: string | null
  name: string
  rate: number
  base_kind: 'budget' | 'actual'
  scope_mode: string
  is_enabled: boolean
} & SoftDeletable

export type FringeRuleScope = {
  id: string
  rule_id: string
  account_id: string
  include_children: number
}

/** Derived budget layer: contingency percentage applied to scoped base. */
export type ContingencyRule = {
  id: string
  production_id: string
  budget_revision_id: string | null
  name: string
  rate: number
  base_kind: 'budget' | 'actual'
  scope_mode: string
  is_enabled: boolean
} & SoftDeletable

export type ContingencyRuleScope = {
  id: string
  rule_id: string
  account_id: string
  include_children: number
}

/** Presentation/reporting group for accounts. Does not affect posting or totals. */
export type CostReportGroup = {
  id: string
  production_id: string
  budget_revision_id: string | null
  code: string | null
  name: string
  sort_order: number
} & SoftDeletable

export type CostReportGroupAccount = {
  id: string
  group_id: string
  account_id: string
}

/** User-defined rollup total for Cost Report (e.g. Above the line, Below the line). Reporting only; does not affect accounting. */
export type ProductionTotal = {
  id: string
  production_id: string
  budget_revision_id: string | null
  name: string
  sort_order: number
} & SoftDeletable

export type ProductionTotalAccount = {
  id: string
  production_total_id: string
  account_id: string
}

export type ShootDay = {
  id: string
  production_id: string
  /** System-managed from `shoot_date` and non-overlapping bloc ranges; not user-editable. */
  shooting_bloc_id: string | null
  shoot_date: string
  day_number: number | null
  call_time: string | null
  wrap_time: string | null
  notes: string | null
  weather_manual: string | null
  meal_times_json: string | null
  weather_json: string | null
  parking_base_address: string | null
  special_notes: string | null
  hospital_name: string | null
  hospital_address: string | null
  police_station_name: string | null
  police_station_address: string | null
} & SoftDeletable

export type Unit = {
  id: string
  production_id: string
  name: string
} & SoftDeletable

export type ShootDayUnit = {
  id: string
  shoot_day_id: string
  unit_id: string
  notes: string | null
  is_locked: number
} & SoftDeletable

/** SHOT = one shot from Shot List (stripboard is shot-based). SCENE kept for legacy/display fallback. */
export type StripType = 'SHOT' | 'SCENE' | 'MOVE' | 'CALL' | 'LUNCH' | 'WRAP' | 'NOTE'

/** Strip state: on a day (SCHEDULED), in Unscheduled panel (UNSCHEDULED), or discarded (BONEYARD). Only BONEYARD strips can be permanently deleted. */
export type StripStatus = 'SCHEDULED' | 'UNSCHEDULED' | 'BONEYARD'

export type StripboardStrip = {
  id: string
  production_id: string
  /** Null when strip_status is UNSCHEDULED or BONEYARD. */
  shoot_day_id: string | null
  shoot_day_unit_id: string | null
  strip_type: StripType
  /** Legacy/fallback; for SHOT strips prefer shot_id and derive scene via shot.scene_id. */
  scene_id: string | null
  /** Required for SHOT strips (one strip = one shot). Null for non-SHOT or legacy. */
  shot_id: string | null
  title: string | null
  description: string | null
  /** Override for time to cover this strip (minutes). When null, use shot estimated_shoot_minutes. */
  estimated_minutes: number | null
  sort_index: number
  color_tag: string | null
  strip_status: StripStatus
  /** MOVE strips only: optional origin for travel routing. */
  origin_location_id: string | null
  /** MOVE strips only: optional destination for travel routing. */
  destination_location_id: string | null
} & SoftDeletable

export type Scene = {
  id: string
  production_id: string
  /** Episodic productions only; scenes reference an episode row (archive = episode soft-delete). */
  episode_id: string | null
  scene_number: string
  heading: string | null
  title: string | null
  description: string | null
  int_ext: 'INT' | 'EXT' | 'MIXED' | 'UNK' | null
  day_night: 'DAY' | 'NIGHT' | 'MIXED' | 'UNK' | null
  page_eighths: number | null
  location_id: string | null
  /** Estimated duration in minutes; NULL = unknown (treated as 0 in runtime sums). */
  duration_minutes: number | null
} & SoftDeletable

export type SceneCast = {
  id: string
  production_id: string
  scene_id: string
  person_id: string
} & SoftDeletable

/** Shot-level cast participation. Refinement layer on top of scene_cast; DooD still uses scene_cast only. */
export type ShotCast = {
  id: string
  production_id: string
  shot_id: string
  person_id: string
} & SoftDeletable

export type CastAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'TENTATIVE'

/** Shared availability status for cast and crew windows. */
export type PersonAvailabilityStatus = CastAvailabilityStatus

export type CastAvailability = {
  id: string
  production_id: string
  person_id: string
  start_date: string
  end_date: string
  availability: CastAvailabilityStatus
  notes: string | null
} & SoftDeletable

export type CrewAvailability = {
  id: string
  production_id: string
  person_id: string
  start_date: string
  end_date: string
  availability: PersonAvailabilityStatus
  notes: string | null
} & SoftDeletable

export type KeyContact = {
  id: string
  production_id: string
  department: string
  name: string | null
  phone: string | null
  email: string | null
  notes: string | null
} & SoftDeletable

export type CallSheetRecord = {
  id: string
  production_id: string
  shoot_day_id: string
  shoot_day_unit_id: string | null
  overrides_json: string | null
  generated_document_id: string | null
} & SoftDeletable

export const SHOT_SIZE_VALUES = [
  'LS', 'FS', 'MFS', 'CS', 'MS', 'MCU', 'CU', 'ECU',
] as const
export type ShotSize = (typeof SHOT_SIZE_VALUES)[number]

export const CAMERA_MOVEMENT_VALUES = [
  'Static',
  'Track In', 'Track Out',
  'Pan Left', 'Pan Right',
  'Tilt Up', 'Tilt Down',
  'Track Left', 'Track Right',
  'Roll Clockwise', 'Roll Counter Clockwise',
  'Raise', 'Lower',
] as const
export type CameraMovement = (typeof CAMERA_MOVEMENT_VALUES)[number]

export type Shot = {
  id: string
  scene_id: string
  shot_number: string
  /** Brief under-title line on stripboard; distinct from subject and notes. */
  shot_description: string | null
  subject: string | null
  shot_size: ShotSize | null
  support: string | null
  lens: string | null
  duration_seconds: number | null
  /** Estimated time to get the shot in practice (minutes). Used for stripboard day totals; NULL = unknown. */
  estimated_shoot_minutes: number | null
  camera_movement: CameraMovement | null
  notes: string | null
} & SoftDeletable

export const STORYBOARD_IMAGE_SOURCE_TYPES = ['manual', 'athena_pdf_import'] as const
export type StoryboardImageSourceType = (typeof STORYBOARD_IMAGE_SOURCE_TYPES)[number]

export type StoryboardImage = {
  id: string
  production_id: string
  scene_id: string
  shot_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  width: number | null
  height: number | null
  sort_order: number
  source_type: StoryboardImageSourceType
  source_import_id: string | null
} & SoftDeletable

export const STORYBOARD_IMPORT_SOURCE_TYPES = ['athena_pdf_import'] as const
export type StoryboardImportSourceType = (typeof STORYBOARD_IMPORT_SOURCE_TYPES)[number]

export const STORYBOARD_IMPORT_STATUS_VALUES = ['pending', 'completed', 'failed'] as const
export type StoryboardImportStatus = (typeof STORYBOARD_IMPORT_STATUS_VALUES)[number]

export type StoryboardImport = {
  id: string
  production_id: string
  scene_id: string | null
  source_filename: string
  source_type: StoryboardImportSourceType
  status: StoryboardImportStatus
  metadata_json: string | null
} & SoftDeletable

export type EquipmentTerm = {
  id: string
  production_id: string
  type: string
  value: string
} & SoftDeletable

export type StripboardItem = {
  id: string
  shoot_day_id: string
  scene_id: string
  sort_order: number
} & SoftDeletable

export type Booking = {
  id: string
  production_id: string
  person_id: string
  shoot_day_id: string | null
  start_date: string | null
  end_date: string | null
  role: string | null
  notes: string | null
} & SoftDeletable

/**
 * Canonical equipment categories (grouped package model).
 * Stored values are machine-friendly snake_case.
 * Display labels are provided by formatEquipmentCategoryLabel / formatEquipmentLabel.
 */
export const EQUIPMENT_CATEGORY_VALUES = [
  'camera',
  'lenses',
  'camera_support',
  'camera_accessories',
  'wireless_systems',
  'lighting',
  'lighting_accessories',
  'power_distribution',
  'grip',
  'sound',
  'dit_video_village',
  'production_logistics',
  'storage_cases',
  'consumables',
  'other',
] as const
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORY_VALUES)[number]

/**
 * Mapping from legacy equipment category values to canonical categories.
 * Used by DB migration and CSV import to normalize old data.
 * Any category not in this map is treated as 'other'.
 */
export const EQUIPMENT_CATEGORY_LEGACY_MAP: Record<string, EquipmentCategory> = {
  camera_body: 'camera',
  lens: 'lenses',
  camera_support: 'camera_support',
  camera_accessory: 'camera_accessories',
  wireless_video: 'wireless_systems',
  wireless_fiz: 'wireless_systems',
  lighting_fixture: 'lighting',
  lighting_accessory: 'lighting_accessories',
  power_distribution: 'power_distribution',
  grip: 'grip',
  sound: 'sound',
  dit: 'dit_video_village',
  monitor: 'dit_video_village',
  consumable: 'consumables',
  other: 'other',
}

/** Equipment lifecycle status. Default is planned. */
export const EQUIPMENT_STATUS_VALUES = ['planned', 'active', 'returned', 'lost', 'damaged'] as const
export type EquipmentStatus = (typeof EQUIPMENT_STATUS_VALUES)[number]

export type Equipment = {
  id: string
  production_id: string
  name: string
  /** Count of identical units (e.g. 8× Sandbags). Default 1. */
  quantity: number
  source_type: 'owned' | 'purchased' | 'rented'
  vendor: string | null
  shoot_day_id: string | null
  notes: string | null
  item_uuid: string
  category: EquipmentCategory
  status: EquipmentStatus
  department: string | null
  vendor_id: string | null
  invoice_id: string | null
  rental_start_date: string | null
  return_due_date: string | null
  returned_at: string | null
  replacement_value: number | null
  serial_number: string | null
} & SoftDeletable

/** Production-scoped equipment list (e.g. day kit, department package). References registry items via list items. */
export type EquipmentList = {
  id: string
  production_id: string
  shoot_day_id: string | null
  name: string
  department: string | null
  notes: string | null
} & SoftDeletable

/** Row on an equipment list: references one registry equipment item and holds checklist state. */
export type EquipmentListItem = {
  id: string
  equipment_list_id: string
  equipment_id: string
  sort_order: number
  /** How many units of this registry item to include on the list. Default 1. */
  quantity: number
  /** 1 = checked out, 0 = not. Operational checklist state only. */
  checked_out: number
  /** 1 = checked back in, 0 = not. Operational checklist state only. */
  checked_back_in: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProductionTaskSection = {
  id: string
  production_id: string
  name: string
  sort_order: number
} & SoftDeletable

export type ProductionTask = {
  id: string
  production_id: string
  description: string
  is_complete: number
  notes: string | null
  due_date: string | null
  assigned_department: string | null
  priority: 1 | 2 | 3 | null
  /** Null = top-level task; non-null = subtask of another task in the same production. */
  parent_task_id: string | null
  /** Null = unsectioned; non-null = task belongs to a section in the same production. */
  section_id: string | null
  /** Null = normal task; non-null = reminder task for this vendor invoice (at most one task per invoice). */
  vendor_invoice_id: string | null
  /** Null = normal task; non-null = return reminder task for this equipment item (at most one task per equipment). */
  equipment_id: string | null
} & SoftDeletable

/** Global task template (not production-scoped). */
export type TaskTemplate = {
  id: string
  name: string
  description: string | null
} & SoftDeletable

/** Item within a task template. Supports nesting via parent_template_item_id. */
export type TaskTemplateItem = {
  id: string
  task_template_id: string
  description: string
  notes: string | null
  due_offset_days: number | null
  assigned_department: string | null
  priority: 1 | 2 | 3 | null
  section_name: string | null
  parent_template_item_id: string | null
  sort_order: number
} & SoftDeletable

export type Deliverable = {
  id: string
  production_id: string
  /** Episodic productions only: null = project-wide; set = specific episode. */
  episode_id: string | null
  name: string
  due_date: string | null
  status: string
  /** Who the deliverable is sent to. */
  recipient: string | null
  delivery_method: string | null
  delivered_by: string | null
  delivered_at: string | null
  /** pending | approved | rejected */
  approval_status: string | null
} & SoftDeletable

/** Global deliverable template (not production-scoped). */
export type DeliverableTemplate = {
  id: string
  name: string
  description: string | null
} & SoftDeletable

/** Item within a deliverable template. spec_defaults_json holds optional technical spec fields as JSON. */
export type DeliverableTemplateItem = {
  id: string
  deliverable_template_id: string
  name: string
  due_offset_days: number | null
  default_status: string | null
  spec_defaults_json: string | null
  sort_order: number
} & SoftDeletable

export type TechnicalSpec = {
  id: string
  deliverable_id: string
  resolution: string | null
  codec: string | null
  audio: string | null
  captions: string | null
  aspect_ratio: string | null
  platform: string | null
  notes: string | null
  bitrate: string | null
  subtitles: string | null
  graphics: string | null
  language: string | null
  audio_mix: string | null
} & SoftDeletable

export type MusicTrack = {
  id: string
  production_id: string
  /** Episodic productions only: null = project-wide; set = specific episode. */
  episode_id: string | null
  title: string
  artist: string | null
  publisher_label: string | null
  notes: string | null
} & SoftDeletable

export type Clearance = {
  id: string
  production_id: string
  type: 'music' | 'archive'
  item_id: string
  status: string
  requested_at: string | null
  granted_at: string | null
  expiry: string | null
} & SoftDeletable

export type LocationScene = {
  id: string
  location_id: string
  scene_id: string
} & SoftDeletable

export type OutboxRow = {
  id: string
  entity: string
  entity_id: string
  operation: 'create' | 'update' | 'delete'
  payload_json: string | null
  created_at: string
}

// ─── Script Sections & Sides (SB1) ──────────────────────────────────────────

/** Section classification; mirrors the script_sections.section_type CHECK constraint. */
export type ScriptSectionType =
  | 'dialogue'
  | 'action'
  | 'stunt'
  | 'vfx'
  | 'pickup'
  | 'insert'
  | 'custom'

/** Planning lifecycle; mirrors the script_sections.status CHECK constraint. */
export type ScriptSectionStatus = 'unplanned' | 'planned' | 'scheduled' | 'shot' | 'omitted'

/** A specific version/revision of a script for a production (optionally an episode). */
export type ScriptVersion = {
  id: string
  production_id: string
  episode_id: string | null
  title: string | null
  version_label: string | null
  /** Industry revision colour (e.g. 'White', 'Blue', 'Pink'); free text. */
  revision_colour: string | null
  /** Whether the page set is locked; stored as 0/1. */
  is_locked: number
  /** Optional JSON metadata for locked-page tracking. */
  locked_pages_json: string | null
  /** Prior script version this revision was imported from, when known. */
  previous_script_version_id: string | null
} & SoftDeletable

/** A single page of a script version; may map to a scene where known. */
export type ScriptPage = {
  id: string
  script_version_id: string
  scene_id: string | null
  /** Display page number (may be non-numeric, e.g. '12A'). */
  page_number: string | null
  /** Zero-based ordering index within the script version. */
  page_index: number
  /** Raw or parsed text content for the page. */
  content: string | null
  /** Estimated eighths of a page. */
  eighths: number | null
} & SoftDeletable

/** A contiguous, schedulable unit of script content within a scene. */
export type ScriptSection = {
  id: string
  production_id: string
  script_version_id: string
  scene_id: string
  episode_id: string | null
  label: string | null
  section_type: ScriptSectionType
  status: ScriptSectionStatus
  notes: string | null
  /** Whether the section was created manually rather than parsed; stored as 0/1. */
  is_manual: number
  /** Whether the user edited page/eighth ranges on a generated section; stored as 0/1. */
  ranges_user_edited: number
} & SoftDeletable

/** Page/eighth (and optional text-offset) extent of a section. */
export type ScriptSectionRange = {
  id: string
  section_id: string
  start_page: string | null
  start_eighth: number | null
  end_page: string | null
  end_eighth: number | null
  start_offset: number | null
  end_offset: number | null
} & SoftDeletable

/** A character/person appearing in a section. */
export type ScriptSectionCharacter = {
  id: string
  section_id: string
  /** Link to people(id) where known; null otherwise. */
  person_id: string | null
  /** Fallback display name when no person link exists. */
  character_name: string | null
} & SoftDeletable

/** Link between a shot and a script section, with optional coverage metadata. */
export type ShotScriptSection = {
  id: string
  shot_id: string
  script_section_id: string
  coverage_notes: string | null
  sort_index: number
} & SoftDeletable

/** A generated sides export record for a shoot day (document reference only). */
export type ShootDaySidesExport = {
  id: string
  production_id: string
  shoot_day_id: string
  unit_id: string | null
  document_id: string | null
  script_version_id: string | null
  export_label: string | null
  /** JSON metadata: included sections, filters, warnings. */
  metadata_json: string | null
} & SoftDeletable

// ─── Calendar (Schedule view) ───────────────────────────────────────────────

/** Unit key for calendar display; derived from unit name. */
export type CalendarUnitKey = 'main' | 'second'

export type CalendarShootDayEvent = {
  shootDayId: string
  shootDayUnitId: string
  date: string
  /** From `shoot_days.shooting_bloc_id`; null when no bloc covers the day. */
  shootingBlocId: string | null
  shootingBlocName: string | null
  unitId: string
  unitName: string
  unitKey: CalendarUnitKey
  callTime: string | null
  lunchTime: string | null
  wrapTime: string | null
  notes: string | null
  primaryLocationName: string | null
  primaryLocationId: string | null
  shotCount: number
  estMinutes: number
}

export type CalendarDateRange = {
  start: string
  end: string
}

export type CalendarEventFilters = {
  /** When set, only include events for this unit. */
  unitId?: string | null
  /**
   * Episodic schedule narrowing. `'unassigned'` = shoot days outside any bloc.
   * A bloc id = that bloc only. Omit or `'all'` for no filter.
   */
  shootingBlocFilter?: 'all' | 'unassigned' | string
}
