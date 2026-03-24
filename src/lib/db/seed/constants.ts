/**
 * Fixed UUIDs for demo production datasets. Deterministic and stable.
 * Mint Heist (non-episodic) and North Shore (episodic) use distinct prefixes.
 */
export const DEMO_SLUG = 'demo-production-albatross'
/** Episodic companion demo: multi-episode, blocs, scoped music/deliverables. See demoProductionSeed header. */
export const DEMO_EPISODIC_SLUG = 'demo-episodic-north-shore'

const demoEntityIds = (P: string) =>
  ({
    production: `${P}0001`,
    unitMain: `${P}0002`,
    unitSecond: `${P}0003`,
    shootDay: (n: number) => `${P}${String(100 + n).padStart(4, '0')}`,
    scene: (n: number) => `${P}${String(200 + n).padStart(4, '0')}`,
    shot: (n: number) => `${P}${String(400 + n).padStart(4, '0')}`,
    person: (n: number) => `${P}${String(500 + n).padStart(4, '0')}`,
    crewBooking: (n: number) => `${P}${String(6500 + n).padStart(4, '0')}`,
    crewVendor: (n: number) => `${P}${String(1718 + n).padStart(4, '0')}`,
    crewVendorInvoice: (n: number) => `${P}${String(1815 + n).padStart(4, '0')}`,
    location: (n: number) => `${P}${String(600 + n).padStart(4, '0')}`,
    budgetCat: (n: number) => `${P}${String(700 + n).padStart(4, '0')}`,
    budgetItem: (n: number) => `${P}${String(800 + n).padStart(4, '0')}`,
    expense: (n: number) => `${P}${String(900 + n).padStart(4, '0')}`,
    keyContact: (n: number) => `${P}${String(1000 + n).padStart(4, '0')}`,
    document: (n: number) => `${P}${String(1100 + n).padStart(4, '0')}`,
    deliverable: (n: number) => `${P}${String(1200 + n).padStart(4, '0')}`,
    technicalSpec: (n: number) => `${P}${String(1300 + n).padStart(4, '0')}`,
    musicTrack: (n: number) => `${P}${String(1400 + n).padStart(4, '0')}`,
    clearance: (n: number) => `${P}${String(1500 + n).padStart(4, '0')}`,
    strip: (n: number) => `${P}${String(2000 + n).padStart(4, '0')}`,
    shootDayUnit: (dayIdx: number, unitIdx: number) =>
      `${P}${String(3000 + dayIdx * 2 + unitIdx).padStart(4, '0')}`,
    sceneCast: (n: number) => `${P}${String(4000 + n).padStart(4, '0')}`,
    shotCast: (n: number) => `${P}${String(4100 + n).padStart(4, '0')}`,
    availability: (n: number) => `${P}${String(5000 + n).padStart(4, '0')}`,
    booking: (n: number) => `${P}${String(6200 + n).padStart(4, '0')}`,
    locationScene: (n: number) => `${P}${String(6000 + n).padStart(4, '0')}`,
    stripboardItem: (n: number) => `${P}${String(7000 + n).padStart(4, '0')}`,
    cueSheet: `${P}7999`,
    equipmentTerm: (n: number) => `${P}${String(1600 + n).padStart(4, '0')}`,
    taskSection: (n: number) => `${P}${String(8000 + n).padStart(4, '0')}`,
    task: (n: number) => `${P}${String(8100 + n).padStart(4, '0')}`,
    reconciliationLink: (n: number) => `${P}${String(8500 + n).padStart(4, '0')}`,
    vendor: (n: number) => `${P}${String(1700 + n).padStart(4, '0')}`,
    vendorInvoice: (n: number) => `${P}${String(1800 + n).padStart(4, '0')}`,
    vendorPO: (n: number) => `${P}${String(1900 + n).padStart(4, '0')}`,
    invoiceReminderTask: (n: number) => `${P}${String(8200 + n).padStart(4, '0')}`,
    crewLabourInvoiceReminderTask: (n: number) => `${P}${String(8350 + n).padStart(4, '0')}`,
    vendorInvoiceExpenseLink: (n: number) => `${P}${String(8600 + n).padStart(4, '0')}`,
    vendorPOExpenseLink: (n: number) => `${P}${String(8700 + n).padStart(4, '0')}`,
    equipment: (n: number) => `${P}${String(8300 + n).padStart(4, '0')}`,
    equipmentItemUuid: (n: number) => `${P}${String(8400 + n).padStart(4, '0')}`,
    equipmentList: (n: number) => `${P}${String(8500 + n).padStart(4, '0')}`,
    equipmentListItem: (n: number) => `${P}${String(8750 + n).padStart(4, '0')}`,
    equipmentReminderTask: (n: number) => `${P}${String(8220 + n).padStart(4, '0')}`,
  }) as const

const P_MINT = 'a1000000-0000-4000-8000-00000000'
const P_EPISODIC = 'a2000000-0000-4000-8000-00000000'

/** Non-episodic Mint Heist singleton demo IDs. */
export const IDS = demoEntityIds(P_MINT)

/**
 * Episodic demo production IDs (North Shore). Same shape as IDS; plus episode and shooting-bloc ids
 * in reserved numeric ranges (no collision with scene/shot/strip ids).
 */
export const EPISODIC_DEMO_IDS = {
  ...demoEntityIds(P_EPISODIC),
  episode: (n: number) => `${P_EPISODIC}${String(180 + n).padStart(4, '0')}`,
  shootingBloc: (n: number) => `${P_EPISODIC}${String(270 + n).padStart(4, '0')}`,
  /** Avoid collisions with scene_cast ids (4000+n) when North Shore generates many shot_cast rows. */
  shotCast: (n: number) => `${P_EPISODIC}${String(5600 + n).padStart(4, '0')}`,
}

/**
 * Stripboard SHOT rows per shoot day (five scene indices each) for the North Shore episodic demo.
 * Scenes 1–10 / 11–20 / 21–30 map to Episodes 1–3. Each day mixes episodes within a bloc (realistic block shooting).
 * Day 7 starts bloc 2 (boundary).
 */
export const EPISODIC_DEMO_MIXED_STRIP_SCENES: number[][] = [
  [1, 14, 25, 3, 18],
  [11, 2, 28, 12, 6],
  [21, 5, 16, 22, 9],
  [4, 19, 27, 8, 13],
  [17, 24, 29, 10, 7],
  [20, 1, 26, 15, 30],
  [23, 11, 4, 14, 2],
  [6, 25, 12, 21, 28],
  [18, 3, 20, 27, 9],
  [13, 22, 7, 16, 1],
  [30, 10, 19, 5, 24],
  [8, 29, 15, 26, 11],
]

export const SEED_VERSION = '4'

/** Fixed id for demo-seeded GBP→USD rate so reset can remove only this row. */
export const DEMO_EXCHANGE_RATE_ID = 'a1000000-0000-4000-8000-0000demoexch01'
