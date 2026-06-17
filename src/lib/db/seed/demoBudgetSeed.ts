/**
 * Demo production budget seed: single source for all demo budget data.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds: chart of accounts (budget_accounts), budget_items (account_id), expenses (account_id),
 * and production totals (Above the Line / Below the Line). No legacy budget_categories.
 * Resolves account IDs by code for maintainability.
 *
 * Mint Heist and North Shore episodic demos must use distinct budget_account / production_totals primary
 * keys so `resetDemoData` (Mint seed then episodic) does not hit UNIQUE collisions on chart ids.
 */

import { EPISODIC_DEMO_IDS } from './constants'
import {
  buildDefaultAllowLineItemDetails,
  buildMigratedAllowExpenseDetails,
} from '@/lib/budget/migrations/untypedToAllow'
import { allowDetailsToJson } from '@/lib/budget/transactions/allow'
import { allowLineItemDetailsToJson } from '@/lib/budget/line-items/allow'

const MINT_BUDGET_NUMERIC_BASE = 'a1000000-0000-4000-8000-0000' as const
const EPISODIC_BUDGET_NUMERIC_BASE = 'a2000000-0000-4000-8000-0000' as const

function budgetNumericBaseForDemoProduction(productionId: string): string {
  return productionId === EPISODIC_DEMO_IDS.production ? EPISODIC_BUDGET_NUMERIC_BASE : MINT_BUDGET_NUMERIC_BASE
}

/** Deterministic account id for demo production from account code (e.g. '1100', '2406'). */
export function demoAccountId(code: string, productionId?: string): string {
  const base =
    productionId === undefined ? MINT_BUDGET_NUMERIC_BASE : budgetNumericBaseForDemoProduction(productionId)
  const digits = String(code).replace(/\D/g, '').padStart(6, '0')
  return `${base}${digits}ac0000`
}

/**
 * Full chart of accounts for the demo production. xx00 = header (non-postable);
 * all others = postable leaf accounts. Sorted by code.
 */
