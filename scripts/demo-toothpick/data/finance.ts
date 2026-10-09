/**
 * Toothpick budget, purchase orders, vendor invoices and expenses.
 *
 * The story is "four weeks before the shoot" (as of 2026-10-04): deposits and prep labour are
 * invoiced, hire balances are still `draft` invoices dated after wrap. Invoice <-> PO <-> expense
 * triples are built so the amounts reconcile exactly (PO total = sum of its invoices; each
 * invoice's net = sum of its expenses), with a handful of deliberate exceptions to explore:
 *   - an invoice against a PO that is still a draft (RPD-0075),
 *   - an overdue invoice (CCL-0307) and an overdue labour invoice (GPL-007),
 *   - a PO amended upwards (MUC) and a cancelled-then-replaced PO (ORV),
 *   - a EUR-denominated PO/invoice pair (Rotterdam lens hire),
 *   - expenses with no budget-line match (PPS-3345, recce travel).
 */
import type { LocationKey } from './locations'
import type { VendorKey } from './vendors'

export const AS_OF = '2026-10-04'
export const PREP_START = '2026-10-19'
export const SHOOT_FIRST = '2026-11-02'
export const SHOOT_LAST = '2026-11-10'
export const HIRE_START = '2026-10-30'
export const HIRE_END = '2026-11-12'
export const EUR_GBP = 0.86 // locked on the EUR PO: 1 EUR = 0.86 GBP

// ─── Budget lines ────────────────────────────────────────────────────────────

type LineBase = { key: string; account: string; description: string; vendor?: VendorKey; notes?: string }
export type LabourLine = LineBase & {
  kind: 'labour'; person?: { type: 'crew' | 'cast'; key: string }; role: string
  rateType: 'prep_day' | 'shoot_day' | 'overtime'; days: number; rate: number; start?: string; end?: string
}
export type RentalLine = LineBase & {
  kind: 'rental'; rateType: 'daily' | 'weekly' | 'flat'; rate: number; start: string; end: string
  overrideDays?: number; equipment?: string
}
export type PurchaseLine = LineBase & {
  kind: 'purchase'; amount: number; category: string; service?: string; location?: LocationKey
}
export type DepositLine = LineBase & { kind: 'deposit'; amount: number; refundable: 'refundable' | 'non_refundable'; location?: LocationKey }
export type AllowLine = LineBase & { kind: 'allow'; amount: number; open?: boolean }
export type BudgetLine = LabourLine | RentalLine | PurchaseLine | DepositLine | AllowLine

const L = (x: LabourLine) => x
const R = (x: RentalLine) => x
const P = (x: PurchaseLine) => x
const D = (x: DepositLine) => x
const A = (x: AllowLine) => x

