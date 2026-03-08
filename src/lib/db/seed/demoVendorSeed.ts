/**
 * Demo production vendor seed. Used only for the singleton demo production (DEMO_SLUG).
 * Seeds 18 UK film/HETV-style vendors with deterministic IDs.
 * Call before seedDemoBudget so expense vendor_id can be set from the returned map.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */

import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import { IDS } from './constants'

const TABLE = 'vendors'

/** Single vendor definition for demo seed. */
export type DemoVendorDef = {
  company_name: string
  primary_contact_full_name: string
  primary_contact_email: string
}

/** Ordered list of 18 demo vendors. Index 0 → IDS.vendor(1), etc. */
export const DEMO_VENDORS: DemoVendorDef[] = [
  { company_name: 'Panavision London', primary_contact_full_name: 'James Holloway', primary_contact_email: 'jholloway@panavision-demo.co.uk' },
  { company_name: 'Lumen Grip & Light', primary_contact_full_name: 'Hannah Price', primary_contact_email: 'hannah.price@lumengrip-demo.co.uk' },
  { company_name: 'Signal Sound Services', primary_contact_full_name: 'Omar Bennett', primary_contact_email: 'omar.bennett@signalsound-demo.co.uk' },
  { company_name: 'Crown Unit Catering', primary_contact_full_name: 'Melissa Ford', primary_contact_email: 'melissa.ford@crowncatering-demo.co.uk' },
  { company_name: 'Keystone Transport', primary_contact_full_name: 'Aaron Mills', primary_contact_email: 'aaron.mills@keystonetransport-demo.co.uk' },
  { company_name: 'Regent Stays Hospitality', primary_contact_full_name: 'Priya Shah', primary_contact_email: 'priya.shah@regentstays-demo.co.uk' },
  { company_name: 'Screen Legal LLP', primary_contact_full_name: 'Rebecca Stern', primary_contact_email: 'rebecca.stern@screenlegal-demo.co.uk' },
  { company_name: 'Film Insure Ltd', primary_contact_full_name: 'Daniel Kerr', primary_contact_email: 'daniel.kerr@filminsure-demo.co.uk' },
  { company_name: 'Borough Film Locations', primary_contact_full_name: 'Louise Carter', primary_contact_email: 'louise.carter@boroughlocations-demo.co.uk' },
  { company_name: 'City Permissions Office', primary_contact_full_name: 'Martin Wells', primary_contact_email: 'martin.wells@citypermissions-demo.gov.uk' },
  { company_name: 'Costume House London', primary_contact_full_name: 'Sophie Lang', primary_contact_email: 'sophie.lang@costumehouse-demo.co.uk' },
  { company_name: 'Forge Art & Props', primary_contact_full_name: 'Elliot Mercer', primary_contact_email: 'elliot.mercer@forgeprops-demo.co.uk' },
  { company_name: 'The Post Yard', primary_contact_full_name: 'Nina Foster', primary_contact_email: 'nina.foster@thepostyard-demo.co.uk' },
  { company_name: 'DCP Lab UK', primary_contact_full_name: 'Ben Wallace', primary_contact_email: 'ben.wallace@dcplab-demo.co.uk' },
  { company_name: 'SafeSet Supplies', primary_contact_full_name: 'Chloe Grant', primary_contact_email: 'chloe.grant@safeset-demo.co.uk' },
  { company_name: 'CrowdLink Casting', primary_contact_full_name: 'Tessa Morgan', primary_contact_email: 'tessa.morgan@crowdlink-demo.co.uk' },
  { company_name: 'Atlas Rights Management', primary_contact_full_name: 'Jonathan Reed', primary_contact_email: 'jonathan.reed@atlasrights-demo.co.uk' },
  { company_name: 'Meridian Production Offices', primary_contact_full_name: 'Laura Finch', primary_contact_email: 'laura.finch@meridianoffices-demo.co.uk' },
]

/**
 * Seed vendors for the demo production only. Uses deterministic IDs from IDS.vendor(1..18).
 * Returns a map of company_name → vendor id for use by budget and vendor finance seeds.
 */
export async function seedDemoVendors(
  productionId: string,
  ts: string
): Promise<Record<string, string>> {
  const map: Record<string, string> = {}

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (let i = 0; i < DEMO_VENDORS.length; i++) {
      const v = DEMO_VENDORS[i]!
      const id = IDS.vendor(i + 1)
      map[v.company_name] = id
      statements.push({
        sql: `INSERT INTO ${TABLE} (id, production_id, company_name, primary_contact_full_name, primary_contact_email, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
        bindValues: [
          id,
          productionId,
          v.company_name,
          v.primary_contact_full_name,
          v.primary_contact_email,
          ts,
          ts,
        ],
      })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })

  return map
}