export const DEMO_CHART_OF_ACCOUNTS: { code: string; name: string }[] = [
  { code: '1100', name: 'SCRIPT' },
  { code: '1101', name: 'Story Rights / Option' },
  { code: '1102', name: 'Writer Fees' },
  { code: '1103', name: 'Script Development' },
  { code: '1104', name: 'Script Editor / Consultant' },
  { code: '1105', name: 'Script Revisions' },
  { code: '1106', name: 'Script Clearance / Research' },
  { code: '1107', name: 'Script Printing & Distribution' },
  { code: '1200', name: "PRODUCER'S DEPARTMENT" },
  { code: '1201', name: 'Executive Producer Fees' },
  { code: '1202', name: 'Producer Fees' },
  { code: '1203', name: 'Line Producer' },
  { code: '1204', name: 'Associate Producer' },
  { code: '1205', name: 'Production Consultant' },
  { code: '1206', name: 'Producer Assistants' },
  { code: '1207', name: 'Producer Office Expenses' },
  { code: '1300', name: "DIRECTOR'S DEPARTMENT" },
  { code: '1301', name: 'Director Fee' },
  { code: '1302', name: '1st Assistant Director' },
  { code: '1303', name: '2nd Assistant Director' },
  { code: '1304', name: '3rd Assistant Director' },
  { code: '1305', name: "Director's Assistant" },
  { code: '1306', name: 'Script Supervisor' },
  { code: '1307', name: "Director's Research & Prep" },
  { code: '1400', name: 'CAST' },
  { code: '1401', name: 'Lead Cast' },
  { code: '1402', name: 'Supporting Cast' },
  { code: '1403', name: 'Day Players' },
  { code: '1404', name: 'Stand-ins' },
  { code: '1405', name: 'Stunt Performers' },
  { code: '1406', name: 'Cast Rehearsals' },
  { code: '1407', name: 'Cast Travel Days' },
  { code: '1500', name: 'ABOVE-THE-LINE LOGISTICS, ACCOMMODATION & SUNDRIES' },
  { code: '1501', name: 'Cast Travel' },
  { code: '1502', name: 'Cast Accommodation' },
  { code: '1503', name: 'Cast Per Diems' },
  { code: '1504', name: 'Director Travel' },
  { code: '1505', name: 'Director Accommodation' },
  { code: '1506', name: 'Producer Travel' },
  { code: '1507', name: 'Producer Accommodation' },
  { code: '1508', name: 'ATL Catering / Hospitality' },
  { code: '1509', name: 'ATL Sundries' },
  { code: '2100', name: 'HEALTH & SAFETY' },
  { code: '2101', name: 'Health & Safety Supervisor' },
  { code: '2102', name: 'Risk Assessments' },
  { code: '2103', name: 'Safety Equipment' },
  { code: '2104', name: 'Fire Safety Officer' },
  { code: '2105', name: 'Set Medics / First Aid' },
  { code: '2106', name: 'Safety Training' },
  { code: '2107', name: 'Safety Signage' },
  { code: '2200', name: 'MARKETING DEPARTMENT' },
  { code: '2201', name: 'Publicist' },
  { code: '2202', name: 'Press Photography' },
  { code: '2203', name: 'EPK / Behind the Scenes' },
  { code: '2204', name: 'Social Media Content' },
  { code: '2205', name: 'Marketing Design' },
  { code: '2206', name: 'Promotional Video' },
  { code: '2207', name: 'Festival Submissions' },
  { code: '2300', name: 'LEGAL & ACCOUNTING DEPARTMENT' },
  { code: '2301', name: 'Production Accountant' },
  { code: '2302', name: 'Assistant Accountant' },
  { code: '2303', name: 'Payroll Services' },
  { code: '2304', name: 'Legal Services' },
  { code: '2305', name: 'Contract Drafting' },
  { code: '2306', name: 'Insurance' },
  { code: '2307', name: 'Completion Bond' },
  { code: '2308', name: 'Banking Fees' },
  { code: '2400', name: 'CAMERA' },
  { code: '2401', name: 'Director of Photography' },
  { code: '2402', name: 'Camera Operator' },
  { code: '2403', name: '1st AC / Focus Puller' },
  { code: '2404', name: '2nd AC / Clapper Loader' },
  { code: '2405', name: 'Camera Trainee' },
  { code: '2406', name: 'Camera Rental Package' },
  { code: '2407', name: 'Camera Accessories' },
  { code: '2408', name: 'Camera Media / Storage' },
  { code: '2409', name: 'Camera Maintenance' },
  { code: '2500', name: 'GRIP & VEHICLES' },
  { code: '2501', name: 'Key Grip' },
  { code: '2502', name: 'Best Boy Grip' },
  { code: '2503', name: 'Dolly Grip' },
  { code: '2504', name: 'Grip Equipment Rental' },
  { code: '2505', name: 'Track / Rigging Equipment' },
  { code: '2506', name: 'Production Vehicles' },
  { code: '2507', name: 'Vehicle Fuel' },
  { code: '2508', name: 'Vehicle Insurance' },
  { code: '2600', name: 'ELECTRICAL' },
  { code: '2601', name: 'Gaffer' },
  { code: '2602', name: 'Best Boy Electric' },
  { code: '2603', name: 'Electricians' },
  { code: '2604', name: 'Lighting Equipment Rental' },
  { code: '2605', name: 'Generators' },
  { code: '2606', name: 'Distribution Equipment' },
  { code: '2607', name: 'Lighting Consumables' },
  { code: '2700', name: 'SOUND' },
  { code: '2701', name: 'Production Sound Mixer' },
  { code: '2702', name: 'Boom Operator' },
  { code: '2703', name: 'Sound Assistant' },
  { code: '2704', name: 'Sound Equipment Rental' },
  { code: '2705', name: 'Wireless Systems' },
  { code: '2706', name: 'Sound Media' },
  { code: '2800', name: 'SPECIAL EFFECTS' },
  { code: '2801', name: 'SFX Supervisor' },
  { code: '2802', name: 'SFX Technicians' },
  { code: '2803', name: 'Practical Effects Materials' },
  { code: '2804', name: 'Pyrotechnics' },
  { code: '2805', name: 'Atmospheric Effects (Smoke / Rain)' },
  { code: '2806', name: 'SFX Safety Supervision' },
  { code: '2900', name: 'WARDROBE & MAKE-UP' },
  { code: '2901', name: 'Costume Designer' },
  { code: '2902', name: 'Costume Supervisor' },
  { code: '2903', name: 'Costume Assistants' },
  { code: '2904', name: 'Costume Purchase' },
  { code: '2905', name: 'Costume Hire' },
  { code: '2906', name: 'Wardrobe Maintenance' },
  { code: '2907', name: 'Hair Designer' },
  { code: '2908', name: 'Hair & Make-up Artists' },
  { code: '2909', name: 'Make-up Materials' },
  { code: '3000', name: 'ART DEPARTMENT – SET DRESSING & PROPS' },
  { code: '3001', name: 'Production Designer' },
  { code: '3002', name: 'Art Director' },
  { code: '3003', name: 'Assistant Art Director' },
  { code: '3004', name: 'Set Decorator' },
  { code: '3005', name: 'Props Master' },
  { code: '3006', name: 'Set Construction Labour' },
  { code: '3007', name: 'Set Construction Materials' },
  { code: '3008', name: 'Set Dressing Purchase' },
  { code: '3009', name: 'Props Purchase' },
  { code: '3010', name: 'Props Hire' },
  { code: '3011', name: 'Art Department Vehicles' },
  { code: '3100', name: 'LOCATIONS' },
  { code: '3101', name: 'Location Manager' },
  { code: '3102', name: 'Location Scouts' },
  { code: '3103', name: 'Location Assistants' },
  { code: '3104', name: 'Location Fees' },
  { code: '3105', name: 'Location Permits' },
  { code: '3106', name: 'Location Security' },
  { code: '3107', name: 'Location Clean-up' },
  { code: '3108', name: 'COVID PPE / Hygiene Supplies' },
  { code: '3200', name: 'DAILIES' },
  { code: '3201', name: 'Data Wrangler / DIT' },
  { code: '3202', name: 'DIT Equipment' },
  { code: '3203', name: 'Media Backup Systems' },
  { code: '3204', name: 'Data Storage Drives' },
  { code: '3205', name: 'Dailies Processing' },
  { code: '3300', name: 'EXTRAS' },
  { code: '3301', name: 'Background Casting' },
  { code: '3302', name: 'Background Artists' },
  { code: '3303', name: 'Crowd Supervisors' },
  { code: '3304', name: 'Extras Catering' },
  { code: '3305', name: 'Extras Transport' },
  { code: '3400', name: 'BELOW-THE-LINE LOGISTICS, ACCOMMODATION & SUNDRIES' },
  { code: '3401', name: 'Crew Travel' },
  { code: '3402', name: 'Crew Accommodation' },
  { code: '3403', name: 'Crew Per Diems' },
  { code: '3404', name: 'Production Office Rent' },
  { code: '3405', name: 'Office Equipment' },
  { code: '3406', name: 'Office Supplies' },
  { code: '3407', name: 'Communications / Radios' },
  { code: '3408', name: 'Internet / Phone' },
  { code: '3409', name: 'Unit Catering' },
  { code: '3410', name: 'Craft Services' },
  { code: '4100', name: 'VISUAL POST' },
  { code: '4101', name: 'Picture Editor' },
  { code: '4102', name: 'Assistant Editor' },
  { code: '4103', name: 'Editing Suite Rental' },
  { code: '4104', name: 'VFX Supervisor' },
  { code: '4105', name: 'VFX Artists' },
  { code: '4106', name: 'Colourist' },
  { code: '4107', name: 'Online Edit / Conform' },
  { code: '4200', name: 'AUDIO POST' },
  { code: '4201', name: 'Sound Editor' },
  { code: '4202', name: 'Dialogue Edit' },
  { code: '4203', name: 'ADR Recording' },
  { code: '4204', name: 'Foley Recording' },
  { code: '4205', name: 'Sound Design' },
  { code: '4206', name: 'Re-Recording Mix' },
  { code: '4207', name: 'Mix Stage Rental' },
  { code: '4300', name: 'DELIVERABLES' },
  { code: '4301', name: 'Mastering' },
  { code: '4302', name: 'DCP Creation' },
  { code: '4303', name: 'QC / Compliance' },
  { code: '4304', name: 'Broadcast Deliverables' },
  { code: '4305', name: 'Subtitles / Captions' },
  { code: '4306', name: 'Archiving' },
  { code: '4400', name: 'POST PRODUCTION SUNDRIES' },
  { code: '4401', name: 'Post Production Office' },
  { code: '4402', name: 'Hard Drives / Media' },
  { code: '4403', name: 'Post Production Travel' },
  { code: '4404', name: 'Post Production Contingency' },
]

