/**
 * Rich demo Crew seed for the singleton demo production.
 * Seeds: crew people (is_cast=0), crew bookings, freelance crew labour vendors,
 * and freelance crew labour invoices. Deterministic and demo-only.
 *
 * - Source: DEMO_CREW and DEMO_CREW_LABOUR_INVOICES below (production-realistic).
 * - HODs: Line Producer (Production), Production Accountant (Finance), Locations Manager,
 *   Production Designer (Art), Director of Photography (Camera), Gaffer (Lighting),
 *   Key Grip (Grip), Sound Mixer (Sound). Editor/Colourist represent post; Post-Production
 *   Supervisor not in this dataset.
 * - Bookings: heavy full-shoot for HODs and core floor crew (days 1–12); moderate for
 *   PA, Cashier, ALM, Set Decorator, Prop Master, Best Boy, Grip, Sound Assistant, DIT;
 *   selective for Production Buyer, Dolly Grip, Spark, Unit Manager; Editor/Assistant Editor
 *   late shoot overlap (10–12); Colourist zero shoot-day bookings (phases/notes only).
 * - Freelance invoice demos: crew with freelance_vendor_name get a vendor record and
 *   entries in DEMO_CREW_LABOUR_INVOICES show paid/received/approved/overdue variety.
 *
 * Call after: shoot_days, seedDemoPeople (cast), seedDemoBookings (cast), seedDemoVendors,
 * seedDemoBudget, seedDemoVendorFinance.
 */

import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import { buildCreateTaskStatements } from '../repositories/tasks'
import { CREW_DEPARTMENTS } from '@/lib/people/crewDepartments'
import type { CrewDepartmentName } from '@/lib/people/crewDepartments'
import { IDS } from './constants'
import type { DemoSeedIdSource } from './demoSeedContext'

const TABLE_PEOPLE = 'people'
const TABLE_BOOKINGS = 'bookings'
const TABLE_VENDORS = 'vendors'
const TABLE_INVOICES = 'vendor_invoices'
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
  /** Shoot day numbers (1–12) this person is booked. Empty = no shoot-day bookings (e.g. Colourist). */
  days: number[]
  /** If set, this crew has a labour vendor (freelance-style); vendor record created in seed. */
  freelance_vendor_name?: string | null
}

/** All shoot days 1–12. */
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
/** Late shoot overlap for post crew (Editor, Assistant Editor). */
const LATE_SHOOT_DAYS = [10, 11, 12] as const

