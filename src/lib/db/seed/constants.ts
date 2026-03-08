/**
 * Fixed UUIDs for demo production dataset. Deterministic and stable.
 * All IDs use a single prefix so they're recognizable as demo data.
 */
export const DEMO_SLUG = 'demo-production-albatross'

const P = 'a1000000-0000-4000-8000-00000000'
export const IDS = {
  production: `${P}0001`,
  unitMain: `${P}0002`,
  unitSecond: `${P}0003`,
  // shoot days 1-12
  shootDay: (n: number) => `${P}${String(100 + n).padStart(4, '0')}`,
  // scenes 1-45
  scene: (n: number) => `${P}${String(200 + n).padStart(4, '0')}`,
  // shots 1-120 (spread across scenes)
  shot: (n: number) => `${P}${String(400 + n).padStart(4, '0')}`,
  // people: 14 cast + crew from demoCrewSeed (person 15..69)
  person: (n: number) => `${P}${String(500 + n).padStart(4, '0')}`,
  // crew bookings (distinct range so cast bookings don't collide)
  crewBooking: (n: number) => `${P}${String(6500 + n).padStart(4, '0')}`,
  // crew labour vendors (demo only; 8 vendors)
  crewVendor: (n: number) => `${P}${String(1718 + n).padStart(4, '0')}`,
  // crew labour invoices (demo only; 7 invoices)
  crewVendorInvoice: (n: number) => `${P}${String(1815 + n).padStart(4, '0')}`,
  // locations 1-14
  location: (n: number) => `${P}${String(600 + n).padStart(4, '0')}`,
  // budget categories 14
  budgetCat: (n: number) => `${P}${String(700 + n).padStart(4, '0')}`,
  // budget items 120
  budgetItem: (n: number) => `${P}${String(800 + n).padStart(4, '0')}`,
  // expenses 60
  expense: (n: number) => `${P}${String(900 + n).padStart(4, '0')}`,
  // key contacts
  keyContact: (n: number) => `${P}${String(1000 + n).padStart(4, '0')}`,
  // documents 10
  document: (n: number) => `${P}${String(1100 + n).padStart(4, '0')}`,
  // deliverables 12
  deliverable: (n: number) => `${P}${String(1200 + n).padStart(4, '0')}`,
  // technical_specs 12
  technicalSpec: (n: number) => `${P}${String(1300 + n).padStart(4, '0')}`,
  // music_tracks 10
  musicTrack: (n: number) => `${P}${String(1400 + n).padStart(4, '0')}`,
  // clearances 10
  clearance: (n: number) => `${P}${String(1500 + n).padStart(4, '0')}`,
  // stripboard strips (many)
  strip: (n: number) => `${P}${String(2000 + n).padStart(4, '0')}`,
  // shoot_day_units
  shootDayUnit: (dayIdx: number, unitIdx: number) =>
    `${P}${String(3000 + dayIdx * 2 + unitIdx).padStart(4, '0')}`,
  // scene_cast (many)
  sceneCast: (n: number) => `${P}${String(4000 + n).padStart(4, '0')}`,
  // shot_cast (refinement layer; many)
  shotCast: (n: number) => `${P}${String(4100 + n).padStart(4, '0')}`,
  // cast_availability
  availability: (n: number) => `${P}${String(5000 + n).padStart(4, '0')}`,
  // bookings (cast only for demo)
  booking: (n: number) => `${P}${String(6200 + n).padStart(4, '0')}`,
  // location_scene
  locationScene: (n: number) => `${P}${String(6000 + n).padStart(4, '0')}`,
  // stripboard_items (legacy table - may not be used if using strips)
  stripboardItem: (n: number) => `${P}${String(7000 + n).padStart(4, '0')}`,
  // cue_sheet
  cueSheet: `${P}7999`,
  // equipment_terms (LENS + SUPPORT for shot list suggestions)
  equipmentTerm: (n: number) => `${P}${String(1600 + n).padStart(4, '0')}`,
  // production_task_sections (Pre-Production, Principal Photography, Post-Production)
  taskSection: (n: number) => `${P}${String(8000 + n).padStart(4, '0')}`,
  // production_tasks (including subtasks)
  task: (n: number) => `${P}${String(8100 + n).padStart(4, '0')}`,
  // budget_item_expense_links (demo reconciliation)
  reconciliationLink: (n: number) => `${P}${String(8500 + n).padStart(4, '0')}`,
  // vendors (demo only, 18 vendors)
  vendor: (n: number) => `${P}${String(1700 + n).padStart(4, '0')}`,
  // vendor invoices (demo only)
  vendorInvoice: (n: number) => `${P}${String(1800 + n).padStart(4, '0')}`,
  // vendor purchase orders (demo only)
  vendorPO: (n: number) => `${P}${String(1900 + n).padStart(4, '0')}`,
  // invoice reminder tasks (demo only; distinct from task sections/tasks)
  invoiceReminderTask: (n: number) => `${P}${String(8200 + n).padStart(4, '0')}`,
  // vendor_invoice_expenses link table (demo only)
  vendorInvoiceExpenseLink: (n: number) => `${P}${String(8600 + n).padStart(4, '0')}`,
  // vendor_purchase_order_expenses link table (demo only)
  vendorPOExpenseLink: (n: number) => `${P}${String(8700 + n).padStart(4, '0')}`,
  // equipment registry (demo only; ~120 items)
  equipment: (n: number) => `${P}${String(8300 + n).padStart(4, '0')}`,
  // equipment item_uuid (unique per production; demo only)
  equipmentItemUuid: (n: number) => `${P}${String(8400 + n).padStart(4, '0')}`,
  // equipment lists (demo only)
  equipmentList: (n: number) => `${P}${String(8500 + n).padStart(4, '0')}`,
  // equipment list items (demo only; 8750+ to avoid collision with vendorInvoiceExpenseLink 8600+)
  equipmentListItem: (n: number) => `${P}${String(8750 + n).padStart(4, '0')}`,
  // equipment return reminder tasks (demo only; distinct from invoice reminder tasks)
  equipmentReminderTask: (n: number) => `${P}${String(8220 + n).padStart(4, '0')}`,
} as const

export const SEED_VERSION = '2'

/** Fixed id for demo-seeded GBP→USD rate so reset can remove only this row. */
export const DEMO_EXCHANGE_RATE_ID = 'a1000000-0000-4000-8000-0000demoexch01'