/** Header account codes (xx00) for production totals: Above the Line = 1100–1500, Below the Line = 2100–3400. */
export const DEMO_ATL_HEADER_CODES = ['1100', '1200', '1300', '1400', '1500']
export const DEMO_BTL_HEADER_CODES = ['2100', '2200', '2300', '2400', '2500', '2600', '2700', '2800', '2900', '3000', '3100', '3200', '3300', '3400']

/**
 * Representative budget line items: account_code, description, estimated_cost (GBP), optional vendor.
 * actual_cost not set (actuals come from expenses).
 */
export const DEMO_BUDGET_ITEMS: {
  account_code: string
  description: string
  estimated_cost: number
  vendor?: string | null
}[] = [
  { account_code: '1101', description: 'Option – source novel', estimated_cost: 15000, vendor: 'Atlas Rights Management' },
  { account_code: '1102', description: 'Writer fees – screenplay', estimated_cost: 85000, vendor: null },
  { account_code: '1105', description: 'Script revisions – polish', estimated_cost: 12000, vendor: null },
  { account_code: '1201', description: 'Executive Producer fee', estimated_cost: 45000, vendor: null },
  { account_code: '1202', description: 'Producer fee', estimated_cost: 65000, vendor: null },
  { account_code: '1203', description: 'Line Producer – prep & shoot', estimated_cost: 52000, vendor: null },
  { account_code: '1301', description: 'Director fee', estimated_cost: 125000, vendor: null },
  { account_code: '1302', description: '1st AD – principal block', estimated_cost: 28500, vendor: null },
  { account_code: '1306', description: 'Script Supervisor', estimated_cost: 14200, vendor: null },
  { account_code: '1307', description: 'Director prep week', estimated_cost: 8500, vendor: null },
  { account_code: '1401', description: 'Principal cast block booking', estimated_cost: 380000, vendor: null },
  { account_code: '1402', description: 'Supporting cast – 3 roles', estimated_cost: 72000, vendor: null },
  { account_code: '1403', description: 'Day players – 8 days', estimated_cost: 18500, vendor: null },
  { account_code: '1502', description: 'Cast accommodation – 4 weeks', estimated_cost: 22000, vendor: 'Regent Stays Hospitality' },
  { account_code: '1503', description: 'Cast per diems', estimated_cost: 8400, vendor: null },
  { account_code: '2101', description: 'Health & Safety Supervisor', estimated_cost: 6200, vendor: null },
  { account_code: '2103', description: 'Safety equipment & PPE', estimated_cost: 3100, vendor: 'SafeSet Supplies' },
  { account_code: '2301', description: 'Production Accountant', estimated_cost: 18500, vendor: null },
  { account_code: '2304', description: 'Legal retainer – production', estimated_cost: 15000, vendor: 'Screen Legal LLP' },
  { account_code: '2306', description: 'Production insurance', estimated_cost: 42000, vendor: 'Film Insure Ltd' },
  { account_code: '2401', description: 'DoP fee', estimated_cost: 38500, vendor: null },
  { account_code: '2406', description: 'Alexa Mini LF weekly rental', estimated_cost: 12500, vendor: 'Panavision London' },
  { account_code: '2408', description: 'Camera media – 4 weeks', estimated_cost: 2800, vendor: null },
  { account_code: '2504', description: 'Grip package rental', estimated_cost: 8200, vendor: 'Lumen Grip & Light' },
  { account_code: '2506', description: 'Production vehicles – 3x', estimated_cost: 9500, vendor: 'Keystone Transport' },
  { account_code: '2507', description: 'Vehicle fuel', estimated_cost: 2400, vendor: null },
  { account_code: '2601', description: 'Gaffer', estimated_cost: 18200, vendor: null },
  { account_code: '2604', description: 'Lighting package rental', estimated_cost: 15500, vendor: 'Lumen Grip & Light' },
  { account_code: '2701', description: 'Production Sound Mixer', estimated_cost: 14200, vendor: null },
  { account_code: '2704', description: 'Sound kit rental', estimated_cost: 4200, vendor: null },
  { account_code: '2901', description: 'Costume Designer fee', estimated_cost: 18500, vendor: null },
  { account_code: '2905', description: 'Costume hire – principal', estimated_cost: 12000, vendor: 'Costume House London' },
  { account_code: '2908', description: 'Hair & Make-up team', estimated_cost: 9800, vendor: null },
  { account_code: '3001', description: 'Production Designer', estimated_cost: 32000, vendor: null },
  { account_code: '3004', description: 'Set dressing – bank interior', estimated_cost: 18500, vendor: null },
  { account_code: '3009', description: 'Props purchase – hero items', estimated_cost: 4200, vendor: 'Forge Art & Props' },
  { account_code: '3101', description: 'Location Manager', estimated_cost: 15800, vendor: null },
  { account_code: '3104', description: 'Location fee – mint building', estimated_cost: 25000, vendor: 'Borough Film Locations' },
  { account_code: '3105', description: 'Location permit – town hall', estimated_cost: 850, vendor: 'City Permissions Office' },
  { account_code: '3201', description: 'DIT – principal block', estimated_cost: 11200, vendor: null },
  { account_code: '3202', description: 'DIT cart package', estimated_cost: 2400, vendor: null },
  { account_code: '3302', description: 'Background artists – 5 days', estimated_cost: 6500, vendor: 'CrowdLink Casting' },
  { account_code: '3404', description: 'Production office rent – 6 weeks', estimated_cost: 8400, vendor: 'Meridian Production Offices' },
  { account_code: '3409', description: 'Unit catering – 18 days', estimated_cost: 16200, vendor: 'Crown Unit Catering' },
  { account_code: '3410', description: 'Craft services', estimated_cost: 2100, vendor: null },
  { account_code: '4101', description: 'Picture Editor', estimated_cost: 28500, vendor: null },
  { account_code: '4103', description: 'Edit suite rental – 8 weeks', estimated_cost: 12800, vendor: 'The Post Yard' },
  { account_code: '4106', description: 'Grade – 5 days', estimated_cost: 9500, vendor: null },
  { account_code: '4201', description: 'Sound Editor', estimated_cost: 14200, vendor: null },
  { account_code: '4206', description: 'Re-recording mix – 3 days', estimated_cost: 7800, vendor: null },
  { account_code: '4301', description: 'Mastering', estimated_cost: 4200, vendor: null },
  { account_code: '4302', description: 'DCP creation', estimated_cost: 3500, vendor: 'DCP Lab UK' },
]

