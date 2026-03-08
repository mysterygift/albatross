/**
 * Rich demo Crew seed. Used for the singleton demo production only.
 * Seeds: crew people (is_cast=0) with department/role_name from CREW_DEPARTMENTS,
 * phases, notes; crew bookings across shoot days; optional crew labour vendors
 * and invoices for freelance-style crew. Deterministic and demo-only.
 *
 * - HODs: every major department has an HOD; role_name matches crew hierarchy.
 * - Bookings: realistic distribution (HODs/core on most days; post on later days; specialists when needed).
 * - Freelance subset: DoP, Sound Mixer, Gaffer, Key Grip, Production Designer, Editor get vendor + invoice.
 * - Invoice statuses: mix of received, approved, paid, overdue for demo workflow.
 *
 * Call after: shoot_days, seedDemoPeople (cast), seedDemoBookings (cast), seedDemoVendors, seedDemoBudget, seedDemoVendorFinance.
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

/** Single crew member seed definition. department/role_name must match CREW_DEPARTMENTS. */
type DemoCrewDef = {
  name: string
  email: string
  phone: string
  department: CrewDepartmentName
  role_name: string
  phases: string | null
  notes: string
  /** Shoot day numbers (1–12) this person is booked. */
  days: number[]
  /** If set, this crew has a labour vendor and invoice (freelance-style). */
  vendorCompanyName?: string
}

/** All shoot days 1–12. */
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
/** First six shoot days. */
const FIRST_HALF = [1, 2, 3, 4, 5, 6] as const
/** Last six shoot days. */
const SECOND_HALF = [7, 8, 9, 10, 11, 12] as const
/** Post-heavy: later in schedule. */
const POST_DAYS = [5, 6, 7, 8, 9, 10, 11, 12] as const

