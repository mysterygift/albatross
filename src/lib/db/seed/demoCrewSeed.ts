/**
 * Rich demo Crew seed for the singleton demo production.
 * Seeds: crew people (is_cast=0), freelance crew labour vendors, and freelance crew labour invoices.
 * Crew shoot-day bookings are seeded in seedDemoCrewBookings (demoBookingSeed). Deterministic and demo-only.
 * Singleton crew/vendors/invoices/tasks use multi-row INSERTs in one transaction to keep sqlx parse time and write-queue duration low (Verify Cascades and other writers wait on the same queue).
 *
 * - Source: DEMO_CREW and DEMO_CREW_LABOUR_INVOICES below (production-realistic).
 * - HODs: Line Producer (Production), Production Accountant (Finance), Locations Manager,
 *   Production Designer (Art), Director of Photography (Camera), Gaffer (Lighting),
 *   Key Grip (Grip), Sound Mixer (Sound). Editor/Colourist represent post; Post-Production
 *   Supervisor not in this dataset.
 * - Freelance invoice demos: crew with freelance_vendor_name get a vendor record and
 *   entries in DEMO_CREW_LABOUR_INVOICES show paid/received/approved/overdue variety.
 *
 * Call after: shoot_days, seedDemoPeople (cast), seedDemoBookings (cast), seedDemoVendors,
 * seedDemoBudget, seedDemoVendorFinance. Then run seedDemoCrewBookings after this function.
 */

import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import { CREW_DEPARTMENTS } from '@/lib/people/crewDepartments'
import type { CrewDepartmentName } from '@/lib/people/crewDepartments'
import { IDS } from './constants'
import type { DemoSeedIdSource } from './demoSeedContext'

const TABLE_PEOPLE = 'people'
const TABLE_VENDORS = 'vendors'
const TABLE_INVOICES = 'vendor_invoices'
const TABLE_TASKS = 'production_tasks'
const INVOICE_REMINDER_DEPARTMENT = 'Accounts'

// ---------------------------------------------------------------------------
// Source-of-truth: crew dataset (role_name must match CREW_DEPARTMENTS)
// ---------------------------------------------------------------------------

/** Single crew member seed definition. department/role_name must match CREW_DEPARTMENTS. */
type DemoCrewDef = {
  name: string
  department: CrewDepartmentName
  role_name: string
  email: string
  phone: string
  phases: string | null
  notes: string | null
  /** If set, this crew has a labour vendor (freelance-style); vendor record created in seed. */
  freelance_vendor_name?: string | null
}