export const BUDGET_LINES: BudgetLine[] = [
  // Script and development (1100)
  A({ kind: 'allow', key: 'rights', account: '1101', description: 'Script rights – Toothpick (assignment from writer)', amount: 1500, open: true, notes: 'Short-form assignment agreed in principle; paper to follow.' }),
  A({ kind: 'allow', key: 'writer', account: '1102', description: 'Writer fee – Toothpick V1 + one polish', amount: 2500, open: false }),
  A({ kind: 'allow', key: 'revisions', account: '1105', description: 'Script revisions – production draft', amount: 500, open: true }),
  A({ kind: 'allow', key: 'clearances', account: '1106', description: 'Music licences – "Free Bird" sync + master (quote awaited)', amount: 2400, vendor: 'music', open: true }),
  P({ kind: 'purchase', key: 'printing', account: '1107', description: 'Script printing – colour-revision sets for HODs and script supervisor', amount: 180, vendor: 'print', category: 'Printing' }),
  // Producer's and director's departments (1200/1300)
  L({ kind: 'labour', key: 'producerLabour', account: '1202', description: 'Producer', person: { type: 'crew', key: 'producer' }, role: 'Producer', rateType: 'shoot_day', days: 20, rate: 175 }),
  L({ kind: 'labour', key: 'lpLabour', account: '1203', description: 'Line Producer – prep, shoot, wrap', person: { type: 'crew', key: 'lineProducer' }, role: 'Line Producer', rateType: 'shoot_day', days: 24, rate: 240 }),
  L({ kind: 'labour', key: 'directorLabour', account: '1301', description: 'Director – prep, shoot, post', person: { type: 'crew', key: 'director' }, role: 'Director', rateType: 'shoot_day', days: 22, rate: 250, vendor: 'coDirector' }),
  L({ kind: 'labour', key: 'adLabour', account: '1302', description: '1st AD – prep and shoot', person: { type: 'crew', key: 'firstAd' }, role: '1st Assistant Director', rateType: 'shoot_day', days: 10, rate: 280, vendor: 'coAd' }),
  L({ kind: 'labour', key: 'scriptSupLabour', account: '1306', description: 'Script Supervisor – 1 prep day + 7 shoot days', person: { type: 'crew', key: 'scriptSup' }, role: 'Script Supervisor', rateType: 'shoot_day', days: 8, rate: 230, vendor: 'coScript', notes: 'Includes tablet/continuity kit. Daily progress reports and editor’s log at wrap.' }),
  // Cast (1400/1500)
  L({ kind: 'labour', key: 'castHugh', account: '1401', description: 'Principal cast – Hugh (Kofi Asante)', person: { type: 'cast', key: 'hugh' }, role: 'Hugh', rateType: 'shoot_day', days: 7, rate: 220 }),
  L({ kind: 'labour', key: 'castMaisie', account: '1401', description: 'Principal cast – Maisie (Amara Okafor)', person: { type: 'cast', key: 'maisie' }, role: 'Maisie', rateType: 'shoot_day', days: 6, rate: 220 }),
  L({ kind: 'labour', key: 'castDon', account: '1402', description: 'Supporting cast – Don (Arjun Malhotra)', person: { type: 'cast', key: 'don' }, role: 'Don', rateType: 'shoot_day', days: 3, rate: 200 }),
  L({ kind: 'labour', key: 'castRose', account: '1402', description: 'Supporting cast – Rose (Sofia Marchetti)', person: { type: 'cast', key: 'rose' }, role: 'Rose', rateType: 'shoot_day', days: 2, rate: 200 }),
  L({ kind: 'labour', key: 'castMinty', account: '1402', description: 'Supporting cast – Minty (Noor Haddad)', person: { type: 'cast', key: 'minty' }, role: 'Minty', rateType: 'shoot_day', days: 2, rate: 200 }),
  L({ kind: 'labour', key: 'dayBouncer', account: '1403', description: 'Day player – Bouncer', person: { type: 'cast', key: 'bouncer' }, role: 'Bouncer', rateType: 'shoot_day', days: 1, rate: 150 }),
  L({ kind: 'labour', key: 'dayCustomer', account: '1403', description: 'Day player – Customer', person: { type: 'cast', key: 'customer' }, role: 'Customer', rateType: 'shoot_day', days: 1, rate: 150 }),
  L({ kind: 'labour', key: 'dayCottage', account: '1403', description: 'Day player – Cottage-core girl', person: { type: 'cast', key: 'cottagecore' }, role: 'Cottage-core girl', rateType: 'shoot_day', days: 1, rate: 150 }),
  L({ kind: 'labour', key: 'dayWomen', account: '1403', description: 'Day players – Montage women (3)', role: 'Montage women', rateType: 'shoot_day', days: 3, rate: 150 }),
  P({ kind: 'purchase', key: 'accomm', account: '1502', description: 'Cast accommodation – 3 London-based cast, 4 nights', amount: 1280, vendor: 'lodging', category: 'Accommodation', service: 'Hotel/serviced rooms near Castlefield' }),
  A({ kind: 'allow', key: 'perDiemCast', account: '1503', description: 'Cast per diems', amount: 560, open: true }),
  // Health, safety, legal, accounts (2100/2300)
  P({ kind: 'purchase', key: 'ppe', account: '2103', description: 'Safety equipment & PPE (first-aid kits, hi-vis, signage)', amount: 320, vendor: 'safety', category: 'Safety' }),
  P({ kind: 'purchase', key: 'medic', account: '2105', description: 'Set medic – 7 shoot days', amount: 1540, vendor: 'safety', category: 'Safety', service: 'Qualified set medic' }),
  L({ kind: 'labour', key: 'accountantLabour', account: '2301', description: 'Production Accountant', person: { type: 'crew', key: 'accountant' }, role: 'Production Accountant', rateType: 'shoot_day', days: 12, rate: 210 }),
  P({ kind: 'purchase', key: 'payroll', account: '2303', description: 'Payroll services – PAYE set-up and 6 runs', amount: 480, vendor: 'payroll', category: 'Payroll', service: 'Payroll bureau' }),
  P({ kind: 'purchase', key: 'legal', account: '2304', description: 'Legal – cast/crew contracts, location agreements, music advice', amount: 1800, vendor: 'legal', category: 'Legal', service: 'Production legal' }),
  P({ kind: 'purchase', key: 'insurance', account: '2306', description: 'Production insurance (public liability, equipment, cast, negative)', amount: 1950, vendor: 'insurance', category: 'Insurance', service: 'Short-film package' }),
  // Camera (2400)
  L({ kind: 'labour', key: 'dopLabour', account: '2401', description: 'Director of Photography', person: { type: 'crew', key: 'dop' }, role: 'Director of Photography', rateType: 'shoot_day', days: 10, rate: 320, vendor: 'coDop' }),
  L({ kind: 'labour', key: 'opLabour', account: '2402', description: 'Camera Operator', person: { type: 'crew', key: 'operator' }, role: 'Camera Operator', rateType: 'shoot_day', days: 7, rate: 230 }),
  L({ kind: 'labour', key: 'ac1Labour', account: '2403', description: '1st AC / Focus Puller', person: { type: 'crew', key: 'firstAc' }, role: '1st AC', rateType: 'shoot_day', days: 7, rate: 210 }),
  L({ kind: 'labour', key: 'ac2Labour', account: '2404', description: '2nd AC / Clapper Loader', person: { type: 'crew', key: 'secondAc' }, role: '2nd AC', rateType: 'shoot_day', days: 7, rate: 170 }),
  R({ kind: 'rental', key: 'camera', account: '2406', description: 'Camera package – 2 week hire', rateType: 'weekly', rate: 1150, start: HIRE_START, end: HIRE_END, vendor: 'camera', equipment: 'Camera body, 2 prime sets, zoom, matte box, monitors, batteries' }),
  R({ kind: 'rental', key: 'lenses', account: '2407', description: 'Special lens set (EUR hire)', rateType: 'flat', rate: 1032, start: HIRE_START, end: HIRE_END, vendor: 'lenses', equipment: 'Vintage-style prime set, €1,200 at the locked 0.86 rate' }),
  P({ kind: 'purchase', key: 'media', account: '2408', description: 'Camera media – cards and caddies', amount: 420, category: 'Media' }),
  // Grip, vehicles, electrical, sound (2500-2700)
  R({ kind: 'rental', key: 'grip', account: '2504', description: 'Grip package – 2 week hire', rateType: 'weekly', rate: 600, start: HIRE_START, end: HIRE_END, vendor: 'lighting', equipment: 'Dolly, track, bench rig, flags, stands' }),
  R({ kind: 'rental', key: 'vans', account: '2506', description: 'Unit vans – 2 × 7 days', rateType: 'daily', rate: 190, start: SHOOT_FIRST, end: SHOOT_LAST, overrideDays: 7, vendor: 'vehicles', equipment: '2 Luton vans' }),
  R({ kind: 'rental', key: 'busHire', account: '2506', description: 'Static bus + driver for scene 1', rateType: 'flat', rate: 620, start: '2026-11-09', end: '2026-11-09', vendor: 'bus', equipment: 'Single-decker, parked, 1 day' }),
  A({ kind: 'allow', key: 'fuel', account: '2507', description: 'Vehicle fuel', amount: 260, open: true }),
  L({ kind: 'labour', key: 'gafferLabour', account: '2601', description: 'Gaffer', person: { type: 'crew', key: 'gaffer' }, role: 'Gaffer', rateType: 'shoot_day', days: 9, rate: 250, vendor: 'coGaffer' }),
  L({ kind: 'labour', key: 'sparksLabour', account: '2603', description: 'Electricians – 2 sparks', role: 'Spark', rateType: 'shoot_day', days: 11, rate: 165 }),
  R({ kind: 'rental', key: 'lighting', account: '2604', description: 'Lighting package – 2 week hire', rateType: 'weekly', rate: 1300, start: HIRE_START, end: HIRE_END, vendor: 'lighting', equipment: 'LED panels, tubes, 2 tungsten units, distro' }),
  L({ kind: 'labour', key: 'soundLabour', account: '2701', description: 'Production Sound Mixer', person: { type: 'crew', key: 'soundMixer' }, role: 'Sound Mixer', rateType: 'shoot_day', days: 8, rate: 230, vendor: 'coSound' }),
  L({ kind: 'labour', key: 'boomLabour', account: '2702', description: 'Boom operators (incl. cover days 4–5)', role: 'Boom Operator', rateType: 'shoot_day', days: 7, rate: 175 }),
  R({ kind: 'rental', key: 'soundKit', account: '2704', description: 'Sound kit – 2 week hire', rateType: 'weekly', rate: 780, start: HIRE_START, end: HIRE_END, vendor: 'sound', equipment: 'Recorder/mixer, 4 radio mics, 2 booms, playback speaker' }),
  // Costume, make-up, art (2900/3000)
  L({ kind: 'labour', key: 'costumeLabour', account: '2901', description: 'Costume Designer', person: { type: 'crew', key: 'costumeDesigner' }, role: 'Costume Designer', rateType: 'shoot_day', days: 12, rate: 190 }),
  P({ kind: 'purchase', key: 'costumeBuy', account: '2904', description: 'Costume purchase – Hugh’s jackets (3 duplicates), Minty’s cardigan, "Birthday Boy" jumper', amount: 540, category: 'Costume' }),
  R({ kind: 'rental', key: 'costumeHire', account: '2905', description: 'Costume hire – principal looks', rateType: 'flat', rate: 680, start: HIRE_START, end: HIRE_END, vendor: 'costume', equipment: 'Hire wardrobe for principals and day players' }),
  L({ kind: 'labour', key: 'makeUpLabour', account: '2908', description: 'Hair & make-up designer', person: { type: 'crew', key: 'makeUp' }, role: 'Hair and Make Up Designer', rateType: 'shoot_day', days: 8, rate: 170 }),
  P({ kind: 'purchase', key: 'makeUpKit', account: '2909', description: 'Make-up materials', amount: 260, category: 'Make-up' }),
  L({ kind: 'labour', key: 'pdLabour', account: '3001', description: 'Production Designer', person: { type: 'crew', key: 'productionDesigner' }, role: 'Production Designer', rateType: 'shoot_day', days: 14, rate: 230, vendor: 'coDesign' }),
  L({ kind: 'labour', key: 'decoratorLabour', account: '3004', description: 'Set Decorator', person: { type: 'crew', key: 'setDecorator' }, role: 'Set Decorator', rateType: 'shoot_day', days: 8, rate: 180 }),
  L({ kind: 'labour', key: 'propsLabour', account: '3005', description: 'Props Master', person: { type: 'crew', key: 'propMaster' }, role: 'Prop Master', rateType: 'shoot_day', days: 8, rate: 175 }),
  P({ kind: 'purchase', key: 'dressing', account: '3008', description: 'Set dressing purchase – Minty’s flat, pub and café dressing', amount: 950, category: 'Set dressing' }),
  P({ kind: 'purchase', key: 'propsBuy', account: '3009', description: 'Props purchase – cards, chips, Wii remote, lighters, ibuprofen blister packs', amount: 620, category: 'Props' }),
  R({ kind: 'rental', key: 'propsHire', account: '3010', description: 'Props hire – slow cooker, kit-cat clock, art prints', rateType: 'flat', rate: 480, start: HIRE_START, end: HIRE_END, vendor: 'props', equipment: 'Hire props for flats and café' }),
  // Locations (3100)
  L({ kind: 'labour', key: 'lmLabour', account: '3101', description: 'Locations Manager', person: { type: 'crew', key: 'locationsManager' }, role: 'Locations Manager', rateType: 'shoot_day', days: 14, rate: 210 }),
  P({ kind: 'purchase', key: 'feeFlats', account: '3104', description: 'Location fees – 4 private flats (Don, Maisie, Hugh, Minty)', amount: 1200, vendor: 'hosts', category: 'Location fee', service: 'Householder fees' }),
  P({ kind: 'purchase', key: 'feeCafe', account: '3104', description: 'Location fee – café (before-opening hire)', amount: 420, vendor: 'hosts', category: 'Location fee', service: 'Venue fee', location: 'cafe' }),
  P({ kind: 'purchase', key: 'feeBar', account: '3104', description: 'Location fee – bar (scene 2, montage 13)', amount: 450, vendor: 'hosts', category: 'Location fee', service: 'Venue fee', location: 'bar' }),
  P({ kind: 'purchase', key: 'feeClub', account: '3104', description: 'Location fee – club exterior (night)', amount: 600, vendor: 'hosts', category: 'Location fee', service: 'Venue fee', location: 'club' }),
  P({ kind: 'purchase', key: 'feeMontage', account: '3104', description: 'Location fees – montage venues (degree show, load-out)', amount: 1050, vendor: 'hosts', category: 'Location fee', service: 'Venue fees' }),
  P({ kind: 'purchase', key: 'feePub', account: '3104', description: 'Location fee – pub (The Goose and Gander), full-day hire', amount: 900, vendor: 'venues', category: 'Location fee', service: 'Venue hire', location: 'gooseAndGander' }),
  D({ kind: 'deposit', key: 'locDeposits', account: '3104', description: 'Householder damage deposits (refundable)', amount: 500, refundable: 'refundable', vendor: 'hosts' }),
  P({ kind: 'purchase', key: 'permits', account: '3105', description: 'Permits – park filming permit and parking suspension', amount: 480, vendor: 'permits', category: 'Permits', service: 'Permit and parking fees', location: 'park' }),
  A({ kind: 'allow', key: 'security', account: '3106', description: 'Location security – night exteriors (days 5 and 7)', amount: 420, open: true }),
  // Dailies, extras (3200/3300)
  L({ kind: 'labour', key: 'ditLabour', account: '3201', description: 'DIT', person: { type: 'crew', key: 'dit' }, role: 'Digital Imaging Technician', rateType: 'shoot_day', days: 7, rate: 210 }),
  P({ kind: 'purchase', key: 'dataDrives', account: '3204', description: 'Data storage – 4 TB RAID drives (×3) and backup', amount: 780, vendor: 'data', category: 'Storage' }),
  P({ kind: 'purchase', key: 'castingFee', account: '3301', description: 'Background casting – booking fee', amount: 350, vendor: 'extras', category: 'Casting', service: 'SA agency booking fee' }),
  L({ kind: 'labour', key: 'saDays', account: '3302', description: 'Supporting artists – 8 SA-days', role: 'Supporting artist', rateType: 'shoot_day', days: 8, rate: 120, vendor: 'extras' }),
  // Logistics & office (3400)
  A({ kind: 'allow', key: 'perDiemCrew', account: '3403', description: 'Crew per diems', amount: 1650, open: true }),
  R({ kind: 'rental', key: 'officeRent', account: '3404', description: 'Production office – 8 weeks', rateType: 'weekly', rate: 210, start: '2026-10-05', end: '2026-11-29', vendor: 'office', equipment: 'Desk space, meeting room, printer' }),
  P({ kind: 'purchase', key: 'supplies', account: '3406', description: 'Office supplies and stationery', amount: 140, category: 'Office' }),
  A({ kind: 'allow', key: 'internet', account: '3408', description: 'Internet / phone', amount: 90, open: true }),
  P({ kind: 'purchase', key: 'catering', account: '3409', description: 'Unit catering – 7 shoot days', amount: 2576, vendor: 'catering', category: 'Catering', service: 'Hot lunch and snacks, ~32 covers/day' }),
  A({ kind: 'allow', key: 'cateringUplift', account: '3409', description: 'Catering uplift – night days (PO amendment)', amount: 364, vendor: 'catering', open: true }),
  P({ kind: 'purchase', key: 'craft', account: '3410', description: 'Craft services', amount: 480, category: 'Craft' }),
  // Post (4100-4300)
  L({ kind: 'labour', key: 'editorLabour', account: '4101', description: 'Picture Editor – assembly to director’s cut', person: { type: 'crew', key: 'editor' }, role: 'Editor', rateType: 'shoot_day', days: 15, rate: 230, vendor: 'coEditor' }),
  L({ kind: 'labour', key: 'aeLabour', account: '4102', description: 'Assistant Editor', person: { type: 'crew', key: 'assistantEditor' }, role: 'Assistant Editor', rateType: 'shoot_day', days: 10, rate: 140 }),
  R({ kind: 'rental', key: 'editSuite', account: '4103', description: 'Edit suite – 4 weeks', rateType: 'weekly', rate: 480, start: '2026-11-16', end: '2026-12-11', vendor: 'post', equipment: 'Edit suite and shared storage' }),
  L({ kind: 'labour', key: 'colourLabour', account: '4106', description: 'Colourist – 2-day grade', person: { type: 'crew', key: 'colourist' }, role: 'Colourist', rateType: 'shoot_day', days: 2, rate: 450, vendor: 'coColour' }),
  A({ kind: 'allow', key: 'conform', account: '4107', description: 'Online edit / conform', amount: 600, open: true }),
  L({ kind: 'labour', key: 'soundEdLabour', account: '4201', description: 'Supervising sound editor', person: { type: 'crew', key: 'soundEditor' }, role: 'Supervising Sound Editor', rateType: 'shoot_day', days: 6, rate: 260 }),
  P({ kind: 'purchase', key: 'mix', account: '4206', description: 'Re-recording mix – 2 days', amount: 1240, category: 'Post sound', service: 'Mix stage' }),
  A({ kind: 'allow', key: 'mastering', account: '4301', description: 'Mastering', amount: 400, open: true }),
  P({ kind: 'purchase', key: 'dcp', account: '4302', description: 'DCP creation', amount: 450, vendor: 'dcp', category: 'Deliverables', service: 'DCP authoring' }),
  P({ kind: 'purchase', key: 'qc', account: '4303', description: 'QC / compliance report', amount: 250, vendor: 'dcp', category: 'Deliverables', service: 'Technical QC' }),
  A({ kind: 'allow', key: 'subtitles', account: '4305', description: 'Subtitles / captions (English SDH)', amount: 320, open: true }),
]