/** Deterministic demo crew: HOD + additional roles per department; valid department/role_name; useful notes; booking days. */
const DEMO_CREW: DemoCrewDef[] = [
  // Development
  { name: 'Rebecca Shaw', email: 'rebecca.shaw@mintheist-demo.com', phone: '07700 900201', department: 'Development', role_name: 'Producer', phases: 'development,prep', notes: 'HOD Development. Available from prep week; sign-off required for script changes.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'James Foley', email: 'james.foley@mintheist-demo.com', phone: '07700 900202', department: 'Development', role_name: 'Director', phases: 'prep,shoot', notes: 'Director. Block rehearsals week before shoot; prefers permit packs printed day before company move.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Sienna Webb', email: 'sienna.webb@mintheist-demo.com', phone: '07700 900203', department: 'Development', role_name: 'Script Editor', phases: 'development,prep,shoot', notes: 'Script continuity. On set for dialogue-heavy days only; remote on other days.', days: [1, 2, 4, 6, 8, 10, 12], vendorCompanyName: undefined },
  // Production
  { name: 'Sarah Kim', email: 'sarah.kim@mintheist-demo.com', phone: '07700 900213', department: 'Production', role_name: 'Line Producer', phases: 'prep,shoot,wrap', notes: 'HOD Production. Drives own vehicle; needs parking at unit base. Final sign-off on overtime.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Nick Palmer', email: 'nick.palmer@mintheist-demo.com', phone: '07700 900214', department: 'Production', role_name: 'Production Coordinator', phases: 'prep,shoot,wrap', notes: 'Production Coordinator. Call sheets and unit moves; permit packs printed the day before company moves.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Marcus Webb', email: 'marcus.webb@mintheist-demo.com', phone: '07700 900215', department: 'Production', role_name: 'Assistant Director', phases: 'prep,shoot', notes: '1st AD. Early call on exterior days; turnaround and split-day caveats in call sheet.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Jenny Cole', email: 'jenny.cole@mintheist-demo.com', phone: '07700 900216', department: 'Production', role_name: 'Production Manager', phases: 'prep,shoot', notes: 'PM. Invoice and payment handling via production office; weekly cost reports.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Tom Reid', email: 'tom.reid@mintheist-demo.com', phone: '07700 900217', department: 'Production', role_name: 'Production Assistant', phases: 'shoot', notes: 'Floor PA. Driving own vehicle; needs parking at unit base.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Zara Moss', email: 'zara.moss@mintheist-demo.com', phone: '07700 900218', department: 'Production', role_name: 'Floor Runner', phases: 'shoot', notes: 'Runner. Accommodation not required; local.', days: [...FIRST_HALF, 8, 9, 10], vendorCompanyName: undefined },
  // Finance
  { name: 'Helen Price', email: 'helen.price@mintheist-demo.com', phone: '07700 900219', department: 'Finance', role_name: 'Production Accountant', phases: 'prep,shoot,wrap', notes: 'HOD Finance. Invoice approval and payment runs; freelance labour invoices paid net 14 unless agreed otherwise.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Dan Wells', email: 'dan.wells@mintheist-demo.com', phone: '07700 900220', department: 'Finance', role_name: 'Cashier', phases: 'shoot', notes: 'Petty cash and daily floats; receipts required.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  // Locations
  { name: 'Oliver Grant', email: 'oliver.grant@mintheist-demo.com', phone: '07700 900211', department: 'Locations', role_name: 'Locations Manager', phases: 'prep,shoot,wrap', notes: 'HOD Locations. Requires permit packs printed the day before company moves. Driving own vehicle; parking at unit base.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Leah Fox', email: 'leah.fox@mintheist-demo.com', phone: '07700 900221', department: 'Locations', role_name: 'Unit Manager', phases: 'shoot', notes: 'Unit base and moves; tech recce support.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Jake Holt', email: 'jake.holt@mintheist-demo.com', phone: '07700 900222', department: 'Locations', role_name: 'Assistant Locations Manager', phases: 'prep,shoot', notes: 'Location recces and prep; on set for company moves.', days: [1, 2, 3, 4, 5, 6, 8, 10, 12], vendorCompanyName: undefined },
  // Art
  { name: 'Elena Vasquez', email: 'elena.vasquez@mintheist-demo.com', phone: '07700 900208', department: 'Art', role_name: 'Production Designer', phases: 'prep,shoot,wrap', notes: 'HOD Art. Freelance; sends weekly invoice on Fridays. Art department prep from prep week.', days: [...ALL_DAYS], vendorCompanyName: 'Elena Vasquez Design Ltd' },
  { name: 'Fiona Reid', email: 'fiona.reid@mintheist-demo.com', phone: '07700 900209', department: 'Art', role_name: 'Costume Designer', phases: 'prep,shoot', notes: 'Costume fittings in prep; on set for principal costume days. Kit and rental invoiced separately.', days: [1, 2, 3, 5, 7, 9, 11], vendorCompanyName: undefined },
  { name: 'Paul Dunn', email: 'paul.dunn@mintheist-demo.com', phone: '07700 900223', department: 'Art', role_name: 'Set Decorator', phases: 'prep,shoot', notes: 'Set dressing and dressing crew; prep week for key sets.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Kate Morrison', email: 'kate.morrison@mintheist-demo.com', phone: '07700 900210', department: 'Art', role_name: 'Hair and Make Up Designer', phases: 'prep,shoot', notes: 'HOD Hair & Make-up. Principal makeup tests in prep; kit invoiced separately from labour.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Sam Bell', email: 'sam.bell@mintheist-demo.com', phone: '07700 900224', department: 'Art', role_name: 'Prop Master', phases: 'prep,shoot', notes: 'Props and action vehicles; permit and insurance for special items.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  // Camera
  { name: 'David Chen', email: 'david.chen@mintheist-demo.com', phone: '07700 900204', department: 'Camera', role_name: 'Director of Photography', phases: 'prep,shoot', notes: 'Freelance DoP. Sends weekly invoice on Fridays; camera package invoiced separately.', days: [...ALL_DAYS], vendorCompanyName: 'David Chen Camera Ltd' },
  { name: 'Maya Singh', email: 'maya.singh@mintheist-demo.com', phone: '07700 900225', department: 'Camera', role_name: 'Camera Operator', phases: 'shoot', notes: 'Operator. Booked principal block; driving own vehicle.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Omar Khan', email: 'omar.khan@mintheist-demo.com', phone: '07700 900226', department: 'Camera', role_name: '1st Assistant Camera', phases: 'shoot', notes: 'Focus puller. Kit ownership note: lenses checked daily.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Jess Lowe', email: 'jess.lowe@mintheist-demo.com', phone: '07700 900227', department: 'Camera', role_name: '2nd Assistant Camera', phases: 'shoot', notes: 'Clapper loader. Film load days only when applicable.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Ryan Blake', email: 'ryan.blake@mintheist-demo.com', phone: '07700 900228', department: 'Camera', role_name: 'Digital Imaging Technician', phases: 'shoot', notes: 'DIT. On set all principal days; data wrangling and LUTs.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  // Lighting
  { name: 'Mike Torres', email: 'mike.torres@mintheist-demo.com', phone: '07700 900206', department: 'Lighting', role_name: 'Gaffer', phases: 'shoot', notes: 'Freelance gaffer. Weekly labour invoice; lighting package and distro invoiced separately.', days: [...ALL_DAYS], vendorCompanyName: 'Mike Torres Lighting Services' },
  { name: 'Ash Patel', email: 'ash.patel@mintheist-demo.com', phone: '07700 900229', department: 'Lighting', role_name: 'Best Boy', phases: 'shoot', notes: 'Best boy electric. Rigging and unit base power.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Lou Green', email: 'lou.green@mintheist-demo.com', phone: '07700 900230', department: 'Lighting', role_name: 'Spark', phases: 'shoot', notes: 'Spark. Booked principal block.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Noah Hill', email: 'noah.hill@mintheist-demo.com', phone: '07700 900231', department: 'Lighting', role_name: 'Spark', phases: 'shoot', notes: 'Second spark. Days 1–8 only; other commitment from day 9.', days: [1, 2, 3, 4, 5, 6, 7, 8], vendorCompanyName: undefined },
  // Grip
  { name: 'Chris Walsh', email: 'chris.walsh@mintheist-demo.com', phone: '07700 900207', department: 'Grip', role_name: 'Key Grip', phases: 'shoot', notes: 'Freelance key grip. Labour invoice weekly; grip package separate.', days: [...ALL_DAYS], vendorCompanyName: 'Chris Walsh Grip Ltd' },
  { name: 'Eve Cross', email: 'eve.cross@mintheist-demo.com', phone: '07700 900232', department: 'Grip', role_name: 'Best Boy Grip', phases: 'shoot', notes: 'Best boy grip. Rigging and crane days.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  { name: 'Theo Marsh', email: 'theo.marsh@mintheist-demo.com', phone: '07700 900233', department: 'Grip', role_name: 'Dolly Grip', phases: 'shoot', notes: 'Dolly grip. Booked on dolly and tracking days only.', days: [2, 4, 6, 8, 10, 12], vendorCompanyName: undefined },
  // Sound
  { name: 'Anna Petrov', email: 'anna.petrov@mintheist-demo.com', phone: '07700 900205', department: 'Sound', role_name: 'Sound Mixer', phases: 'shoot', notes: 'Freelance sound mixer. Sends invoice per block; boom op only booked on dialogue-heavy days.', days: [...ALL_DAYS], vendorCompanyName: 'Anna Petrov Sound' },
  { name: 'Jay Kumar', email: 'jay.kumar@mintheist-demo.com', phone: '07700 900234', department: 'Sound', role_name: 'Boom Operator', phases: 'shoot', notes: 'Boom op. Booked on dialogue-heavy days; shared with second unit when applicable.', days: [1, 2, 4, 5, 7, 8, 10, 11, 12], vendorCompanyName: undefined },
  { name: 'Mia Stone', email: 'mia.stone@mintheist-demo.com', phone: '07700 900235', department: 'Sound', role_name: 'Sound Assistant', phases: 'shoot', notes: 'Sound assistant. Cable and kit; prep from shoot day 1.', days: [...ALL_DAYS], vendorCompanyName: undefined },
  // Post-Production
  { name: 'Luke Hayes', email: 'luke.hayes@mintheist-demo.com', phone: '07700 900212', department: 'Post-Production', role_name: 'Editor', phases: 'post', notes: 'Post starts from prep week; remote on non-shoot days. Offline edit invoice per block.', days: [...POST_DAYS], vendorCompanyName: 'Luke Hayes Editorial' },
  { name: 'Nina Foster', email: 'nina.foster@mintheist-demo.com', phone: '07700 900236', department: 'Post-Production', role_name: 'Post-Production Supervisor', phases: 'post', notes: 'HOD Post. Onboard from wrap; delivery and deliverables.', days: [10, 11, 12], vendorCompanyName: undefined },
  { name: 'Ben Ward', email: 'ben.ward@mintheist-demo.com', phone: '07700 900237', department: 'Post-Production', role_name: 'Colourist', phases: 'post', notes: 'Colourist. Grading block after offline; invoice per grading week.', days: [11, 12], vendorCompanyName: undefined },
  { name: 'Amy Lane', email: 'amy.lane@mintheist-demo.com', phone: '07700 900238', department: 'Post-Production', role_name: 'Assistant Editor', phases: 'post', notes: 'Assistant editor. Supports offline from week 2 of shoot.', days: [6, 7, 8, 9, 10, 11, 12], vendorCompanyName: undefined },
]

/** Crew labour vendor definitions (singleton demo only). Company name must match DEMO_CREW[].vendorCompanyName. */
const CREW_LABOUR_VENDORS: Array<{ company_name: string; primary_contact_full_name: string; primary_contact_email: string }> = [
  { company_name: 'David Chen Camera Ltd', primary_contact_full_name: 'David Chen', primary_contact_email: 'david.chen@mintheist-demo.com' },
  { company_name: 'Anna Petrov Sound', primary_contact_full_name: 'Anna Petrov', primary_contact_email: 'anna.petrov@mintheist-demo.com' },
  { company_name: 'Mike Torres Lighting Services', primary_contact_full_name: 'Mike Torres', primary_contact_email: 'mike.torres@mintheist-demo.com' },
  { company_name: 'Chris Walsh Grip Ltd', primary_contact_full_name: 'Chris Walsh', primary_contact_email: 'chris.walsh@mintheist-demo.com' },
  { company_name: 'Elena Vasquez Design Ltd', primary_contact_full_name: 'Elena Vasquez', primary_contact_email: 'elena.vasquez@mintheist-demo.com' },
  { company_name: 'Luke Hayes Editorial', primary_contact_full_name: 'Luke Hayes', primary_contact_email: 'luke.hayes@mintheist-demo.com' },
]

/** Crew labour invoice seed (issue/due as day offset from startDate). */
type CrewInvoiceDef = {
  vendorCompany: string
  invoice_number: string
  issue_offset: number
  due_offset: number
  amount: number
  tax: number
  status: 'draft' | 'received' | 'approved' | 'paid' | 'overdue'
  notes: string
}

const CREW_LABOUR_INVOICES: CrewInvoiceDef[] = [
  { vendorCompany: 'David Chen Camera Ltd', invoice_number: 'INV-DCC-2401', issue_offset: 7, due_offset: 21, amount: 4200, tax: 840, status: 'approved', notes: 'DoP week 1 labour; camera package excluded.' },
  { vendorCompany: 'Anna Petrov Sound', invoice_number: 'INV-APS-1802', issue_offset: 14, due_offset: 28, amount: 3800, tax: 760, status: 'received', notes: 'Sound mixer principal block labour.' },
  { vendorCompany: 'Mike Torres Lighting Services', invoice_number: 'INV-MTL-1101', issue_offset: 5, due_offset: 19, amount: 2950, tax: 590, status: 'paid', notes: 'Gaffer week 1 labour; kit excluded.' },
  { vendorCompany: 'Chris Walsh Grip Ltd', invoice_number: 'INV-CWG-2201', issue_offset: 12, due_offset: 26, amount: 3100, tax: 620, status: 'overdue', notes: 'Key grip week 2 labour.' },
  { vendorCompany: 'Elena Vasquez Design Ltd', invoice_number: 'INV-EVD-1501', issue_offset: -7, due_offset: 7, amount: 5500, tax: 1100, status: 'approved', notes: 'Production designer prep week labour.' },
  { vendorCompany: 'Luke Hayes Editorial', invoice_number: 'INV-LHE-5001', issue_offset: 45, due_offset: 59, amount: 4800, tax: 960, status: 'received', notes: 'Editor offline edit block; grading block invoiced separately.' },
]

/** Validate that every DEMO_CREW department/role_name exists in CREW_DEPARTMENTS. */
function validateCrewRoles(): void {
  for (const c of DEMO_CREW) {
    const def = CREW_DEPARTMENTS.find((d) => d.name === c.department)
    if (!def) throw new Error(`Demo crew: unknown department "${c.department}"`)
    if (!def.roles.includes(c.role_name)) throw new Error(`Demo crew: unknown role "${c.role_name}" in department ${c.department}`)
  }
}

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

    // 1) Crew people: person(15) .. person(14 + DEMO_CREW.length); is_cast=0, department, role_name, phases, notes
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

    // 2) Crew bookings: one row per (person, shoot_day) for each crew member's booked days
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
      for (let inv = 0; inv < CREW_LABOUR_INVOICES.length; inv++) {
        const invd = CREW_LABOUR_INVOICES[inv]!
        const vendorId = vendorIdByCompany.get(invd.vendorCompany)
        if (!vendorId) throw new Error(`Demo crew: vendor not found for ${invd.vendorCompany}`)
        const invoiceId = IDS.crewVendorInvoice(inv + 1)
        statements.push({
          sql: `INSERT INTO ${TABLE_INVOICES} (id, production_id, vendor_id, invoice_number, issue_date, due_date, amount, tax, currency_code, status, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          bindValues: [
            invoiceId,
            productionId,
            vendorId,
            invd.invoice_number,
            addDaysLocal(startDate, invd.issue_offset),
            addDaysLocal(startDate, invd.due_offset),
            invd.amount,
            invd.tax,
            'GBP',
            invd.status,
            invd.notes,
            ts,
            ts,
          ],
        })
      }

      // 5) Invoice reminder tasks for crew labour invoices (singleton demo only)
      const existingInvoiceTaskCount = 15 // from demoVendorFinanceSeed
      for (let inv = 0; inv < CREW_LABOUR_INVOICES.length; inv++) {
        const invd = CREW_LABOUR_INVOICES[inv]!
        const dueDate = addDaysLocal(startDate, invd.due_offset)
        const taskId = IDS.invoiceReminderTask(existingInvoiceTaskCount + inv + 1)
        const taskStatements = buildCreateTaskStatements(
          taskId,
          {
            production_id: productionId,
            description: `Pay invoice ${invd.invoice_number} — ${invd.vendorCompany}`,
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