const DEMO_CREW: DemoCrewDef[] = [
  {
    name: 'Alex Carter',
    department: 'Production',
    role_name: 'Line Producer',
    email: 'alex.carter@noholdsbarred.pictures',
    phone: '07700 900101',
    phases: 'prep,shoot,wrap,post',
    notes: 'HOD for Production. Oversees overall spend approvals and crew turnover. Wants daily cost reports by 20:00.',
    freelance_vendor_name: null,
  },
  {
    name: 'Jamie Reynolds',
    department: 'Production',
    role_name: 'Production Coordinator',
    email: 'jamie.reynolds@noholdsbarred.pictures',
    phone: '07700 900102',
    phases: 'prep,shoot,wrap',
    notes: 'Tracks crew paperwork, unit moves, and day-before call sheet circulation. Needs cast travel confirmed 48h ahead.',
    freelance_vendor_name: null,
  },
  {
    name: 'Samir Khan',
    department: 'Production',
    role_name: 'Assistant Director',
    email: 'samir.khan@noholdsbarred.pictures',
    phone: '07700 900103',
    phases: 'prep,shoot',
    notes: '1st AD equivalent for this demo structure. Needs final cast and background counts locked by 16:00 each day.',
    freelance_vendor_name: null,
  },
  {
    name: 'Chloe Bennett',
    department: 'Production',
    role_name: 'Production Assistant',
    email: 'chloe.bennett@noholdsbarred.pictures',
    phone: '07700 900104',
    phases: 'shoot,wrap',
    notes: 'Supports lockups, pickups, and paperwork runs between unit base and set.',
    freelance_vendor_name: null,
  },
  {
    name: 'Daniel Hughes',
    department: 'Finance',
    role_name: 'Production Accountant',
    email: 'daniel.hughes@noholdsbarred.pictures',
    phone: '07700 900105',
    phases: 'prep,shoot,wrap,post',
    notes: 'HOD for Finance. Chases backup for all freelance invoices and wants PO references included wherever possible.',
    freelance_vendor_name: null,
  },
  {
    name: 'Olivia Turner',
    department: 'Finance',
    role_name: 'Cashier',
    email: 'olivia.turner@noholdsbarred.pictures',
    phone: '07700 900106',
    phases: 'shoot,wrap',
    notes: 'Handles floats and petty cash envelopes. Needs receipts reconciled within 24 hours.',
    freelance_vendor_name: null,
  },
  {
    name: 'Ethan Walsh',
    department: 'Locations',
    role_name: 'Locations Manager',
    email: 'ethan.walsh@noholdsbarred.pictures',
    phone: '07700 900107',
    phases: 'prep,shoot,wrap',
    notes: 'HOD for Locations. Holds permit packs and resident letters. Needs company move timings signed off by Production each evening.',
    freelance_vendor_name: null,
  },
  {
    name: 'Grace Mitchell',
    department: 'Locations',
    role_name: 'Assistant Locations Manager',
    email: 'grace.mitchell@noholdsbarred.pictures',
    phone: '07700 900108',
    phases: 'prep,shoot',
    notes: 'Coordinates parking, local notices, and site contacts. Driving own vehicle; requires parking at all key locations.',
    freelance_vendor_name: null,
  },
  {
    name: 'Ben Davies',
    department: 'Locations',
    role_name: 'Unit Manager',
    email: 'ben.davies@noholdsbarred.pictures',
    phone: '07700 900109',
    phases: 'shoot',
    notes: 'Handles unit base operations and crew meal logistics on move days.',
    freelance_vendor_name: null,
  },
  {
    name: 'Lucy Harper',
    department: 'Art',
    role_name: 'Production Designer',
    email: 'lucy.harper@noholdsbarred.pictures',
    phone: '07700 900110',
    phases: 'development,prep,shoot,wrap',
    notes: 'HOD for Art. Oversees hero bank set dressing and vault continuity. Freelance head; invoices weekly.',
    freelance_vendor_name: 'Lucy Harper Design Ltd',
  },
  {
    name: 'Noah Patel',
    department: 'Art',
    role_name: 'Set Decorator',
    email: 'noah.patel@noholdsbarred.pictures',
    phone: '07700 900111',
    phases: 'prep,shoot,wrap',
    notes: 'Coordinates construction and set dressing priorities. Wants revised dressing list after scouts.',
    freelance_vendor_name: null,
  },
  {
    name: 'Sophie Green',
    department: 'Art',
    role_name: 'Prop Master',
    email: 'sophie.green@noholdsbarred.pictures',
    phone: '07700 900112',
    phases: 'prep,shoot,wrap',
    notes: 'Tracks hero props, lockpick kit, and continuity photos. Needs overnight secure props storage.',
    freelance_vendor_name: null,
  },
  {
    name: 'Jack Cooper',
    department: 'Art',
    role_name: 'Production Buyer',
    email: 'jack.cooper@noholdsbarred.pictures',
    phone: '07700 900113',
    phases: 'prep,shoot',
    notes: 'Handles emergency buys and art petty cash. Requires card pre-approval above GBP 500.',
    freelance_vendor_name: null,
  },
  {
    name: 'Emily Scott',
    department: 'Camera',
    role_name: 'Director of Photography',
    email: 'emily.scott@noholdsbarred.pictures',
    phone: '07700 900114',
    phases: 'prep,shoot,post',
    notes: 'HOD for Camera. Freelance DoP. Sends weekly labour invoices Fridays; camera package billed separately. Wants lens charts circulated before tech scout.',
    freelance_vendor_name: 'Emily Scott Camera Ltd',
  },
  {
    name: 'Ryan Clarke',
    department: 'Camera',
    role_name: 'Camera Operator',
    email: 'ryan.clarke@noholdsbarred.pictures',
    phone: '07700 900115',
    phases: 'shoot',
    notes: 'Main unit operator. Needs early parking access on city exterior days.',
    freelance_vendor_name: null,
  },
  {
    name: 'Hannah Wood',
    department: 'Camera',
    role_name: '1st Assistant Camera',
    email: 'hannah.wood@noholdsbarred.pictures',
    phone: '07700 900116',
    phases: 'prep,shoot',
    notes: 'Focus puller. Tracks prep of primes and zooms; requests battery charging station near camera truck.',
    freelance_vendor_name: null,
  },
  {
    name: 'Tom Harrison',
    department: 'Camera',
    role_name: '2nd Assistant Camera',
    email: 'tom.harrison@noholdsbarred.pictures',
    phone: '07700 900117',
    phases: 'shoot',
    notes: 'Handles slates and camera logs. Needs cast side labels finalised before first call.',
    freelance_vendor_name: null,
  },
  {
    name: 'Mia Foster',
    department: 'Camera',
    role_name: 'Digital Imaging Technician',
    email: 'mia.foster@noholdsbarred.pictures',
    phone: '07700 900118',
    phases: 'prep,shoot,post',
    notes: 'DIT handles LUT application and backups. Remote on non-shoot prep days for workflow checks.',
    freelance_vendor_name: 'Mia Foster DIT Services',
  },
  {
    name: 'Leo Morgan',
    department: 'Lighting',
    role_name: 'Gaffer',
    email: 'leo.morgan@noholdsbarred.pictures',
    phone: '07700 900119',
    phases: 'prep,shoot,wrap',
    notes: 'HOD for Lighting. Freelance. Labour invoiced weekly. Wants generator and distro confirmed on warehouse and rooftop days.',
    freelance_vendor_name: 'Leo Morgan Lighting Services',
  },
  {
    name: 'Ruby Shaw',
    department: 'Lighting',
    role_name: 'Best Boy',
    email: 'ruby.shaw@noholdsbarred.pictures',
    phone: '07700 900120',
    phases: 'prep,shoot,wrap',
    notes: 'Tracks lamp orders and crew calls. Keeps daily power notes for de-rig days.',
    freelance_vendor_name: null,
  },
  {
    name: 'Oscar Price',
    department: 'Lighting',
    role_name: 'Spark',
    email: 'oscar.price@noholdsbarred.pictures',
    phone: '07700 900121',
    phases: 'shoot',
    notes: 'Booked more heavily on interior days and stage work. Can also cover distro support.',
    freelance_vendor_name: null,
  },
  {
    name: 'Ella Ward',
    department: 'Grip',
    role_name: 'Key Grip',
    email: 'ella.ward@noholdsbarred.pictures',
    phone: '07700 900122',
    phases: 'prep,shoot,wrap',
    notes: 'HOD for Grip. Freelance. Submits weekly labour invoice. Requires advance warning for crane or rooftop rigging days.',
    freelance_vendor_name: 'Ella Ward Grip Ltd',
  },
  {
    name: 'Harry Cox',
    department: 'Grip',
    role_name: 'Dolly Grip',
    email: 'harry.cox@noholdsbarred.pictures',
    phone: '07700 900123',
    phases: 'shoot',
    notes: 'Needed on larger tracking and bank interior movement days only.',
    freelance_vendor_name: null,
  },
  {
    name: 'Lily Richardson',
    department: 'Grip',
    role_name: 'Grip',
    email: 'lily.richardson@noholdsbarred.pictures',
    phone: '07700 900124',
    phases: 'shoot,wrap',
    notes: 'Supports rigging and track lay. Available for load-out at wrap.',
    freelance_vendor_name: null,
  },
  {
    name: 'Alfie Bailey',
    department: 'Sound',
    role_name: 'Sound Mixer',
    email: 'alfie.bailey@noholdsbarred.pictures',
    phone: '07700 900125',
    phases: 'prep,shoot,post',
    notes: 'HOD for Sound. Freelance. Weekly invoice with labour only; kit is cross-rented separately. Wants dialogue-heavy scenes flagged 24h ahead.',
    freelance_vendor_name: 'Alfie Bailey Sound',
  },
  {
    name: 'Freya Brooks',
    department: 'Sound',
    role_name: 'Boom Operator',
    email: 'freya.brooks@noholdsbarred.pictures',
    phone: '07700 900126',
    phases: 'shoot',
    notes: 'Boom op booked heavily on dialogue days; lighter coverage on montage/action days.',
    freelance_vendor_name: null,
  },
  {
    name: 'Theo Bell',
    department: 'Sound',
    role_name: 'Sound Assistant',
    email: 'theo.bell@noholdsbarred.pictures',
    phone: '07700 900127',
    phases: 'shoot,wrap',
    notes: 'Handles radio mic turnover and sound reports. Needs early access to cast holding on crowd days.',
    freelance_vendor_name: null,
  },
  {
    name: 'Evie Murphy',
    department: 'Post-Production',
    role_name: 'Editor',
    email: 'evie.murphy@noholdsbarred.pictures',
    phone: '07700 900128',
    phases: 'prep,shoot,post',
    notes: 'HOD for Post-Production. Freelance editor. Invoices in weekly post blocks. Starts during shoot for assemblies.',
    freelance_vendor_name: 'Evie Murphy Editorial',
  },
  {
    name: 'Max Griffin',
    department: 'Post-Production',
    role_name: 'Assistant Editor',
    email: 'max.griffin@noholdsbarred.pictures',
    phone: '07700 900129',
    phases: 'shoot,post',
    notes: 'Handles sync, turnovers, and media logs. Remote on some post-only days.',
    freelance_vendor_name: null,
  },
  {
    name: 'Isla Chapman',
    department: 'Post-Production',
    role_name: 'Colourist',
    email: 'isla.chapman@noholdsbarred.pictures',
    phone: '07700 900130',
    phases: 'post',
    notes: 'Booked only in post/grading block. Freelance and billed by grading block.',
    freelance_vendor_name: 'Isla Chapman Colour',
  },
]