// ─── Purchase orders ─────────────────────────────────────────────────────────

export type PoStatus = 'draft' | 'issued' | 'approved' | 'closed' | 'cancelled'
export type PoDef = {
  key: string; vendor: VendorKey; number: string; description: string; issue: string; due: string
  amount: number; status: PoStatus; notes: string; currency?: 'EUR'
  amendment?: { previous: number; reason: string }
}

export const POS: PoDef[] = [
  { key: 'ach', vendor: 'camera', number: 'PO-ACH-001', description: 'Camera package – 2 week hire (30 Oct – 12 Nov)', issue: '2026-09-14', due: '2026-10-30', amount: 2300, status: 'approved', notes: 'Booking deposit 50%, balance on return.' },
  { key: 'sql', vendor: 'lighting', number: 'PO-SQL-001', description: 'Lighting and grip package – 2 week hire', issue: '2026-09-15', due: '2026-10-30', amount: 3800, status: 'approved', notes: 'Lighting £2,600 + grip £1,200. 50% deposit.' },
  { key: 'psh', vendor: 'sound', number: 'PO-PSH-001', description: 'Sound kit – 2 week hire', issue: '2026-09-16', due: '2026-10-30', amount: 1560, status: 'approved', notes: 'Paid up front.' },
  { key: 'muc', vendor: 'catering', number: 'PO-MUC-001', description: 'Unit catering – 7 shoot days', issue: '2026-09-18', due: '2026-11-12', amount: 2940, status: 'approved', notes: 'Original PO £2,576; amended to cover night-day covers and a hot supper on day 3.', amendment: { previous: 2576, reason: 'Added 12 covers/day for the two night days (5 and 7) and a hot supper on day 3 (pub).' } },
  { key: 'orv1', vendor: 'vehicles', number: 'PO-ORV-001', description: 'Unit vans – 3 vans × 7 days (first quote)', issue: '2026-09-18', due: '2026-11-12', amount: 1640, status: 'cancelled', notes: 'Superseded by PO-ORV-002 after the plan dropped to 2 vans.' },
  { key: 'orv2', vendor: 'vehicles', number: 'PO-ORV-002', description: 'Unit vans – 2 vans × 7 days', issue: '2026-09-25', due: '2026-11-12', amount: 1330, status: 'approved', notes: 'Replaces PO-ORV-001.' },
  { key: 'tcb', vendor: 'bus', number: 'PO-TCB-001', description: 'Static bus + driver for scene 1 (day 6)', issue: '2026-10-02', due: '2026-11-09', amount: 620, status: 'issued', notes: 'Awaiting EP approval (above £500 threshold, below the £2,500 EP limit).' },
  { key: 'ccl', vendor: 'lodging', number: 'PO-CCL-001', description: 'Cast accommodation – 3 rooms × 4 nights', issue: '2026-09-12', due: '2026-11-11', amount: 1280, status: 'approved', notes: '50% deposit, 50% at check-out.' },
  { key: 'hcw', vendor: 'costume', number: 'PO-HCW-001', description: 'Costume hire – principals and day players', issue: '2026-09-28', due: '2026-11-12', amount: 680, status: 'approved', notes: 'Deposit now, balance on return.' },
  { key: 'rpd', vendor: 'props', number: 'PO-RPD-001', description: 'Props hire – flats and café', issue: '2026-10-01', due: '2026-11-12', amount: 480, status: 'draft', notes: 'Still draft — the vendor invoiced early (see RPD-0075).' },
  { key: 'cph', vendor: 'post', number: 'PO-CPH-001', description: 'Edit suite – 4 weeks from 16 Nov', issue: '2026-10-02', due: '2026-11-16', amount: 1920, status: 'issued', notes: 'Held; awaiting picture-lock dates.' },
  { key: 'mdd', vendor: 'dcp', number: 'PO-MDD-001', description: 'DCP authoring and QC', issue: '2026-10-02', due: '2027-02-12', amount: 700, status: 'draft', notes: 'Draft until delivery spec is confirmed with the festival.' },
  { key: 'pce', vendor: 'extras', number: 'PO-PCE-001', description: 'Supporting artists – 8 SA-days + booking fee', issue: '2026-09-22', due: '2026-11-11', amount: 1310, status: 'approved', notes: 'Booking fee £350 now, SA days £960 on completion.' },
  { key: 'rlr', vendor: 'lenses', number: 'PO-RLR-001', description: 'Special lens set hire – 2 weeks (EUR)', issue: '2026-09-20', due: '2026-10-30', amount: 1200, status: 'approved', currency: 'EUR', notes: 'EUR 1,200; 50% deposit. Exchange rate locked at 0.86 GBP per EUR.' },
  { key: 'gbv', vendor: 'venues', number: 'PO-GBV-001', description: 'Pub hire – The Goose and Gander, day 3', issue: '2026-09-21', due: '2026-11-04', amount: 900, status: 'approved', notes: 'Deposit 50% on signing.' },
  { key: 'sfn1', vendor: 'safety', number: 'PO-SFN-001', description: 'Safety kit and PPE', issue: '2026-09-10', due: '2026-09-30', amount: 320, status: 'closed', notes: 'Delivered and paid in full.' },
  { key: 'sfn2', vendor: 'safety', number: 'PO-SFN-002', description: 'Set medic – 7 shoot days', issue: '2026-10-02', due: '2026-11-12', amount: 1540, status: 'issued', notes: 'Awaiting approval.' },
  { key: 'npp', vendor: 'permits', number: 'PO-NPP-001', description: 'Park filming permit and parking suspension', issue: '2026-09-15', due: '2026-10-06', amount: 480, status: 'closed', notes: 'Fully invoiced and paid.' },
  { key: 'idb', vendor: 'data', number: 'PO-IDB-001', description: 'RAID drives (×3) and backup service', issue: '2026-09-30', due: '2026-10-16', amount: 780, status: 'approved', notes: 'Delivered 2 Oct.' },
]