/**
 * Representative expenses (transactions): account_code, amount (GBP), date_offset (days from production start),
 * optional vendor, notes, expense_type. Actuals are derived from these; no budget_items.actual_cost.
 */
export const DEMO_EXPENSES: {
  account_code: string
  amount: number
  date_offset: number
  vendor?: string | null
  notes?: string | null
  expense_type?: 'per_diem' | 'other'
}[] = [
  { account_code: '2304', amount: 5000, date_offset: -14, vendor: 'Screen Legal LLP', notes: 'Legal retainer – 50%', expense_type: 'other' },
  { account_code: '2306', amount: 21000, date_offset: -7, vendor: 'Film Insure Ltd', notes: 'Insurance – first instalment', expense_type: 'other' },
  { account_code: '1102', amount: 42500, date_offset: 0, vendor: null, notes: 'Writer – first payment', expense_type: 'other' },
  { account_code: '2406', amount: 12500, date_offset: 2, vendor: 'Panavision London', notes: 'Camera package – week 1', expense_type: 'other' },
  { account_code: '2604', amount: 7750, date_offset: 2, vendor: 'Lumen Grip & Light', notes: 'Lighting – week 1', expense_type: 'other' },
  { account_code: '1502', amount: 5500, date_offset: 3, vendor: 'Regent Stays Hospitality', notes: 'Cast hotel – week 1', expense_type: 'other' },
  { account_code: '1503', amount: 2100, date_offset: 5, vendor: null, notes: 'Cast per diems – week 1', expense_type: 'per_diem' },
  { account_code: '3409', amount: 5400, date_offset: 5, vendor: 'Crown Unit Catering', notes: 'Unit catering – days 1–3', expense_type: 'other' },
  { account_code: '2507', amount: 600, date_offset: 6, vendor: null, notes: 'Fuel – unit vehicles', expense_type: 'other' },
  { account_code: '3105', amount: 850, date_offset: 4, vendor: 'City Permissions Office', notes: 'Town hall permit', expense_type: 'other' },
  { account_code: '2905', amount: 4000, date_offset: 1, vendor: 'Costume House London', notes: 'Principal costume hire – deposit', expense_type: 'other' },
  { account_code: '2103', amount: 1550, date_offset: 0, vendor: 'SafeSet Supplies', notes: 'PPE & safety kit', expense_type: 'other' },
  { account_code: '3202', amount: 600, date_offset: 3, vendor: null, notes: 'DIT cart – week 1', expense_type: 'other' },
  { account_code: '3404', amount: 2800, date_offset: -7, vendor: 'Meridian Production Offices', notes: 'Office rent – month 1', expense_type: 'other' },
  { account_code: '2301', amount: 4625, date_offset: 7, vendor: null, notes: 'Accountant – week 1', expense_type: 'other' },
  { account_code: '4103', amount: 3200, date_offset: 45, vendor: 'The Post Yard', notes: 'Edit suite – week 1', expense_type: 'other' },
  { account_code: '4302', amount: 3500, date_offset: 95, vendor: 'DCP Lab UK', notes: 'DCP creation – delivery', expense_type: 'other' },
  { account_code: '3403', amount: 840, date_offset: 8, vendor: null, notes: 'Crew per diems – week 2', expense_type: 'per_diem' },
  { account_code: '2506', amount: 3166, date_offset: 10, vendor: 'Keystone Transport', notes: 'Vehicle hire – week 2', expense_type: 'other' },
  { account_code: '3009', amount: 1200, date_offset: 6, vendor: null, notes: 'Props purchase – hero safe', expense_type: 'other' },
]