/** Expected crew row count for singleton demo (used by backfill guard). */
export const DEMO_CREW_MEMBER_COUNT = DEMO_CREW.length

// ---------------------------------------------------------------------------
// Freelance crew labour vendors (singleton demo only). One per unique freelance_vendor_name.
// ---------------------------------------------------------------------------

const CREW_LABOUR_VENDORS: Array<{ company_name: string; primary_contact_full_name: string; primary_contact_email: string }> = [
  { company_name: 'Lucy Harper Design Ltd', primary_contact_full_name: 'Lucy Harper', primary_contact_email: 'lucy.harper@noholdsbarred.pictures' },
  { company_name: 'Emily Scott Camera Ltd', primary_contact_full_name: 'Emily Scott', primary_contact_email: 'emily.scott@noholdsbarred.pictures' },
  { company_name: 'Mia Foster DIT Services', primary_contact_full_name: 'Mia Foster', primary_contact_email: 'mia.foster@noholdsbarred.pictures' },
  { company_name: 'Leo Morgan Lighting Services', primary_contact_full_name: 'Leo Morgan', primary_contact_email: 'leo.morgan@noholdsbarred.pictures' },
  { company_name: 'Ella Ward Grip Ltd', primary_contact_full_name: 'Ella Ward', primary_contact_email: 'ella.ward@noholdsbarred.pictures' },
  { company_name: 'Alfie Bailey Sound', primary_contact_full_name: 'Alfie Bailey', primary_contact_email: 'alfie.bailey@noholdsbarred.pictures' },
  { company_name: 'Evie Murphy Editorial', primary_contact_full_name: 'Evie Murphy', primary_contact_email: 'evie.murphy@noholdsbarred.pictures' },
  { company_name: 'Isla Chapman Colour', primary_contact_full_name: 'Isla Chapman', primary_contact_email: 'isla.chapman@noholdsbarred.pictures' },
]