// ─── Invoices ────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'received' | 'approved' | 'paid' | 'overdue'
export type InvoiceDef = {
  key: string; vendor: VendorKey; number: string; issue: string; due: string
  net: number; tax: number; status: InvoiceStatus; po?: string; notes: string; currency?: 'EUR'
}

export const INVOICES: InvoiceDef[] = [
  { key: 'acha', vendor: 'camera', number: 'ACH-0412', issue: '2026-09-24', due: '2026-10-08', net: 1150, tax: 230, status: 'approved', po: 'ach', notes: 'Camera package booking deposit (50%).' },
  { key: 'achb', vendor: 'camera', number: 'ACH-0455', issue: '2026-11-12', due: '2026-11-26', net: 1150, tax: 230, status: 'draft', po: 'ach', notes: 'Camera package balance — expected on return.' },
  { key: 'sqla', vendor: 'lighting', number: 'SQL-2231', issue: '2026-09-28', due: '2026-10-12', net: 1900, tax: 380, status: 'received', po: 'sql', notes: 'Lighting + grip deposit (50%).' },
  { key: 'sqlb', vendor: 'lighting', number: 'SQL-2290', issue: '2026-11-12', due: '2026-11-26', net: 1900, tax: 380, status: 'draft', po: 'sql', notes: 'Lighting + grip balance.' },
  { key: 'psh', vendor: 'sound', number: 'PSH-0087', issue: '2026-09-30', due: '2026-10-14', net: 1560, tax: 312, status: 'received', po: 'psh', notes: 'Sound kit — 2 weeks, paid up front.' },
  { key: 'muca', vendor: 'catering', number: 'MUC-1021', issue: '2026-10-01', due: '2026-10-15', net: 700, tax: 140, status: 'approved', po: 'muc', notes: 'Catering deposit.' },
  { key: 'mucb', vendor: 'catering', number: 'MUC-1058', issue: '2026-11-12', due: '2026-11-26', net: 2240, tax: 448, status: 'draft', po: 'muc', notes: 'Catering balance after wrap (700 + 2,240 = PO 2,940).' },
  { key: 'ccla', vendor: 'lodging', number: 'CCL-0307', issue: '2026-09-18', due: '2026-10-02', net: 640, tax: 128, status: 'overdue', po: 'ccl', notes: 'Cast accommodation deposit — 2 days past due.' },
  { key: 'cclb', vendor: 'lodging', number: 'CCL-0344', issue: '2026-11-11', due: '2026-11-25', net: 640, tax: 128, status: 'draft', po: 'ccl', notes: 'Cast accommodation balance.' },
  { key: 'nsi', vendor: 'insurance', number: 'NSI-7712', issue: '2026-09-10', due: '2026-09-24', net: 1950, tax: 0, status: 'paid', notes: 'Production insurance package (premium and IPT, no VAT).' },
  { key: 'all1', vendor: 'legal', number: 'ALL-0562', issue: '2026-09-05', due: '2026-09-19', net: 1200, tax: 240, status: 'paid', notes: 'Contracts retainer.' },
  { key: 'all2', vendor: 'legal', number: 'ALL-0601', issue: '2026-10-02', due: '2026-10-16', net: 600, tax: 120, status: 'received', notes: 'Location agreements and music-clearance advice.' },
  { key: 'ppsa', vendor: 'payroll', number: 'PPS-3345', issue: '2026-09-30', due: '2026-10-14', net: 240, tax: 48, status: 'approved', notes: 'Payroll set-up fee. (No PO — deliberately unreconciled to a budget line.)' },
  { key: 'hcwa', vendor: 'costume', number: 'HCW-0198', issue: '2026-10-02', due: '2026-10-16', net: 340, tax: 68, status: 'received', po: 'hcw', notes: 'Costume hire deposit.' },
  { key: 'hcwb', vendor: 'costume', number: 'HCW-0231', issue: '2026-11-12', due: '2026-11-26', net: 340, tax: 68, status: 'draft', po: 'hcw', notes: 'Costume hire balance.' },
  { key: 'rpd', vendor: 'props', number: 'RPD-0075', issue: '2026-10-02', due: '2026-10-16', net: 240, tax: 48, status: 'received', po: 'rpd', notes: 'Props hire deposit — PO is still a draft, so this invoice cannot be approved yet.' },
  { key: 'cph', vendor: 'post', number: 'CPH-0501', issue: '2026-11-16', due: '2026-11-30', net: 480, tax: 96, status: 'draft', po: 'cph', notes: 'Edit suite week 1.' },
  { key: 'pcea', vendor: 'extras', number: 'PCE-4410', issue: '2026-09-29', due: '2026-10-13', net: 350, tax: 70, status: 'approved', po: 'pce', notes: 'SA booking fee.' },
  { key: 'pceb', vendor: 'extras', number: 'PCE-4455', issue: '2026-11-11', due: '2026-11-25', net: 960, tax: 192, status: 'draft', po: 'pce', notes: 'SA days (8 × £120).' },
  { key: 'rlra', vendor: 'lenses', number: 'RLR-6620', issue: '2026-09-26', due: '2026-10-10', net: 600, tax: 0, status: 'approved', po: 'rlr', currency: 'EUR', notes: 'EUR 600 deposit (50%); VAT reverse-charge.' },
  { key: 'rlrb', vendor: 'lenses', number: 'RLR-6688', issue: '2026-11-11', due: '2026-11-25', net: 600, tax: 0, status: 'draft', po: 'rlr', currency: 'EUR', notes: 'EUR 600 balance on return.' },
  { key: 'gbva', vendor: 'venues', number: 'GBV-0033', issue: '2026-10-01', due: '2026-10-08', net: 450, tax: 90, status: 'approved', po: 'gbv', notes: 'Pub hire deposit (50%).' },
  { key: 'gbvb', vendor: 'venues', number: 'GBV-0049', issue: '2026-11-04', due: '2026-11-18', net: 450, tax: 90, status: 'draft', po: 'gbv', notes: 'Pub hire balance.' },
  { key: 'npp', vendor: 'permits', number: 'NPP-0912', issue: '2026-09-22', due: '2026-10-06', net: 480, tax: 0, status: 'paid', po: 'npp', notes: 'Park filming permit and parking suspension (fees, no VAT).' },
  { key: 'idb', vendor: 'data', number: 'IDB-0145', issue: '2026-10-02', due: '2026-10-16', net: 780, tax: 156, status: 'received', po: 'idb', notes: 'RAID drives and backup service.' },
  { key: 'spc', vendor: 'print', number: 'SPC-2210', issue: '2026-10-01', due: '2026-10-15', net: 180, tax: 36, status: 'approved', notes: 'Script printing.' },
  { key: 'sfn1', vendor: 'safety', number: 'SFN-0098', issue: '2026-09-15', due: '2026-09-29', net: 320, tax: 64, status: 'paid', po: 'sfn1', notes: 'First-aid and PPE kit.' },
  { key: 'orv', vendor: 'vehicles', number: 'ORV-0882', issue: '2026-11-12', due: '2026-11-26', net: 1330, tax: 266, status: 'draft', po: 'orv2', notes: 'Van hire — expected after return.' },
  { key: 'tcb', vendor: 'bus', number: 'TCB-0071', issue: '2026-10-03', due: '2026-10-17', net: 310, tax: 62, status: 'received', po: 'tcb', notes: 'Bus hire deposit (50%) — PO still awaiting approval.' },
  { key: 'opo1', vendor: 'office', number: 'OPO-0316', issue: '2026-10-01', due: '2026-10-15', net: 840, tax: 168, status: 'approved', notes: 'Production office, 4 weeks from 5 Oct.' },
  { key: 'opo2', vendor: 'office', number: 'OPO-0371', issue: '2026-11-02', due: '2026-11-16', net: 840, tax: 168, status: 'draft', notes: 'Production office, weeks 5–8.' },
  { key: 'nlh', vendor: 'hosts', number: 'NLH-0012', issue: '2026-10-01', due: '2026-10-15', net: 500, tax: 0, status: 'paid', notes: 'Householder damage deposits (refundable), 4 flats.' },
  { key: 'tv1', vendor: 'coDirector', number: 'TV-001', issue: '2026-10-02', due: '2026-10-16', net: 1500, tax: 300, status: 'received', notes: 'Director — 6 prep days.' },
  { key: 'roa', vendor: 'coAd', number: 'ROA-003', issue: '2026-10-02', due: '2026-10-16', net: 560, tax: 0, status: 'approved', notes: '1st AD — 2 prep days (not VAT-registered).' },
  { key: 'adv', vendor: 'coDesign', number: 'ADV-020', issue: '2026-09-25', due: '2026-10-09', net: 1380, tax: 276, status: 'approved', notes: 'Production Designer — 6 prep days.' },
  { key: 'lec', vendor: 'coDop', number: 'LEC-014', issue: '2026-10-02', due: '2026-10-16', net: 1280, tax: 256, status: 'received', notes: 'DoP — 4 prep days (recce and tests).' },
  { key: 'gpl', vendor: 'coGaffer', number: 'GPL-007', issue: '2026-09-18', due: '2026-10-02', net: 250, tax: 50, status: 'overdue', notes: 'Gaffer — recce day. Past due.' },
  { key: 'mk1', vendor: 'coScript', number: 'MK-011', issue: '2026-11-13', due: '2026-11-27', net: 1840, tax: 0, status: 'draft', notes: 'Script Supervisor — 8 days, expected after wrap (not VAT-registered).' },
]