function demoBudgetItemDetailsId(itemId: string): string {
  return `${itemId}-details`
}

function demoExpenseDetailsId(expenseId: string): string {
  return `${expenseId}-details`
}

/** Deterministic id for demo production total (Above the Line / Below the Line). */
function demoProductionTotalId(index: number, idBase: string): string {
  return `${idBase}pt${String(index).padStart(2, '0')}00000000`
}

/** Deterministic id for production_total_accounts mapping row. */
function demoProductionTotalMappingId(totalIndex: number, accountCode: string, idBase: string): string {
  return `${idBase}ma${String(totalIndex).padStart(2, '0')}${String(accountCode).padStart(4, '0')}0000`
}

function isHeaderCode(code: string): boolean {
  const n = Number(code)
  return n % 100 === 0
}

function parentCode(code: string): string | null {
  if (isHeaderCode(code)) return null
  const n = Number(code)
  const parent = Math.floor(n / 100) * 100
  return String(parent).padStart(4, '0')
}

/**
 * Seed only the chart of accounts and production totals (Above the Line / Below the Line)
 * using the same structure as demo. No budget items or expenses.
 * Used by the Default production template. Uses runInSerializedTransaction + executeBatch.
 * @param nextId - Called to generate each ID (e.g. uuid for default template).
 */
