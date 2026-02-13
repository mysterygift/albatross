/** Domain types for Albatross. All IDs are UUIDs. Timestamps are ISO8601 strings. */

export type SoftDeletable = {
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type Production = {
  id: string
  name: string
  slug: string
  /** ISO 4217 code; all stored budget numbers are in this currency. Default GBP. */
  currency_code: string
  notes: string | null
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
} & SoftDeletable

export type Location = {
  id: string
  production_id: string
  name: string
  booked_status: 'unbooked' | 'hold' | 'booked' | 'wrap'
  address: string | null
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

export type BudgetItem = {
  id: string
  production_id: string
  category_id: string
  description: string
  estimated_cost: number
  actual_cost: number
  vendor: string | null
  status: string
} & SoftDeletable

export type Expense = {
  id: string
  production_id: string
  category_id: string | null
  amount: number
  date: string
  vendor: string | null
  notes: string | null
  expense_type: 'petty_cash' | 'per_diem' | 'other'
} & SoftDeletable

export type ShootDay = {
  id: string
  production_id: string
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
} & SoftDeletable

export type Scene = {
  id: string
  production_id: string
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

export type CastAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'TENTATIVE'

export type CastAvailability = {
  id: string
  production_id: string
  person_id: string
  start_date: string
  end_date: string
  availability: CastAvailabilityStatus
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
  description: string | null
  /** Brief under-title line on stripboard; distinct from subject and notes. */
  shot_description: string | null
  subject: string | null
  action_description: string | null
  shot_size: ShotSize | null
  support: string | null
  lens: string | null
  duration_seconds: number | null
  /** Estimated time to get the shot in practice (minutes). Used for stripboard day totals; NULL = unknown. */
  estimated_shoot_minutes: number | null
  camera_movement: CameraMovement | null
  notes: string | null
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

export type Equipment = {
  id: string
  production_id: string
  name: string
  source_type: 'owned' | 'purchased' | 'rented'
  vendor: string | null
  cost: number | null
  shoot_day_id: string | null
  notes: string | null
} & SoftDeletable

export type ChecklistItem = {
  id: string
  production_id: string
  title: string
  is_required: number
  status: 'pending' | 'complete'
  sort_order: number
} & SoftDeletable

export type Deliverable = {
  id: string
  production_id: string
  name: string
  due_date: string | null
  status: string
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
} & SoftDeletable

export type MusicTrack = {
  id: string
  production_id: string
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

// ─── Calendar (Schedule view) ───────────────────────────────────────────────

/** Unit key for calendar display; derived from unit name. */
export type CalendarUnitKey = 'main' | 'second'

export type CalendarShootDayEvent = {
  shootDayId: string
  shootDayUnitId: string
  date: string
  unitId: string
  unitName: string
  unitKey: CalendarUnitKey
  callTime: string | null
  lunchTime: string | null
  wrapTime: string | null
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
}