// ─── Expenses ────────────────────────────────────────────────────────────────

type ExpBase = {
  key: string; account: string; date: string; item?: string; vendor?: VendorKey; notes: string
  invoice?: string; po?: string; poAllocated?: number; matched?: number; vat?: number
  vatReclaim?: { amount: number; date: string; ref: string }
}
export type ExpenseDef =
  | (ExpBase & { kind: 'deposit'; amount: number; refundable: 'refundable' | 'non_refundable'; description: string; location?: LocationKey })
  | (ExpBase & { kind: 'purchase'; amount: number; description: string; category: string; service?: string; location?: LocationKey })
  | (ExpBase & { kind: 'allow'; amount: number; description: string })
  | (ExpBase & { kind: 'rental'; rateType: 'daily' | 'weekly' | 'flat'; rate: number; start: string; end: string; description: string; equipment?: string; overrideDays?: number })
  | (ExpBase & { kind: 'labour'; person: { type: 'crew' | 'cast'; key: string }; role: string; rateType: 'prep_day' | 'shoot_day' | 'overtime'; days: number; rate: number; start: string; end: string })

export const EXPENSES: ExpenseDef[] = [
  { key: 'e_acha', kind: 'deposit', account: '2406', date: '2026-09-24', item: 'camera', vendor: 'camera', amount: 1150, refundable: 'non_refundable', description: 'Camera package booking deposit (50%)', notes: 'Booking deposit — ACH-0412', invoice: 'acha', po: 'ach', matched: 1150, vat: 20 },
  { key: 'e_sqll', kind: 'deposit', account: '2604', date: '2026-09-28', item: 'lighting', vendor: 'lighting', amount: 1300, refundable: 'non_refundable', description: 'Lighting hire deposit (50%)', notes: 'Lighting deposit — SQL-2231', invoice: 'sqla', po: 'sql', poAllocated: 1300, matched: 1300, vat: 20 },
  { key: 'e_sqlg', kind: 'deposit', account: '2504', date: '2026-09-28', item: 'grip', vendor: 'lighting', amount: 600, refundable: 'non_refundable', description: 'Grip hire deposit (50%)', notes: 'Grip deposit — SQL-2231', invoice: 'sqla', po: 'sql', poAllocated: 600, matched: 600, vat: 20 },
  { key: 'e_psh', kind: 'rental', account: '2704', date: '2026-09-30', item: 'soundKit', vendor: 'sound', rateType: 'weekly', rate: 780, start: '2026-10-30', end: '2026-11-12', description: 'Sound kit – 2 week hire', equipment: 'Recorder/mixer, radio mics, booms, playback', notes: 'Prepaid hire — PSH-0087', invoice: 'psh', po: 'psh', matched: 1560, vat: 20 },
  { key: 'e_muca', kind: 'deposit', account: '3409', date: '2026-10-01', item: 'catering', vendor: 'catering', amount: 700, refundable: 'non_refundable', description: 'Unit catering booking deposit', notes: 'Catering deposit — MUC-1021', invoice: 'muca', po: 'muc', matched: 700, vat: 20 },
  { key: 'e_ccla', kind: 'deposit', account: '1502', date: '2026-09-18', item: 'accomm', vendor: 'lodging', amount: 640, refundable: 'non_refundable', description: 'Cast accommodation deposit (50%)', notes: 'Accommodation deposit — CCL-0307 (overdue)', invoice: 'ccla', po: 'ccl', matched: 640, vat: 20 },
  { key: 'e_nsi', kind: 'purchase', account: '2306', date: '2026-09-10', item: 'insurance', vendor: 'insurance', amount: 1950, description: 'Production insurance package', category: 'Insurance', service: 'Short-film package', notes: 'Insurance — NSI-7712', invoice: 'nsi', matched: 1950 },
  { key: 'e_all1', kind: 'purchase', account: '2304', date: '2026-09-05', item: 'legal', vendor: 'legal', amount: 1200, description: 'Legal – contracts retainer', category: 'Legal', service: 'Production legal', notes: 'Legal retainer — ALL-0562', invoice: 'all1', matched: 1200, vat: 20, vatReclaim: { amount: 240, date: '2026-10-02', ref: 'VAT-RET-2026-Q3 (demo)' } },
  { key: 'e_all2', kind: 'purchase', account: '2304', date: '2026-10-02', item: 'legal', vendor: 'legal', amount: 600, description: 'Legal – location agreements and music advice', category: 'Legal', service: 'Production legal', notes: 'Legal — ALL-0601', invoice: 'all2', matched: 600, vat: 20 },
  { key: 'e_ppsa', kind: 'purchase', account: '2303', date: '2026-09-30', vendor: 'payroll', amount: 240, description: 'Payroll set-up fee', category: 'Payroll', service: 'Payroll bureau', notes: 'Payroll set-up — PPS-3345 (not matched to a budget line)', invoice: 'ppsa', vat: 20 },
  { key: 'e_hcwa', kind: 'deposit', account: '2905', date: '2026-10-02', item: 'costumeHire', vendor: 'costume', amount: 340, refundable: 'non_refundable', description: 'Costume hire deposit', notes: 'Costume deposit — HCW-0198', invoice: 'hcwa', po: 'hcw', matched: 340, vat: 20 },
  { key: 'e_rpd', kind: 'purchase', account: '3010', date: '2026-10-02', item: 'propsHire', vendor: 'props', amount: 240, description: 'Props hire deposit', category: 'Props', notes: 'Props deposit — RPD-0075 (PO still draft)', invoice: 'rpd', po: 'rpd', matched: 240, vat: 20 },
  { key: 'e_pcea', kind: 'purchase', account: '3301', date: '2026-09-29', item: 'castingFee', vendor: 'extras', amount: 350, description: 'SA agency booking fee', category: 'Casting', service: 'SA agency booking fee', notes: 'SA booking fee — PCE-4410', invoice: 'pcea', po: 'pce', matched: 350, vat: 20 },
  { key: 'e_rlra', kind: 'deposit', account: '2407', date: '2026-09-26', item: 'lenses', vendor: 'lenses', amount: 516, refundable: 'non_refundable', description: 'Special lens set deposit (EUR 600 at 0.86)', notes: 'EUR 600 × 0.86 — RLR-6620', invoice: 'rlra', po: 'rlr', matched: 516 },
  { key: 'e_gbva', kind: 'deposit', account: '3104', date: '2026-10-01', item: 'feePub', vendor: 'venues', amount: 450, refundable: 'non_refundable', description: 'Pub hire deposit (50%)', location: 'gooseAndGander', notes: 'Pub deposit — GBV-0033', invoice: 'gbva', po: 'gbv', matched: 450, vat: 20 },
  { key: 'e_npp', kind: 'purchase', account: '3105', date: '2026-09-22', item: 'permits', vendor: 'permits', amount: 480, description: 'Park filming permit and parking suspension', category: 'Permits', service: 'Permit and parking fees', location: 'park', notes: 'Permit fees — NPP-0912', invoice: 'npp', po: 'npp', matched: 480 },
  { key: 'e_idb', kind: 'purchase', account: '3204', date: '2026-10-02', item: 'dataDrives', vendor: 'data', amount: 780, description: 'RAID drives (×3) and backup', category: 'Storage', notes: 'Storage — IDB-0145', invoice: 'idb', po: 'idb', matched: 780, vat: 20 },
  { key: 'e_spc', kind: 'purchase', account: '1107', date: '2026-10-01', item: 'printing', vendor: 'print', amount: 180, description: 'Script printing', category: 'Printing', notes: 'Printing — SPC-2210', invoice: 'spc', matched: 180, vat: 20 },
  { key: 'e_sfn1', kind: 'purchase', account: '2103', date: '2026-09-15', item: 'ppe', vendor: 'safety', amount: 320, description: 'First-aid and PPE kit', category: 'Safety', notes: 'PPE — SFN-0098', invoice: 'sfn1', po: 'sfn1', matched: 320, vat: 20 },
  { key: 'e_tcb', kind: 'deposit', account: '2506', date: '2026-10-03', item: 'busHire', vendor: 'bus', amount: 310, refundable: 'non_refundable', description: 'Bus hire deposit (50%)', notes: 'Bus deposit — TCB-0071', invoice: 'tcb', po: 'tcb', matched: 310, vat: 20 },
  { key: 'e_opo1', kind: 'rental', account: '3404', date: '2026-10-01', item: 'officeRent', vendor: 'office', rateType: 'weekly', rate: 210, start: '2026-10-05', end: '2026-11-01', description: 'Production office – weeks 1–4', equipment: 'Desk space, meeting room, printer', notes: 'Office rent — OPO-0316', invoice: 'opo1', matched: 840, vat: 20 },
  { key: 'e_nlh', kind: 'deposit', account: '3104', date: '2026-10-01', item: 'locDeposits', vendor: 'hosts', amount: 500, refundable: 'refundable', description: 'Householder damage deposits (4 flats × £125)', notes: 'Refundable deposits — NLH-0012', invoice: 'nlh', matched: 500 },
  { key: 'e_tv1', kind: 'labour', account: '1301', date: '2026-10-02', item: 'directorLabour', vendor: 'coDirector', person: { type: 'crew', key: 'director' }, role: 'Director', rateType: 'prep_day', days: 6, rate: 250, start: '2026-09-21', end: '2026-10-01', notes: 'Director prep — TV-001', invoice: 'tv1', matched: 1500, vat: 20 },
  { key: 'e_roa', kind: 'labour', account: '1302', date: '2026-10-02', item: 'adLabour', vendor: 'coAd', person: { type: 'crew', key: 'firstAd' }, role: '1st Assistant Director', rateType: 'prep_day', days: 2, rate: 280, start: '2026-09-29', end: '2026-09-30', notes: '1st AD prep — ROA-003', invoice: 'roa', matched: 560 },
  { key: 'e_adv', kind: 'labour', account: '3001', date: '2026-09-25', item: 'pdLabour', vendor: 'coDesign', person: { type: 'crew', key: 'productionDesigner' }, role: 'Production Designer', rateType: 'prep_day', days: 6, rate: 230, start: '2026-09-14', end: '2026-09-24', notes: 'Production Designer prep — ADV-020', invoice: 'adv', matched: 1380, vat: 20 },
  { key: 'e_lec', kind: 'labour', account: '2401', date: '2026-10-02', item: 'dopLabour', vendor: 'coDop', person: { type: 'crew', key: 'dop' }, role: 'Director of Photography', rateType: 'prep_day', days: 4, rate: 320, start: '2026-09-21', end: '2026-10-01', notes: 'DoP recce and tests — LEC-014', invoice: 'lec', matched: 1280, vat: 20 },
  { key: 'e_gpl', kind: 'labour', account: '2601', date: '2026-09-18', item: 'gafferLabour', vendor: 'coGaffer', person: { type: 'crew', key: 'gaffer' }, role: 'Gaffer', rateType: 'prep_day', days: 1, rate: 250, start: '2026-09-17', end: '2026-09-17', notes: 'Gaffer recce day — GPL-007 (overdue)', invoice: 'gpl', matched: 250, vat: 20 },
  // Petty cash (floats) — no vendor invoice
  { key: 'e_pc1', kind: 'purchase', account: '3008', date: '2026-10-03', item: 'dressing', amount: 86.4, description: 'Charity-shop dressing haul (art float)', category: 'Set dressing', notes: 'Cash — art dept dressing haul', matched: 86.4 },
  { key: 'e_pc2', kind: 'purchase', account: '3009', date: '2026-10-02', item: 'propsBuy', amount: 42.15, description: 'Clipper lighters, poker chips, blister packs (art float)', category: 'Props', notes: 'Cash — props sundries', matched: 42.15 },
  { key: 'e_pc3', kind: 'allow', account: '2507', date: '2026-10-01', amount: 38.7, description: 'Recce travel – tram fares and fuel (production float)', notes: 'Cash — recce travel (not matched to a budget line)' },
  { key: 'e_pc4', kind: 'purchase', account: '3406', date: '2026-10-03', item: 'supplies', amount: 27.6, description: 'Continuity folders and slate labels (production float)', category: 'Office', notes: 'Cash — continuity folders for the script supervisor', matched: 27.6 },
]

// ─── Floats ──────────────────────────────────────────────────────────────────

export type FloatDef = {
  key: string; person: string; item: string; amount: number; issued: string; notes: string
  links: Array<{ expense: string; matched: number }>
}
export const FLOATS: FloatDef[] = [
  { key: 'artFloat', person: 'buyer', item: 'dressing', amount: 400, issued: '2026-09-29', notes: 'Art department petty cash for the prep weeks. Receipts to the cashier within 24 hours.', links: [{ expense: 'e_pc1', matched: 86.4 }, { expense: 'e_pc2', matched: 42.15 }] },
  { key: 'prodFloat', person: 'cashier', item: 'supplies', amount: 300, issued: '2026-10-01', notes: 'Production office float for recces and sundries.', links: [{ expense: 'e_pc3', matched: 38.7 }, { expense: 'e_pc4', matched: 27.6 }] },
]