export async function seedChartOfAccountsAndTotalsOnly(
  productionId: string,
  ts: string,
  nextId: () => string
): Promise<void> {
  const { getDb, executeBatch, runInSerializedTransaction } = await import('../client')
  const TABLE_ACCOUNTS = 'budget_accounts'
  const TABLE_TOTALS = 'production_totals'
  const TABLE_TOTAL_ACCOUNTS = 'production_total_accounts'

  const byCode = new Map<string, string>()
  for (const { code } of DEMO_CHART_OF_ACCOUNTS) {
    byCode.set(code, nextId())
  }
  const total1Id = nextId()
  const total2Id = nextId()

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (let i = 0; i < DEMO_CHART_OF_ACCOUNTS.length; i++) {
      const { code, name } = DEMO_CHART_OF_ACCOUNTS[i]!
      const id = byCode.get(code)!
      const parentCodeVal = parentCode(code)
      const parentId = parentCodeVal ? byCode.get(parentCodeVal) ?? null : null
      const isPostable = !isHeaderCode(code)
      statements.push({
        sql: `INSERT INTO ${TABLE_ACCOUNTS} (id, production_id, code, name, parent_account_id, sort_order, is_postable, archived_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)`,
        bindValues: [id, productionId, code, name, parentId, i, isPostable ? 1 : 0, ts, ts],
      })
    }

    statements.push({
      sql: `INSERT INTO ${TABLE_TOTALS} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
      bindValues: [total1Id, productionId, 'Above the Line', 0, ts, ts, total2Id, productionId, 'Below the Line', 1, ts, ts],
    })
    for (const code of DEMO_ATL_HEADER_CODES) {
      const accountId = byCode.get(code)
      if (accountId) {
        statements.push({
          sql: `INSERT INTO ${TABLE_TOTAL_ACCOUNTS} (id, production_total_id, account_id) VALUES ($1, $2, $3)`,
          bindValues: [nextId(), total1Id, accountId],
        })
      }
    }
    for (const code of DEMO_BTL_HEADER_CODES) {
      const accountId = byCode.get(code)
      if (accountId) {
        statements.push({
          sql: `INSERT INTO ${TABLE_TOTAL_ACCOUNTS} (id, production_total_id, account_id) VALUES ($1, $2, $3)`,
          bindValues: [nextId(), total2Id, accountId],
        })
      }
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}

/**
 * Seed demo production budget: chart of accounts, budget items (account_id only), expenses (account_id only),
 * and optional production totals (Above the Line, Below the Line). Uses runInSerializedTransaction + executeBatch.
 * Does not seed legacy budget_categories; category_id is left null on items and expenses.
 * When vendorIdByCompanyName is provided (e.g. from seedDemoVendors), expenses with a matching vendor string
 * get vendor_id set for vendor spend and invoice/PO linking.
 */
export async function seedDemoBudget(
  pid: string,
  startDate: string,
  ts: string,
  addDaysLocal: (yyyyMmDd: string, days: number) => string,
  budgetItemId: (n: number) => string,
  expenseId: (n: number) => string,
  vendorIdByCompanyName?: Record<string, string> | null
): Promise<void> {
  const { getDb, executeBatch, runInSerializedTransaction } = await import('../client')
  const TABLE_ACCOUNTS = 'budget_accounts'
  const TABLE_ITEMS = 'budget_items'
  const TABLE_ITEM_DETAILS = 'budget_item_details'
  const TABLE_EXPENSES = 'expenses'
  const TABLE_EXPENSE_DETAILS = 'expense_transaction_details'
  const TABLE_TOTALS = 'production_totals'
  const TABLE_TOTAL_ACCOUNTS = 'production_total_accounts'

  const idBase = budgetNumericBaseForDemoProduction(pid)
  const byCode = new Map<string, string>()
  for (const { code } of DEMO_CHART_OF_ACCOUNTS) {
    const id = demoAccountId(code, pid)
    byCode.set(code, id)
  }

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    // 1) Insert budget_accounts: headers first (parent null), then children (parent_account_id set). xx00 = non-postable.
    for (let i = 0; i < DEMO_CHART_OF_ACCOUNTS.length; i++) {
      const { code, name } = DEMO_CHART_OF_ACCOUNTS[i]!
      const id = demoAccountId(code, pid)
      const parentCodeVal = parentCode(code)
      const parentId = parentCodeVal ? byCode.get(parentCodeVal) ?? null : null
      const isPostable = !isHeaderCode(code)
      statements.push({
        sql: `INSERT INTO ${TABLE_ACCOUNTS} (id, production_id, code, name, parent_account_id, sort_order, is_postable, archived_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)`,
        bindValues: [id, pid, code, name, parentId, i, isPostable ? 1 : 0, ts, ts],
      })
    }

    // 2) Insert budget_items: account_id set, category_id null, actual_cost 0.
    DEMO_BUDGET_ITEMS.forEach((row, idx) => {
      const accountId = byCode.get(row.account_code)
      if (!accountId) return
      const id = budgetItemId(idx + 1)
      const detailsJson = allowLineItemDetailsToJson(
        buildDefaultAllowLineItemDetails({
          description: row.description,
          estimated_cost: row.estimated_cost,
        })
      )
      statements.push({
        sql: `INSERT INTO ${TABLE_ITEMS} (id, production_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, line_item_type, created_at, updated_at) VALUES ($1, $2, NULL, $3, $4, $5, 0, $6, 'draft', 'allow', $7, $8)`,
        bindValues: [
          id,
          pid,
          accountId,
          row.description,
          row.estimated_cost,
          row.vendor ?? null,
          ts,
          ts,
        ],
      })
      statements.push({
        sql: `INSERT INTO ${TABLE_ITEM_DETAILS} (id, budget_item_id, line_item_type, details_json, created_at, updated_at) VALUES ($1, $2, 'allow', $3, $4, $5)`,
        bindValues: [demoBudgetItemDetailsId(id), id, detailsJson, ts, ts],
      })
    })

    // 3) Insert expenses: account_id set, category_id null; date = startDate + date_offset.
    // When vendorIdByCompanyName is provided, set vendor_id for expenses with matching vendor string.
    DEMO_EXPENSES.forEach((row, idx) => {
      const accountId = byCode.get(row.account_code)
      if (!accountId) return
      const id = expenseId(idx + 1)
      const date = addDaysLocal(startDate, row.date_offset)
      const vendorId = vendorIdByCompanyName && row.vendor ? vendorIdByCompanyName[row.vendor] ?? null : null
      const detailsJson = allowDetailsToJson(
        buildMigratedAllowExpenseDetails({
          notes: row.notes ?? null,
          vendor: row.vendor ?? null,
          amount: row.amount,
        })
      )
      statements.push({
        sql: `INSERT INTO ${TABLE_EXPENSES} (id, production_id, category_id, account_id, transaction_type, vendor_id, amount, date, vendor, notes, expense_type, created_at, updated_at) VALUES ($1, $2, NULL, $3, 'allow', $4, $5, $6, $7, $8, $9, $10, $11)`,
        bindValues: [
          id,
          pid,
          accountId,
          vendorId,
          row.amount,
          date,
          row.vendor ?? null,
          row.notes ?? null,
          row.expense_type ?? 'other',
          ts,
          ts,
        ],
      })
      statements.push({
        sql: `INSERT INTO ${TABLE_EXPENSE_DETAILS} (id, expense_id, transaction_type, details_json, created_at, updated_at) VALUES ($1, $2, 'allow', $3, $4, $5)`,
        bindValues: [demoExpenseDetailsId(id), id, detailsJson, ts, ts],
      })
    })

    // 4) Production totals: Above the Line (headers 1100–1500), Below the Line (headers 2100–3400).
    const total1Id = demoProductionTotalId(1, idBase)
    const total2Id = demoProductionTotalId(2, idBase)
    statements.push({
      sql: `INSERT INTO ${TABLE_TOTALS} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
      bindValues: [total1Id, pid, 'Above the Line', 0, ts, ts, total2Id, pid, 'Below the Line', 1, ts, ts],
    })
    for (const code of DEMO_ATL_HEADER_CODES) {
      const accountId = byCode.get(code)
      if (accountId)
        statements.push({
          sql: `INSERT INTO ${TABLE_TOTAL_ACCOUNTS} (id, production_total_id, account_id) VALUES ($1, $2, $3)`,
          bindValues: [demoProductionTotalMappingId(1, code, idBase), total1Id, accountId],
        })
    }
    for (const code of DEMO_BTL_HEADER_CODES) {
      const accountId = byCode.get(code)
      if (accountId)
        statements.push({
          sql: `INSERT INTO ${TABLE_TOTAL_ACCOUNTS} (id, production_total_id, account_id) VALUES ($1, $2, $3)`,
          bindValues: [demoProductionTotalMappingId(2, code, idBase), total2Id, accountId],
        })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}