// ---------------------------------------------------------------------------
// Freelance crew labour invoices (singleton demo only). Varied statuses for demo.
// ---------------------------------------------------------------------------

const DEMO_CREW_LABOUR_INVOICES: Array<{
  vendor_name: string
  invoice_number: string
  issue_day_offset: number
  due_day_offset: number
  amount: number
  tax: number
  currency_code: string
  status: 'received' | 'approved' | 'paid' | 'overdue'
  notes: string
}> = [
  {
    vendor_name: 'Emily Scott Camera Ltd',
    invoice_number: 'ESC-INV-001',
    issue_day_offset: 6,
    due_day_offset: 20,
    amount: 4500,
    tax: 900,
    currency_code: 'GBP',
    status: 'paid',
    notes: 'Week 1 DoP labour invoice. Camera package excluded.',
  },
  {
    vendor_name: 'Alfie Bailey Sound',
    invoice_number: 'ABS-2401',
    issue_day_offset: 7,
    due_day_offset: 18,
    amount: 2600,
    tax: 520,
    currency_code: 'GBP',
    status: 'approved',
    notes: 'Principal photography sound labour, week 1. Kit billed separately.',
  },
  {
    vendor_name: 'Leo Morgan Lighting Services',
    invoice_number: 'LML-011',
    issue_day_offset: 10,
    due_day_offset: 17,
    amount: 2100,
    tax: 420,
    currency_code: 'GBP',
    status: 'overdue',
    notes: 'Gaffer labour for week 2 shoot block.',
  },
  {
    vendor_name: 'Ella Ward Grip Ltd',
    invoice_number: 'EWG-078',
    issue_day_offset: 9,
    due_day_offset: 21,
    amount: 1850,
    tax: 370,
    currency_code: 'GBP',
    status: 'received',
    notes: 'Grip labour invoice covering interior tracking days.',
  },
  {
    vendor_name: 'Lucy Harper Design Ltd',
    invoice_number: 'LHD-032',
    issue_day_offset: 3,
    due_day_offset: 24,
    amount: 3200,
    tax: 640,
    currency_code: 'GBP',
    status: 'paid',
    notes: 'Production design prep and early shoot oversight block.',
  },
  {
    vendor_name: 'Evie Murphy Editorial',
    invoice_number: 'EME-109',
    issue_day_offset: 14,
    due_day_offset: 28,
    amount: 2800,
    tax: 560,
    currency_code: 'GBP',
    status: 'approved',
    notes: 'Offline edit labour for assembly week 1.',
  },
  {
    vendor_name: 'Isla Chapman Colour',
    invoice_number: 'ICC-014',
    issue_day_offset: 48,
    due_day_offset: 62,
    amount: 1800,
    tax: 360,
    currency_code: 'GBP',
    status: 'received',
    notes: 'Initial grading prep and LUT session.',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate that every DEMO_CREW department/role_name exists in CREW_DEPARTMENTS. */
function validateCrewRoles(): void {
  for (const c of DEMO_CREW) {
    const def = CREW_DEPARTMENTS.find((d) => d.name === c.department)
    if (!def) throw new Error(`Demo crew: unknown department "${c.department}"`)
    if (!def.roles.includes(c.role_name)) throw new Error(`Demo crew: unknown role "${c.role_name}" in department ${c.department}`)
  }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Seed crew people, crew labour vendors (singleton only), and crew labour invoices (singleton only).
 * Run after shoot_days, seedDemoPeople, seedDemoBookings, seedDemoVendors, seedDemoVendorFinance;
 * caller must run seedDemoCrewBookings afterward for shoot-day rows.
 */
export async function seedDemoCrew(
  productionId: string,
  startDate: string,
  ts: string,
  idSource: DemoSeedIdSource,
  addDaysLocal: (yyyyMmDd: string, days: number) => string
): Promise<void> {
  validateCrewRoles()
  const db = await getDb()
  const isSingletonDemo = productionId === IDS.production

  await runInSerializedTransaction(async () => {
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]

    // 1) Crew people — one multi-row INSERT (far fewer statements for sqlx vs 30× single INSERT)
    {
      const valueParts: string[] = []
      const bindValues: unknown[] = []
      let p = 1
      for (let i = 0; i < DEMO_CREW.length; i++) {
        const c = DEMO_CREW[i]!
        const personId = idSource.person(14 + i + 1)
        valueParts.push(
          `($${p}, $${p + 1}, $${p + 2}, 0, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, 'not_requested', $${p + 9}, $${p + 10})`
        )
        p += 11
        bindValues.push(
          personId,
          productionId,
          c.name,
          c.email,
          c.phone,
          c.department,
          c.role_name,
          c.phases,
          c.notes,
          ts,
          ts
        )
      }
      statements.push({
        sql: `INSERT INTO ${TABLE_PEOPLE} (id, production_id, name, is_cast, email, phone, department, role_name, phases, notes, contributor_form_status, created_at, updated_at) VALUES ${valueParts.join(', ')}`,
        bindValues,
      })
    }

    // 2) Crew labour vendors (singleton demo only)
    if (isSingletonDemo) {
      {
        const valueParts: string[] = []
        const bindValues: unknown[] = []
        let p = 1
        for (let v = 0; v < CREW_LABOUR_VENDORS.length; v++) {
          const vd = CREW_LABOUR_VENDORS[v]!
          const vendorId = IDS.crewVendor(v + 1)
          valueParts.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, NULL)`)
          p += 7
          bindValues.push(vendorId, productionId, vd.company_name, vd.primary_contact_full_name, vd.primary_contact_email, ts, ts)
        }
        statements.push({
          sql: `INSERT INTO ${TABLE_VENDORS} (id, production_id, company_name, primary_contact_full_name, primary_contact_email, created_at, updated_at, deleted_at) VALUES ${valueParts.join(', ')}`,
          bindValues,
        })
      }

      // 3) Crew labour invoices (singleton demo only)
      const vendorIdByCompany = new Map<string, string>()
      for (let v = 0; v < CREW_LABOUR_VENDORS.length; v++) {
        vendorIdByCompany.set(CREW_LABOUR_VENDORS[v]!.company_name, IDS.crewVendor(v + 1))
      }
      {
        const valueParts: string[] = []
        const bindValues: unknown[] = []
        let p = 1
        for (let inv = 0; inv < DEMO_CREW_LABOUR_INVOICES.length; inv++) {
          const invd = DEMO_CREW_LABOUR_INVOICES[inv]!
          const vendorId = vendorIdByCompany.get(invd.vendor_name)
          if (!vendorId) throw new Error(`Demo crew: vendor not found for ${invd.vendor_name}`)
          const invoiceId = IDS.crewVendorInvoice(inv + 1)
          valueParts.push(
            `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}, $${p + 10}, $${p + 11}, $${p + 12})`
          )
          p += 13
          bindValues.push(
            invoiceId,
            productionId,
            vendorId,
            invd.invoice_number,
            addDaysLocal(startDate, invd.issue_day_offset),
            addDaysLocal(startDate, invd.due_day_offset),
            invd.amount,
            invd.tax,
            invd.currency_code,
            invd.status,
            invd.notes,
            ts,
            ts
          )
        }
        statements.push({
          sql: `INSERT INTO ${TABLE_INVOICES} (id, production_id, vendor_id, invoice_number, issue_date, due_date, amount, tax, currency_code, status, notes, created_at, updated_at) VALUES ${valueParts.join(', ')}`,
          bindValues,
        })
      }

      // 4) Invoice reminder tasks — one multi-row INSERT; no outbox (demo-only; smaller batch, less queue blocking)
      // IDs use crewLabourInvoiceReminderTask (8350+) — not invoiceReminderTask(16+) which overlaps equipmentReminderTask (8200+n = 8220+m for n=m+20)
      {
        const valueParts: string[] = []
        const bindValues: unknown[] = []
        let p = 1
        for (let inv = 0; inv < DEMO_CREW_LABOUR_INVOICES.length; inv++) {
          const invd = DEMO_CREW_LABOUR_INVOICES[inv]!
          const dueDate = addDaysLocal(startDate, invd.due_day_offset)
          const taskId = IDS.crewLabourInvoiceReminderTask(inv + 1)
          valueParts.push(
            `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}, $${p + 10}, $${p + 11}, $${p + 12}, $${p + 13})`
          )
          p += 14
          bindValues.push(
            taskId,
            productionId,
            `Pay invoice ${invd.invoice_number} — ${invd.vendor_name}`,
            invd.status === 'paid' ? 1 : 0,
            null,
            dueDate,
            INVOICE_REMINDER_DEPARTMENT,
            null,
            null,
            null,
            IDS.crewVendorInvoice(inv + 1),
            null,
            ts,
            ts
          )
        }
        statements.push({
          sql: `INSERT INTO ${TABLE_TASKS} (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, parent_task_id, section_id, vendor_invoice_id, equipment_id, created_at, updated_at) VALUES ${valueParts.join(', ')}`,
          bindValues,
        })
      }
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