const DEMO_CREW: DemoCrewDef[] = [
  {
    name: 'Sarah Kim',
    department: 'Production',
    role_name: 'Line Producer',
    email: 'sarah.kim@mintheist-demo.com',
    phone: '07700 910101',
    phases: 'prep,shoot,wrap,post',
    notes: 'HOD for Production. Oversees overall spend approvals and crew turnover. Wants daily cost reports by 20:00.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Nick Palmer',
    department: 'Production',
    role_name: 'Production Coordinator',
    email: 'nick.palmer@mintheist-demo.com',
    phone: '07700 910102',
    phases: 'prep,shoot,wrap',
    notes: 'Tracks crew paperwork, unit moves, and day-before call sheet circulation. Needs cast travel confirmed 48h ahead.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Amelia Ross',
    department: 'Production',
    role_name: 'Assistant Director',
    email: 'amelia.ross@mintheist-demo.com',
    phone: '07700 910103',
    phases: 'prep,shoot',
    notes: '1st AD equivalent for this demo structure. Needs final cast and background counts locked by 16:00 each day.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Jordan Pike',
    department: 'Production',
    role_name: 'Production Assistant',
    email: 'jordan.pike@mintheist-demo.com',
    phone: '07700 910104',
    phases: 'shoot,wrap',
    notes: 'Supports lockups, pickups, and paperwork runs between unit base and set.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    freelance_vendor_name: null,
  },
  {
    name: 'Maya Desai',
    department: 'Finance',
    role_name: 'Production Accountant',
    email: 'maya.desai@mintheist-demo.com',
    phone: '07700 910201',
    phases: 'prep,shoot,wrap,post',
    notes: 'HOD for Finance. Chases backup for all freelance invoices and wants PO references included wherever possible.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Connor Wells',
    department: 'Finance',
    role_name: 'Cashier',
    email: 'connor.wells@mintheist-demo.com',
    phone: '07700 910202',
    phases: 'shoot,wrap',
    notes: 'Handles floats and petty cash envelopes. Needs receipts reconciled within 24 hours.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    freelance_vendor_name: null,
  },
  {
    name: 'Oliver Grant',
    department: 'Locations',
    role_name: 'Locations Manager',
    email: 'oliver.grant@mintheist-demo.com',
    phone: '07700 910301',
    phases: 'prep,shoot,wrap',
    notes: 'HOD for Locations. Holds permit packs and resident letters. Needs company move timings signed off by Production each evening.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Beth Carter',
    department: 'Locations',
    role_name: 'Assistant Locations Manager',
    email: 'beth.carter@mintheist-demo.com',
    phone: '07700 910302',
    phases: 'prep,shoot',
    notes: 'Coordinates parking, local notices, and site contacts. Driving own vehicle; requires parking at all key locations.',
    days: [1, 2, 3, 4, 5, 6, 8, 10, 12],
    freelance_vendor_name: null,
  },
  {
    name: 'Ryan Moss',
    department: 'Locations',
    role_name: 'Unit Manager',
    email: 'ryan.moss@mintheist-demo.com',
    phone: '07700 910303',
    phases: 'shoot',
    notes: 'Handles unit base operations and crew meal logistics on move days.',
    days: [2, 4, 6, 8, 10],
    freelance_vendor_name: null,
  },
  {
    name: 'Elena Vasquez',
    department: 'Art',
    role_name: 'Production Designer',
    email: 'elena.vasquez@mintheist-demo.com',
    phone: '07700 910401',
    phases: 'development,prep,shoot,wrap',
    notes: 'HOD for Art. Oversees hero bank set dressing and vault continuity. Freelance head; invoices weekly.',
    days: [...ALL_DAYS],
    freelance_vendor_name: 'Elena Vasquez Design Ltd',
  },
  {
    name: 'Marcus Leigh',
    department: 'Art',
    role_name: 'Set Decorator',
    email: 'marcus.leigh@mintheist-demo.com',
    phone: '07700 910402',
    phases: 'prep,shoot,wrap',
    notes: 'Coordinates construction and set dressing priorities. Wants revised dressing list after scouts.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    freelance_vendor_name: null,
  },
  {
    name: 'Nina Ford',
    department: 'Art',
    role_name: 'Prop Master',
    email: 'nina.ford@mintheist-demo.com',
    phone: '07700 910403',
    phases: 'prep,shoot,wrap',
    notes: 'Tracks hero props, lockpick kit, and continuity photos. Needs overnight secure props storage.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    freelance_vendor_name: null,
  },
  {
    name: 'Jamie Cole',
    department: 'Art',
    role_name: 'Production Buyer',
    email: 'jamie.cole@mintheist-demo.com',
    phone: '07700 910404',
    phases: 'prep,shoot',
    notes: 'Handles emergency buys and art petty cash. Requires card pre-approval above GBP 500.',
    days: [1, 3, 5, 7, 9],
    freelance_vendor_name: null,
  },
  {
    name: 'David Chen',
    department: 'Camera',
    role_name: 'Director of Photography',
    email: 'david.chen@mintheist-demo.com',
    phone: '07700 910501',
    phases: 'prep,shoot,post',
    notes: 'HOD for Camera. Freelance DoP. Sends weekly labour invoices Fridays; camera package billed separately. Wants lens charts circulated before tech scout.',
    days: [...ALL_DAYS],
    freelance_vendor_name: 'David Chen Camera Ltd',
  },
  {
    name: 'Leah Byrne',
    department: 'Camera',
    role_name: 'Camera Operator',
    email: 'leah.byrne@mintheist-demo.com',
    phone: '07700 910502',
    phases: 'shoot',
    notes: 'Main unit operator. Needs early parking access on city exterior days.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Tom Sato',
    department: 'Camera',
    role_name: '1st Assistant Camera',
    email: 'tom.sato@mintheist-demo.com',
    phone: '07700 910503',
    phases: 'prep,shoot',
    notes: 'Focus puller. Tracks prep of primes and zooms; requests battery charging station near camera truck.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Priya Long',
    department: 'Camera',
    role_name: '2nd Assistant Camera',
    email: 'priya.long@mintheist-demo.com',
    phone: '07700 910504',
    phases: 'shoot',
    notes: 'Handles slates and camera logs. Needs cast side labels finalised before first call.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Aaron West',
    department: 'Camera',
    role_name: 'Digital Imaging Technician',
    email: 'aaron.west@mintheist-demo.com',
    phone: '07700 910505',
    phases: 'prep,shoot,post',
    notes: 'DIT handles LUT application and backups. Remote on non-shoot prep days for workflow checks.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    freelance_vendor_name: 'Aaron West DIT Services',
  },
  {
    name: 'Mike Torres',
    department: 'Lighting',
    role_name: 'Gaffer',
    email: 'mike.torres@mintheist-demo.com',
    phone: '07700 910601',
    phases: 'prep,shoot,wrap',
    notes: 'HOD for Lighting. Freelance. Labour invoiced weekly. Wants generator and distro confirmed on warehouse and rooftop days.',
    days: [...ALL_DAYS],
    freelance_vendor_name: 'Mike Torres Lighting Services',
  },
  {
    name: 'Callum Price',
    department: 'Lighting',
    role_name: 'Best Boy',
    email: 'callum.price@mintheist-demo.com',
    phone: '07700 910602',
    phases: 'prep,shoot,wrap',
    notes: 'Tracks lamp orders and crew calls. Keeps daily power notes for de-rig days.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    freelance_vendor_name: null,
  },
  {
    name: 'Jasmeen Gill',
    department: 'Lighting',
    role_name: 'Spark',
    email: 'jasmeen.gill@mintheist-demo.com',
    phone: '07700 910603',
    phases: 'shoot',
    notes: 'Booked more heavily on interior days and stage work. Can also cover distro support.',
    days: [1, 3, 5, 6, 8, 9, 11],
    freelance_vendor_name: null,
  },
  {
    name: 'Chris Walsh',
    department: 'Grip',
    role_name: 'Key Grip',
    email: 'chris.walsh@mintheist-demo.com',
    phone: '07700 910701',
    phases: 'prep,shoot,wrap',
    notes: 'HOD for Grip. Freelance. Submits weekly labour invoice. Requires advance warning for crane or rooftop rigging days.',
    days: [...ALL_DAYS],
    freelance_vendor_name: 'Chris Walsh Grip Ltd',
  },
  {
    name: 'Peter Logan',
    department: 'Grip',
    role_name: 'Dolly Grip',
    email: 'peter.logan@mintheist-demo.com',
    phone: '07700 910702',
    phases: 'shoot',
    notes: 'Needed on larger tracking and bank interior movement days only.',
    days: [2, 4, 6, 8, 10, 12],
    freelance_vendor_name: null,
  },
  {
    name: 'Holly Dean',
    department: 'Grip',
    role_name: 'Grip',
    email: 'holly.dean@mintheist-demo.com',
    phone: '07700 910703',
    phases: 'shoot,wrap',
    notes: 'Supports rigging and track lay. Available for load-out at wrap.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    freelance_vendor_name: null,
  },
  {
    name: 'Anna Petrov',
    department: 'Sound',
    role_name: 'Sound Mixer',
    email: 'anna.petrov@mintheist-demo.com',
    phone: '07700 910801',
    phases: 'prep,shoot,post',
    notes: 'HOD for Sound. Freelance. Weekly invoice with labour only; kit is cross-rented separately. Wants dialogue-heavy scenes flagged 24h ahead.',
    days: [...ALL_DAYS],
    freelance_vendor_name: 'Anna Petrov Sound',
  },
  {
    name: 'Luke Warren',
    department: 'Sound',
    role_name: 'Boom Operator',
    email: 'luke.warren@mintheist-demo.com',
    phone: '07700 910802',
    phases: 'shoot',
    notes: 'Boom op booked heavily on dialogue days; lighter coverage on montage/action days.',
    days: [...ALL_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Megan Holt',
    department: 'Sound',
    role_name: 'Sound Assistant',
    email: 'megan.holt@mintheist-demo.com',
    phone: '07700 910803',
    phases: 'shoot,wrap',
    notes: 'Handles radio mic turnover and sound reports. Needs early access to cast holding on crowd days.',
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    freelance_vendor_name: null,
  },
  {
    name: 'Luke Hayes',
    department: 'Post-Production',
    role_name: 'Editor',
    email: 'luke.hayes@mintheist-demo.com',
    phone: '07700 910901',
    phases: 'prep,shoot,post',
    notes: 'HOD for Post-Production. Freelance editor. Invoices in weekly post blocks. Starts during shoot for assemblies.',
    days: [...LATE_SHOOT_DAYS],
    freelance_vendor_name: 'Luke Hayes Editorial',
  },
  {
    name: 'Rachel Muir',
    department: 'Post-Production',
    role_name: 'Assistant Editor',
    email: 'rachel.muir@mintheist-demo.com',
    phone: '07700 910902',
    phases: 'shoot,post',
    notes: 'Handles sync, turnovers, and media logs. Remote on some post-only days.',
    days: [...LATE_SHOOT_DAYS],
    freelance_vendor_name: null,
  },
  {
    name: 'Noah Keane',
    department: 'Post-Production',
    role_name: 'Colourist',
    email: 'noah.keane@mintheist-demo.com',
    phone: '07700 910903',
    phases: 'post',
    notes: 'Booked only in post/grading block. Freelance and billed by grading block.',
    days: [],
    freelance_vendor_name: 'Noah Keane Colour',
  },
]

// ---------------------------------------------------------------------------
// Freelance crew labour vendors (singleton demo only). One per unique freelance_vendor_name.
// ---------------------------------------------------------------------------

const CREW_LABOUR_VENDORS: Array<{ company_name: string; primary_contact_full_name: string; primary_contact_email: string }> = [
  { company_name: 'Elena Vasquez Design Ltd', primary_contact_full_name: 'Elena Vasquez', primary_contact_email: 'elena.vasquez@mintheist-demo.com' },
  { company_name: 'David Chen Camera Ltd', primary_contact_full_name: 'David Chen', primary_contact_email: 'david.chen@mintheist-demo.com' },
  { company_name: 'Aaron West DIT Services', primary_contact_full_name: 'Aaron West', primary_contact_email: 'aaron.west@mintheist-demo.com' },
  { company_name: 'Mike Torres Lighting Services', primary_contact_full_name: 'Mike Torres', primary_contact_email: 'mike.torres@mintheist-demo.com' },
  { company_name: 'Chris Walsh Grip Ltd', primary_contact_full_name: 'Chris Walsh', primary_contact_email: 'chris.walsh@mintheist-demo.com' },
  { company_name: 'Anna Petrov Sound', primary_contact_full_name: 'Anna Petrov', primary_contact_email: 'anna.petrov@mintheist-demo.com' },
  { company_name: 'Luke Hayes Editorial', primary_contact_full_name: 'Luke Hayes', primary_contact_email: 'luke.hayes@mintheist-demo.com' },
  { company_name: 'Noah Keane Colour', primary_contact_full_name: 'Noah Keane', primary_contact_email: 'noah.keane@mintheist-demo.com' },
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
    vendor_name: 'David Chen Camera Ltd',
    invoice_number: 'DC-INV-001',
    issue_day_offset: 6,
    due_day_offset: 20,
    amount: 4500,
    tax: 900,
    currency_code: 'GBP',
    status: 'paid',
    notes: 'Week 1 DoP labour invoice. Camera package excluded.',
  },
  {
    vendor_name: 'Anna Petrov Sound',
    invoice_number: 'APS-2401',
    issue_day_offset: 7,
    due_day_offset: 18,
    amount: 2600,
    tax: 520,
    currency_code: 'GBP',
    status: 'approved',
    notes: 'Principal photography sound labour, week 1. Kit billed separately.',
  },
  {
    vendor_name: 'Mike Torres Lighting Services',
    invoice_number: 'MTL-011',
    issue_day_offset: 10,
    due_day_offset: 17,
    amount: 2100,
    tax: 420,
    currency_code: 'GBP',
    status: 'overdue',
    notes: 'Gaffer labour for week 2 shoot block.',
  },
  {
    vendor_name: 'Chris Walsh Grip Ltd',
    invoice_number: 'CWG-078',
    issue_day_offset: 9,
    due_day_offset: 21,
    amount: 1850,
    tax: 370,
    currency_code: 'GBP',
    status: 'received',
    notes: 'Grip labour invoice covering interior tracking days.',
  },
  {
    vendor_name: 'Elena Vasquez Design Ltd',
    invoice_number: 'EVD-032',
    issue_day_offset: 3,
    due_day_offset: 24,
    amount: 3200,
    tax: 640,
    currency_code: 'GBP',
    status: 'paid',
    notes: 'Production design prep and early shoot oversight block.',
  },
  {
    vendor_name: 'Luke Hayes Editorial',
    invoice_number: 'LHE-109',
    issue_day_offset: 14,
    due_day_offset: 28,
    amount: 2800,
    tax: 560,
    currency_code: 'GBP',
    status: 'approved',
    notes: 'Offline edit labour for assembly week 1.',
  },
  {
    vendor_name: 'Noah Keane Colour',
    invoice_number: 'NKC-014',
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
 * Seed crew people, crew bookings, crew labour vendors (singleton only), and crew labour invoices (singleton only).
 * Run after shoot_days, seedDemoPeople, seedDemoBookings, seedDemoVendors, seedDemoVendorFinance.
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

    // 1) Crew people: person(15) .. person(14 + DEMO_CREW.length); is_cast=0
    for (let i = 0; i < DEMO_CREW.length; i++) {
      const c = DEMO_CREW[i]!
      const personId = idSource.person(14 + i + 1)
      statements.push({
        sql: `INSERT INTO ${TABLE_PEOPLE} (id, production_id, name, is_cast, email, phone, department, role_name, phases, notes, contributor_form_status, created_at, updated_at)
         VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, 'not_requested', $10, $11)`,
        bindValues: [
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
          ts,
        ],
      })
    }

    // 2) Crew bookings: one row per (person, shoot_day); booking.role = role_name
    let crewBookingIdx = 0
    for (let i = 0; i < DEMO_CREW.length; i++) {
      const c = DEMO_CREW[i]!
      const personId = idSource.person(14 + i + 1)
      for (const dayNum of c.days) {
        const shootDayId = idSource.shootDay(dayNum)
        const shootDate = addDaysLocal(startDate, dayNum - 1)
        const bookingId = idSource.crewBooking(crewBookingIdx + 1)
        crewBookingIdx++
        statements.push({
          sql: `INSERT INTO ${TABLE_BOOKINGS} (id, production_id, person_id, shoot_day_id, start_date, end_date, role, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          bindValues: [
            bookingId,
            productionId,
            personId,
            shootDayId,
            shootDate,
            shootDate,
            c.role_name,
            null,
            ts,
            ts,
          ],
        })
      }
    }

    // 3) Crew labour vendors (singleton demo only)
    if (isSingletonDemo) {
      for (let v = 0; v < CREW_LABOUR_VENDORS.length; v++) {
        const vd = CREW_LABOUR_VENDORS[v]!
        const vendorId = IDS.crewVendor(v + 1)
        statements.push({
          sql: `INSERT INTO ${TABLE_VENDORS} (id, production_id, company_name, primary_contact_full_name, primary_contact_email, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
          bindValues: [vendorId, productionId, vd.company_name, vd.primary_contact_full_name, vd.primary_contact_email, ts, ts],
        })
      }

      // 4) Crew labour invoices (singleton demo only)
      const vendorIdByCompany = new Map<string, string>()
      for (let v = 0; v < CREW_LABOUR_VENDORS.length; v++) {
        vendorIdByCompany.set(CREW_LABOUR_VENDORS[v]!.company_name, IDS.crewVendor(v + 1))
      }
      for (let inv = 0; inv < DEMO_CREW_LABOUR_INVOICES.length; inv++) {
        const invd = DEMO_CREW_LABOUR_INVOICES[inv]!
        const vendorId = vendorIdByCompany.get(invd.vendor_name)
        if (!vendorId) throw new Error(`Demo crew: vendor not found for ${invd.vendor_name}`)
        const invoiceId = IDS.crewVendorInvoice(inv + 1)
        statements.push({
          sql: `INSERT INTO ${TABLE_INVOICES} (id, production_id, vendor_id, invoice_number, issue_date, due_date, amount, tax, currency_code, status, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          bindValues: [
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
            ts,
          ],
        })
      }

      // 5) Invoice reminder tasks for crew labour invoices (singleton demo only)
      const existingInvoiceTaskCount = 15 // from demoVendorFinanceSeed
      for (let inv = 0; inv < DEMO_CREW_LABOUR_INVOICES.length; inv++) {
        const invd = DEMO_CREW_LABOUR_INVOICES[inv]!
        const dueDate = addDaysLocal(startDate, invd.due_day_offset)
        const taskId = IDS.invoiceReminderTask(existingInvoiceTaskCount + inv + 1)
        const taskStatements = buildCreateTaskStatements(
          taskId,
          {
            production_id: productionId,
            description: `Pay invoice ${invd.invoice_number} — ${invd.vendor_name}`,
            due_date: dueDate,
            assigned_department: INVOICE_REMINDER_DEPARTMENT,
            vendor_invoice_id: IDS.crewVendorInvoice(inv + 1),
            is_complete: invd.status === 'paid' ? 1 : 0,
          },
          ts
        )
        statements.push(...taskStatements)
      }
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
