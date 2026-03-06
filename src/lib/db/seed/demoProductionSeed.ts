/**
 * Deterministic demo production seed. All operations target slug = DEMO_SLUG only.
 * Never delete or match by name; never touch non-demo productions.
 *
 * Shot list seed (Shot Lists page):
 * - Edge cases: 10+ shots with NULL lens/shot_size/camera_movement/duration_seconds (shots 1-10);
 *   ­3 shots with very long notes (truncation/tooltip); 2× duration_seconds=0, 2× duration_seconds=60;
 *   every camera_movement enum at least once.
 * - Lens suggestions: 25+ shots use "24mm", 25+ use "35mm", 10+ use "24–70mm"; unique set in equipment_terms.
 * - equipment_terms: LENS (18mm, 24mm, 35mm, 50mm, 85mm, 100mm Macro, 24–70mm, 70–200mm) and SUPPORT terms.
 * - Verify: Schedule → Shot lists, pick a scene; check columns, lens/support dropdowns, null handling, long notes.
 */
import { executeBatch, getDb, now } from '../client'
import { getProductionBySlug, hardDeleteProduction } from '../repositories/production'
import { seedDemoBudget } from './demoBudgetSeed'
import { seedDemoReconciliation } from './demoReconciliationSeed'
import { seedDemoTasks } from './demoTaskSeed'
import { listDocumentsByProduction } from '../repositories/document'
import { BaseDirectory, mkdir, remove, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { generateCueSheet, generateLocationReleaseCover, generateContributorFormCover } from '@/lib/pdf'
import type { CameraMovement, ShotSize } from '../types'
import { CAMERA_MOVEMENT_VALUES, SHOT_SIZE_VALUES } from '../types'
import { DEMO_EXCHANGE_RATE_ID, DEMO_SLUG, IDS, SEED_VERSION } from './constants'
import { getLastSeededAt, getSeedVersion, setSeedMeta } from './seedMeta'

const ATTACHMENTS = 'attachments'

/** Today's date in local time as YYYY-MM-DD (uses OS clock via Date). */
function todayLocalYYYYMMDD(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add days to a YYYY-MM-DD string using local date math; returns YYYY-MM-DD. */
function addDaysLocal(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const date = new Date(y!, m! - 1, d! + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Collect document file paths for a production (for filesystem cleanup after cascade delete). */
async function getDocumentFilePathsForProduction(productionId: string): Promise<string[]> {
  const docs = await listDocumentsByProduction(productionId)
  return docs
    .map((d) => d.file_path)
    .filter((p): p is string => !!p && p.startsWith(ATTACHMENTS + '/'))
}

/** Delete attachment files from disk by relative paths (AppData/attachments/...). */
async function deleteAttachmentFilesOnDisk(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await remove(p, { baseDir: BaseDirectory.AppData })
    } catch {
      // ignore missing files
    }
  }
}

/**
 * Hard-delete demo production and its attachment files. Only call with id where slug = DEMO_SLUG.
 * Gets document paths first (before cascade removes rows), then hard-deletes production (FK
 * cascades remove all children), then deletes files from disk.
 */
async function hardDeleteDemoAndRelated(productionId: string): Promise<void> {
  const paths = await getDocumentFilePathsForProduction(productionId)
  await hardDeleteProduction(productionId)
  await deleteAttachmentFilesOnDisk(paths)
}

/**
 * If demo production (by slug) exists, do nothing. Otherwise insert full demo dataset.
 */
export async function ensureDemoData(): Promise<void> {
  const existing = await getProductionBySlug(DEMO_SLUG)
  if (existing) return
  await runFullSeed()
}

/**
 * Find demo production by slug; hard-delete it and related rows and attachment files;
 * remove only the demo-seeded exchange rate (not user-fetched cache); then run ensureDemoData().
 * Does NOT reset user settings (display_currency, enable_currency_conversion_api).
 */
export async function resetDemoData(): Promise<void> {
  const prod = await getProductionBySlug(DEMO_SLUG)
  if (!prod) {
    await ensureDemoData()
    return
  }
  const db = await getDb()
  await db.execute(`DELETE FROM exchange_rates WHERE id = $1`, [DEMO_EXCHANGE_RATE_ID])
  await hardDeleteDemoAndRelated(prod.id)
  await runFullSeed()
}

export { getLastSeededAt, getSeedVersion }

const VERIFY_PID = 'b0000000-0000-4000-8000-000000000001'
const VERIFY_SLUG = 'verify-cascade-test'

/**
 * Dev-only: create a minimal production with a few child rows, hard-delete it, then verify
 * no child rows remain. Confirms FK ON DELETE CASCADE is working.
 * Uses executeBatch (no explicit BEGIN/COMMIT) to avoid "cannot start a transaction within a
 * transaction" with the Tauri plugin/sqlx; the batch runs as one write-queue task.
 */
export async function verifyCascades(): Promise<{ ok: boolean; message: string; details?: string }> {
  const db = await getDb()
  const ts = now()
  const tablesWithProductionId = [
    'units',
    'people',
    'locations',
    'scenes',
    'shoot_days',
    'documents',
    'budget_categories',
    'budget_accounts',
    'budget_items',
    'expenses',
    'stripboard_strips',
    'scene_cast',
    'cast_availability',
    'key_contacts',
    'call_sheets',
    'bookings',
    'equipment',
    'production_tasks',
    'deliverables',
    'music_tracks',
    'clearances',
    'cue_sheets',
    'script_documents',
    'equipment_terms',
  ]
  try {
    // Use executeBatch without explicit BEGIN/COMMIT: the Tauri plugin/sqlx can run multi-statement
    // strings in a way that causes "cannot start a transaction within a transaction" when we send
    // BEGIN/COMMIT (driver may wrap each statement or the batch in its own transaction).
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      {
        sql: `INSERT INTO productions (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        bindValues: [VERIFY_PID, 'Verify cascades', VERIFY_SLUG, 'GBP', null, ts, ts],
      },
      {
        sql: `INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        bindValues: ['b0000000-0000-4000-8000-000000000002', VERIFY_PID, 'Unit', ts, ts],
      },
      {
        sql: `INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ($1, $2, $3, 0, $4, $5)`,
        bindValues: ['b0000000-0000-4000-8000-000000000003', VERIFY_PID, 'Person', 0, ts, ts],
      },
      {
        sql: `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        bindValues: ['b0000000-0000-4000-8000-000000000004', VERIFY_PID, '1', ts, ts],
      },
      {
        sql: `INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        bindValues: ['b0000000-0000-4000-8000-000000000005', VERIFY_PID, '2025-01-01', ts, ts],
      },
      { sql: `DELETE FROM productions WHERE id = $1`, bindValues: [VERIFY_PID] },
    ]
    await executeBatch(db, statements)
    const remaining: string[] = []
    const prodRows = await db.select<Record<string, unknown>[]>(`SELECT id FROM productions WHERE id = $1`, [VERIFY_PID])
    if (prodRows.length > 0) remaining.push('productions')
    for (const table of tablesWithProductionId) {
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT 1 FROM ${table} WHERE production_id = $1 LIMIT 1`,
        [VERIFY_PID]
      )
      if (rows.length > 0) remaining.push(table)
    }
    if (remaining.length > 0) {
      return {
        ok: false,
        message: 'Cascade check failed: rows still exist after hard delete.',
        details: remaining.join(', '),
      }
    }
    return { ok: true, message: 'Cascades verified: hard delete removed production and all child rows.' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isBusy =
      /database is locked|sqlite_busy|sqlite_locked|code: 5|code: 6/i.test(msg)
    return {
      ok: false,
      message: isBusy
        ? 'Database was busy (another write in progress). Try again.'
        : 'Cascade verification threw.',
      details: import.meta.env.DEV ? `[Verify Cascades] ${msg}` : msg,
    }
  }
}

async function runFullSeed(): Promise<void> {
  const db = await getDb()
  const ts = now()
  const pid = IDS.production

  /*
   * Demo currency architecture:
   * - Demo production base currency = GBP. All budget values are stored in GBP.
   * - Display currency is a user preference (settings); may differ from GBP.
   * - Conversion API is disabled by default (enable_currency_conversion_api = "false").
   * - Duplication copies production.currency_code and all budget values unchanged.
   */

  // Remove any existing demo row (e.g. soft-deleted) so INSERT does not hit duplicate key
  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM productions WHERE id = $1 OR slug = $2`,
    [pid, DEMO_SLUG]
  )
  if (existing.length > 0) {
    const existingId = existing[0]!.id
    const paths = await getDocumentFilePathsForProduction(existingId)
    await hardDeleteProduction(existingId)
    await deleteAttachmentFilesOnDisk(paths)
  }

  await mkdir(ATTACHMENTS, { baseDir: BaseDirectory.AppData, recursive: true })

  await db.execute(
    `INSERT INTO productions (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [pid, 'Demo: The Mint Heist', DEMO_SLUG, 'GBP', 'Demo production for Albatross', ts, ts]
  )

  await db.execute(
    `INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)`,
    [IDS.unitMain, pid, 'Main Unit', ts, ts, IDS.unitSecond, pid, 'Second Unit', ts, ts]
  )

  const startDate = todayLocalYYYYMMDD()
  for (let d = 0; d < 12; d++) {
    const shootDate = addDaysLocal(startDate, d)
    await db.execute(
      `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, notes, weather_manual, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        IDS.shootDay(d + 1),
        pid,
        shootDate,
        d + 1,
        '07:00',
        d === 0 ? 'First day' : null,
        'Sunny',
        ts,
        ts,
      ]
    )
  }

  for (let d = 1; d <= 12; d++) {
    await db.execute(
      `INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, is_locked, created_at, updated_at)
       VALUES ($1, $2, $3, 0, $4, $5), ($6, $7, $8, 0, $9, $10)`,
      [
        IDS.shootDayUnit(d - 1, 0),
        IDS.shootDay(d),
        IDS.unitMain,
        ts,
        ts,
        IDS.shootDayUnit(d - 1, 1),
        IDS.shootDay(d),
        IDS.unitSecond,
        ts,
        ts,
      ]
    )
  }

  const DEMO_LOCATIONS: Array<{
    name: string
    booked_status: 'unbooked' | 'hold' | 'booked' | 'wrap'
    address: string
    availability_constraints: string | null
    permit_fee: number | null
    location_fee: number | null
    notes: string | null
  }> = [
    {
      name: 'Bank Interior',
      booked_status: 'hold',
      address: '101 Threadneedle St, London EC2R',
      availability_constraints: 'Weekdays only after 18:00',
      permit_fee: null,
      location_fee: 2500,
      notes: 'Contact concierge 30 minutes before arrival.',
    },
    {
      name: 'Street Exterior',
      booked_status: 'booked',
      address: '102 Victoria Embankment, London WC2',
      availability_constraints: 'Permit required for traffic control. No parking for large trucks.',
      permit_fee: 450,
      location_fee: null,
      notes: 'LCC permit secured. Use service entrance on tech scout and shoot days.',
    },
    {
      name: 'Warehouse',
      booked_status: 'hold',
      address: '103 Hackney Wick, London E9',
      availability_constraints: 'Rear loading access only. Limited power on site.',
      permit_fee: null,
      location_fee: 1200,
      notes: 'Warehouse power distro to be brought in.',
    },
    {
      name: 'Police Station',
      booked_status: 'booked',
      address: '104 New Scotland Yard, London SW1',
      availability_constraints: 'Security presence required.',
      permit_fee: 350,
      location_fee: 800,
      notes: 'Filming before opening only. Use rear entrance.',
    },
    {
      name: 'Mint Building',
      booked_status: 'booked',
      address: '105 Main St, London',
      availability_constraints: 'No access before 08:00. Noise restrictions after 22:00.',
      permit_fee: null,
      location_fee: 4200,
      notes: 'Rooftop access requires harness sign-off.',
    },
    {
      name: 'Roof Top',
      booked_status: 'hold',
      address: '106 Shoreditch High St, London E1',
      availability_constraints: 'Drone permit required. Rooftop access requires harness sign-off.',
      permit_fee: 200,
      location_fee: 1800,
      notes: 'Wind check required for exterior work.',
    },
    {
      name: 'Parking Lot',
      booked_status: 'unbooked',
      address: '107 Commercial Rd, London E1',
      availability_constraints: 'No access before 06:00. No parking for large trucks.',
      permit_fee: null,
      location_fee: 450,
      notes: 'Traffic control plan required.',
    },
    {
      name: 'Alley',
      booked_status: 'hold',
      address: '108 Brick Lane, London E1',
      availability_constraints: 'Residential area — quiet setup/breakdown.',
      permit_fee: 150,
      location_fee: null,
      notes: 'Narrow access — equipment via hand trolley.',
    },
    {
      name: 'Office',
      booked_status: 'booked',
      address: '109 Canary Wharf, London E14',
      availability_constraints: 'Weekdays only after 18:00. Active business — filming before opening only.',
      permit_fee: null,
      location_fee: 3200,
      notes: 'Use service entrance on tech scout and shoot days.',
    },
    {
      name: 'Apartment',
      booked_status: 'hold',
      address: '110 Kensington Gardens, London W2',
      availability_constraints: 'Residential area — quiet setup/breakdown. No access before 09:00.',
      permit_fee: null,
      location_fee: 950,
      notes: 'Apartment corridor too narrow for dolly track.',
    },
    {
      name: 'Cafe',
      booked_status: 'booked',
      address: '111 Borough High St, London SE1',
      availability_constraints: 'Active business — filming before opening only.',
      permit_fee: null,
      location_fee: 650,
      notes: 'Café requires protection for tiled floor.',
    },
    {
      name: 'Hotel Lobby',
      booked_status: 'hold',
      address: '112 Strand, London WC2',
      availability_constraints: 'Contact concierge 30 minutes before arrival. No access before 06:00.',
      permit_fee: 275,
      location_fee: 2100,
      notes: 'Use service entrance on tech scout and shoot days.',
    },
    {
      name: 'Garage',
      booked_status: 'unbooked',
      address: '113 Bermondsey St, London SE1',
      availability_constraints: 'Rear loading access only.',
      permit_fee: null,
      location_fee: 380,
      notes: 'Limited ceiling height — check rigging.',
    },
    {
      name: 'Studio',
      booked_status: 'wrap',
      address: '114 Park Royal, London NW10',
      availability_constraints: null,
      permit_fee: null,
      location_fee: 2800,
      notes: 'Full day rate. Power and rigging included.',
    },
  ]

  for (let i = 1; i <= 14; i++) {
    const loc = DEMO_LOCATIONS[i - 1]!
    await db.execute(
      `INSERT INTO locations (id, production_id, name, booked_status, address, availability_constraints, permit_fee, location_fee, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        IDS.location(i),
        pid,
        loc.name,
        loc.booked_status,
        loc.address,
        loc.availability_constraints,
        loc.permit_fee,
        loc.location_fee,
        loc.notes,
        ts,
        ts,
      ]
    )
  }

  const intExt = ['INT', 'EXT', 'EXT', 'INT', 'EXT'] as const
  const dayNight = ['DAY', 'NIGHT', 'DAY', 'NIGHT', 'DAY'] as const
  for (let s = 1; s <= 45; s++) {
    const locId = s <= 14 ? IDS.location(((s - 1) % 14) + 1) : null
    await db.execute(
      `INSERT INTO scenes (id, production_id, scene_number, heading, title, description, int_ext, day_night, page_eighths, location_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        IDS.scene(s),
        pid,
        String(s),
        `${intExt[(s - 1) % 5]} - ${dayNight[(s - 1) % 5]}`,
        `Scene ${s}`,
        `Description for scene ${s}`,
        intExt[(s - 1) % 5],
        dayNight[(s - 1) % 5],
        8 + (s % 4),
        locId,
        ts,
        ts,
      ]
    )
  }

  // -------------------------------------------------------------------------
  // Equipment terms: unique LENS and SUPPORT for shot list suggestions dropdown
  // (no duplicates; UNIQUE(production_id, type, value))
  // -------------------------------------------------------------------------
  const LENS_SEED = ['18mm', '24mm', '35mm', '50mm', '85mm', '100mm Macro', '24–70mm', '70–200mm'] as const
  const SUPPORT_SEED = ['Tripod', 'Shoulder', 'Gimbal', 'Dolly', 'Jib', 'Crane', 'Steadicam', 'Slider', 'Handheld'] as const
  let termN = 1
  for (const value of LENS_SEED) {
    await db.execute(
      `INSERT INTO equipment_terms (id, production_id, type, value, created_at, updated_at)
       VALUES ($1, $2, 'LENS', $3, $4, $5)`,
      [IDS.equipmentTerm(termN++), pid, value, ts, ts]
    )
  }
  for (const value of SUPPORT_SEED) {
    await db.execute(
      `INSERT INTO equipment_terms (id, production_id, type, value, created_at, updated_at)
       VALUES ($1, $2, 'SUPPORT', $3, $4, $5)`,
      [IDS.equipmentTerm(termN++), pid, value, ts, ts]
    )
  }

  // -------------------------------------------------------------------------
  // Shots: 120 total, rich fields + explicit test cases
  // Distribution: 5 coverage scenes × 6; 10 scenes × 1–2; 20 scenes × 2–4; 10 scenes × 2–3
  // -------------------------------------------------------------------------
  const sceneShotCounts: number[] = []
  for (let s = 0; s < 5; s++) sceneShotCounts.push(6) // coverage
  for (let s = 0; s < 10; s++) sceneShotCounts.push(s % 2 === 0 ? 1 : 2)
  for (let s = 0; s < 20; s++) sceneShotCounts.push(s % 2 === 0 ? 2 : 3)
  for (let s = 0; s < 10; s++) sceneShotCounts.push(s % 2 === 0 ? 2 : 3)
  const SUBJECTS = ['Jade', 'Vault Door', 'Security Cam Monitor', 'Hands / Lockpick', 'Alex', 'Guard', 'Safe', 'Keypad', 'Crowd', 'Car', 'Phone', 'Briefcase', 'Window', 'Desk', 'Door']
  const ACTION_TEMPLATES = [
    'A reacts to the alarm.',
    'B crosses frame and exits left.',
    'Insert: phone screen showing alert.',
    'Jade picks the lock under tension.',
    'Guard turns at the sound.',
    'Wide establishing the space.',
    'CU hands working the dial.',
    'Vault door swings open.',
  ]
  const COVERAGE_ACTIONS = ['Jade enters frame.', 'Jade crosses to vault.', 'Insert: vault door.', 'Jade reacts.', 'B crosses frame.', 'CU hands on lockpick.']
  const SUPPORTS = [...SUPPORT_SEED]
  const LENSES = [...LENS_SEED]
  const SHORT_NOTES = ['', '', 'Re-take', 'VFX plate', 'Pickup', null, null]
  const LONG_NOTE_1 = 'This shot requires careful continuity with scene 12. The actor must enter from the left mark and pause on the X. We will need a clean plate for the background replacement. Second unit will cover the insert. Please ensure the prop is the same as in the master.'
  const LONG_NOTE_2 = 'Extended take—allow for full performance. DoP wants to try a oner here; we have three attempts scheduled. If we go wide, ensure the background extras hold. Sound will need to drop a mic for the dialogue at the desk.'
  const LONG_NOTE_3 = 'Stunt coordinator to approve blocking. The fall is off-camera but we need the reaction in frame. Safety first: padding and spotter. This is the key beat before the cut to the insert.'

  const movements = [...CAMERA_MOVEMENT_VALUES]
  const shotSizes = [...SHOT_SIZE_VALUES]
  let globalShotIndex = 0
  const shotRows: Array<{
    id: string
    scene_id: string
    shot_number: string
    description: string | null
    shot_description: string | null
    subject: string | null
    action_description: string | null
    shot_size: ShotSize | null
    support: string | null
    lens: string | null
    duration_seconds: number | null
    estimated_shoot_minutes: number | null
    camera_movement: CameraMovement | null
    notes: string | null
  }> = []
  const SHOT_DESCRIPTIONS = [
    'Wide establishing the space.',
    'Jade enters frame.',
    'CU hands on lockpick.',
    'Insert: vault door.',
    'Guard turns at the sound.',
    'A reacts to the alarm.',
    'B crosses frame and exits left.',
    'Jade picks the lock under tension.',
    'Wide on the keypad.',
    'Vault door swings open.',
  ]

  for (let sceneIdx = 0; sceneIdx < 45; sceneIdx++) {
    const sceneNum = sceneIdx + 1
    const count = sceneShotCounts[sceneIdx]!
    const isCoverageScene = sceneIdx < 5
    for (let si = 0; si < count; si++) {
      globalShotIndex++
      const shotId = IDS.shot(globalShotIndex)
      const sceneId = IDS.scene(sceneNum)
      const shotNumber = String(si + 1) // integer per scene; display elsewhere as scene_number/shot_number (e.g. 10/2)

      // Test case A: null/incomplete (shots 1–10)
      const isNullTest = globalShotIndex <= 10
      const lensNull = isNullTest && (globalShotIndex % 4 === 1)
      const shotSizeNull = isNullTest && (globalShotIndex % 4 === 2)
      const movementNull = isNullTest && (globalShotIndex % 4 === 3)
      const durationNull = isNullTest && (globalShotIndex % 4 === 0)

      // Test case B: long notes (shots 11–13)
      const longNoteIdx = globalShotIndex === 11 ? LONG_NOTE_1 : globalShotIndex === 12 ? LONG_NOTE_2 : globalShotIndex === 13 ? LONG_NOTE_3 : null

      // Test case C: duplicate lens for suggestions — 25× 24mm, 25× 35mm, 10× 24–70mm
      let lens: string | null
      if (lensNull) lens = null
      else if (globalShotIndex >= 18 && globalShotIndex <= 42) lens = '24mm'
      else if (globalShotIndex >= 43 && globalShotIndex <= 67) lens = '35mm'
      else if (globalShotIndex >= 68 && globalShotIndex <= 77) lens = '24–70mm'
      else lens = LENSES[globalShotIndex % LENSES.length]!

      // Test case D: duration 0, 60, and a few 30–60s outliers for sorting
      let duration_seconds: number | null
      if (durationNull) duration_seconds = null
      else if (globalShotIndex === 14 || globalShotIndex === 15) duration_seconds = 0
      else if (globalShotIndex === 16 || globalShotIndex === 17) duration_seconds = 60
      else if (globalShotIndex === 80) duration_seconds = 45
      else if (globalShotIndex === 100) duration_seconds = 30
      else duration_seconds = 2 + (globalShotIndex % 19) // 2–20 typical

      // Time to get the shot in practice (minutes); used for stripboard day duration
      const estimated_shoot_minutes = 2 + (globalShotIndex % 14) // 2–15 min typical

      // Test case E: every camera_movement at least once (first 14 shots get one each)
      let camera_movement: CameraMovement | null
      if (movementNull) camera_movement = null
      else if (globalShotIndex <= 14) camera_movement = movements[globalShotIndex - 1]!
      else camera_movement = movements[globalShotIndex % movements.length]!

      let shot_size: ShotSize | null
      let action_description: string
      let subject: string
      if (isCoverageScene && si < 6) {
        shot_size = (shotSizeNull ? null : (['LS', 'FS', 'MFS', 'MS', 'MCU', 'CU'] as const)[si]) ?? null
        action_description = COVERAGE_ACTIONS[si]!
        subject = ['Jade', 'Jade', 'Vault Door', 'Jade', 'Guard', 'Hands / Lockpick'][si]!
      } else {
        shot_size = shotSizeNull ? null : shotSizes[globalShotIndex % shotSizes.length]!
        action_description = ACTION_TEMPLATES[(globalShotIndex + si) % ACTION_TEMPLATES.length]!
        subject = SUBJECTS[globalShotIndex % SUBJECTS.length]!
      }

      const support = isNullTest && globalShotIndex % 5 === 2 ? null : SUPPORTS[globalShotIndex % SUPPORTS.length]!
      const notes = longNoteIdx ?? (SHORT_NOTES[globalShotIndex % SHORT_NOTES.length] ?? null)

      const shot_description = SHOT_DESCRIPTIONS[globalShotIndex % SHOT_DESCRIPTIONS.length] ?? (action_description ? `${action_description.slice(0, 40)}…` : null)
      shotRows.push({
        id: shotId,
        scene_id: sceneId,
        shot_number: shotNumber,
        description: `Shot ${globalShotIndex}`,
        shot_description: globalShotIndex <= 10 ? null : shot_description,
        subject,
        action_description,
        shot_size,
        support,
        lens,
        duration_seconds,
        estimated_shoot_minutes,
        camera_movement,
        notes: notes === '' ? null : notes,
      })
    }
  }

  const firstShotIdBySceneId = new Map<string, string>()
  for (const row of shotRows) {
    if (!firstShotIdBySceneId.has(row.scene_id)) firstShotIdBySceneId.set(row.scene_id, row.id)
    await db.execute(
      `INSERT INTO shots (id, scene_id, shot_number, description, shot_description, subject, action_description, shot_size, support, lens, duration_seconds, estimated_shoot_minutes, camera_movement, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        row.id,
        row.scene_id,
        row.shot_number,
        row.description,
        row.shot_description,
        row.subject,
        row.action_description,
        row.shot_size,
        row.support,
        row.lens,
        row.duration_seconds,
        row.estimated_shoot_minutes,
        row.camera_movement,
        row.notes,
        ts,
        ts,
      ]
    )
  }

  const castDepts = [
    'Cast',
    'Cast',
    'Cast',
    'Camera',
    'Sound',
    'Grip',
    'Electric',
    'Art',
    'Wardrobe',
    'Hair',
    'Makeup',
    'Transport',
    'Catering',
    'Security',
    'Production',
    'Director',
    'AD',
    'Script',
    'Continuity',
    'VFX',
    'Stunts',
  ]
  const names = [
    'Alex Rivera',
    'Jordan Lee',
    'Sam Chen',
    'Morgan Taylor',
    'Casey Brown',
    'Riley Davis',
    'Quinn Wilson',
    'Avery Martinez',
    'Blake Anderson',
    'Skyler White',
    'Dakota Moore',
    'Finley Jackson',
    'Emery Thomas',
    'Hayden Garcia',
    'Parker Robinson',
    'River Clark',
    'Sage Lewis',
    'Phoenix Walker',
    'Drew Hall',
    'Cameron Young',
  ]
  for (let i = 0; i < 40; i++) {
    const isCast = i < 18 ? 1 : 0
    const dept = castDepts[i % castDepts.length]
    const name = names[i % names.length] + (i >= 20 ? ` ${Math.floor(i / 20) + 1}` : '')
    await db.execute(
      `INSERT INTO people (id, production_id, name, is_cast, email, phone, department, contributor_form_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        IDS.person(i + 1),
        pid,
        name,
        isCast,
        `person${i + 1}@demo.com`,
        null,
        dept,
        i < 5 ? 'signed' : 'not_requested',
        ts,
        ts,
      ]
    )
  }

  for (let s = 1; s <= 45; s++) {
    const numCast = 1 + (s % 4)
    for (let c = 0; c < numCast && c < 18; c++) {
      const personId = IDS.person((s % 18) + c + 1)
      await db.execute(
        `INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [IDS.sceneCast((s - 1) * 4 + c), pid, IDS.scene(s), personId, ts, ts]
      )
    }
  }

  const clashDates = [2, 4, 6, 9, 11].map((off) => addDaysLocal(startDate, off))
  for (let i = 0; i < 5; i++) {
    await db.execute(
      `INSERT INTO cast_availability (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        IDS.availability(i + 1),
        pid,
        IDS.person(i + 1),
        clashDates[i],
        clashDates[i],
        'UNAVAILABLE',
        'Clash for demo',
        ts,
        ts,
      ]
    )
  }

  for (let s = 1; s <= 12; s++) {
    const locId = IDS.location(((s - 1) % 14) + 1)
    await db.execute(
      `INSERT INTO location_scene (id, location_id, scene_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [IDS.locationScene(s), locId, IDS.scene(s), ts, ts]
    )
  }

  // -------------------------------------------------------------------------
  // Budget: generated only via demoBudgetSeed (chart of accounts, budget items, expenses,
  // production totals). No legacy budget_categories; category_id left null. All values in GBP.
  // Uses runInSerializedTransaction + executeBatch. Do not add alternate budget seeding for demo.
  // -------------------------------------------------------------------------
  await seedDemoBudget(pid, startDate, ts, addDaysLocal, IDS.budgetItem, IDS.expense)
  await seedDemoTasks(pid, startDate, ts, addDaysLocal)
  await seedDemoReconciliation(pid, ts, IDS.budgetItem, IDS.expense)

  const hods = [
    ['Director', 'Jane Doe', '555-0100', 'director@demo.com'],
    ['1st AD', 'John Smith', '555-0101', 'ad@demo.com'],
    ['DoP', 'Alex Camera', '555-0102', 'dop@demo.com'],
    ['Sound', 'Sam Mix', '555-0103', 'sound@demo.com'],
    ['Gaffer', 'Glen Light', '555-0104', 'gaffer@demo.com'],
    ['Art Director', 'Art Design', '555-0105', 'art@demo.com'],
  ]
  for (let i = 0; i < hods.length; i++) {
    await db.execute(
      `INSERT INTO key_contacts (id, production_id, department, name, phone, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [IDS.keyContact(i + 1), pid, hods[i][0], hods[i][1], hods[i][2], hods[i][3], ts, ts]
    )
  }

  let stripIdx = 0
  for (let day = 1; day <= 12; day++) {
    const dayId = IDS.shootDay(day)
    for (const unitId of [IDS.unitMain, IDS.unitSecond]) {
      const sduRows = await db.select<Record<string, unknown>[]>(
        `SELECT id FROM shoot_day_units WHERE shoot_day_id = $1 AND unit_id = $2 AND deleted_at IS NULL`,
        [dayId, unitId]
      )
      const sduId = sduRows[0]?.id as string | null
      let sortIndex = 0
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)`,
        [IDS.strip(stripIdx++), pid, dayId, sduId, 'CALL', 'Call 07:00', sortIndex++, ts, ts]
      )
      for (let sc = 1; sc <= 5; sc++) {
        const sceneNum = (day - 1) * 4 + sc
        const sceneId = IDS.scene(sceneNum)
        const shotId = firstShotIdBySceneId.get(sceneId) ?? null
        await db.execute(
          `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, sort_index, strip_status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'SHOT', $5, $6, $7, 'SCHEDULED', $8, $9)`,
          [IDS.strip(stripIdx++), pid, dayId, sduId, sceneId, shotId, sortIndex++, ts, ts]
        )
      }
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)`,
        [IDS.strip(stripIdx++), pid, dayId, sduId, 'LUNCH', 'Lunch 13:00', sortIndex++, ts, ts]
      )
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)`,
        [IDS.strip(stripIdx++), pid, dayId, sduId, 'WRAP', 'Wrap 18:00', sortIndex++, ts, ts]
      )
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, description, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10)`,
        [IDS.strip(stripIdx++), pid, dayId, sduId, 'NOTE', 'Unit note', 'Demo note', sortIndex++, ts, ts]
      )
    }
  }

  const locReleasePdf = await generateLocationReleaseCover({
    productionName: 'Demo: The Mint Heist',
    locationName: 'Mint Building',
    address: '105 Main St',
  })
  const locPath = `${ATTACHMENTS}/demo-location-release.pdf`
  await writeFile(locPath, locReleasePdf, { baseDir: BaseDirectory.AppData })
  await db.execute(
    `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [IDS.document(1), pid, 'location_release', IDS.location(5), 'demo-location-release.pdf', locPath, 'application/pdf', ts, ts]
  )

  const contribPdf = await generateContributorFormCover({
    productionName: 'Demo: The Mint Heist',
    contributorName: 'Alex Rivera',
    role: 'Lead',
  })
  const contribPath = `${ATTACHMENTS}/demo-contributor-form.pdf`
  await writeFile(contribPath, contribPdf, { baseDir: BaseDirectory.AppData })
  await db.execute(
    `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [IDS.document(2), pid, 'contributor_form', IDS.person(1), 'demo-contributor-form.pdf', contribPath, 'application/pdf', ts, ts]
  )

  const callSheetPath = `${ATTACHMENTS}/demo-call-sheet.pdf`
  const { generateCallSheetPdf } = await import('@/lib/pdf/callSheet')
  const shootDay = await db.select<Record<string, unknown>[]>(`SELECT * FROM shoot_days WHERE id = $1`, [IDS.shootDay(1)])
  if (shootDay.length) {
    const data = await buildCallSheetDataForSeed(pid, IDS.shootDay(1), startDate)
    const callPdfBytes = await generateCallSheetPdf(data)
    await writeFile(callSheetPath, new Uint8Array(callPdfBytes), { baseDir: BaseDirectory.AppData })
  }
  await db.execute(
    `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [IDS.document(3), pid, 'call_sheet', IDS.shootDay(1), 'demo-call-sheet.pdf', callSheetPath, 'application/pdf', ts, ts]
  )

  for (let i = 4; i <= 10; i++) {
    const fileName = `demo-doc-${i}.txt`
    const path = `${ATTACHMENTS}/${fileName}`
    await writeTextFile(path, `Demo document ${i} for Albatross.\nGenerated at ${ts}`, { baseDir: BaseDirectory.AppData })
    await db.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [IDS.document(i), pid, null, null, fileName, path, 'text/plain', ts, ts]
    )
  }

  for (let i = 1; i <= 12; i++) {
    await db.execute(
      `INSERT INTO deliverables (id, production_id, name, due_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [IDS.deliverable(i), pid, `Deliverable ${i}`, addDaysLocal(startDate, 60 + i * 7), i % 3 === 0 ? 'done' : 'pending', ts, ts]
    )
  }

  for (let i = 1; i <= 12; i++) {
    await db.execute(
      `INSERT INTO technical_specs (id, deliverable_id, resolution, codec, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [IDS.technicalSpec(i), IDS.deliverable(i), '1920x1080', 'H.264', `Spec for deliverable ${i}`, ts, ts]
    )
  }

  const trackTitles = ['Opening Theme', 'Chase Sequence', 'Love Scene', 'Tension Build', 'End Credits', 'Ambient 1', 'Ambient 2', 'Action Sting', 'Emotional', 'Transition']
  for (let i = 1; i <= 10; i++) {
    await db.execute(
      `INSERT INTO music_tracks (id, production_id, title, artist, publisher_label, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [IDS.musicTrack(i), pid, trackTitles[i - 1], 'Demo Artist', 'Demo Music Co', ts, ts]
    )
  }

  for (let i = 1; i <= 10; i++) {
    await db.execute(
      `INSERT INTO clearances (id, production_id, type, item_id, status, requested_at, granted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [IDS.clearance(i), pid, 'music', IDS.musicTrack(i), i % 2 === 0 ? 'granted' : 'pending', ts, i % 2 === 0 ? ts : null, ts, ts]
    )
  }

  const cueRows = trackTitles.map((title) => ({
    title,
    artist: 'Demo Artist',
    publisher: 'Demo Music Co',
  }))
  const cuePdf = await generateCueSheet('Demo: The Mint Heist', cueRows)
  const cuePath = `${ATTACHMENTS}/demo-cue-sheet.pdf`
  await writeFile(cuePath, cuePdf, { baseDir: BaseDirectory.AppData })
  await db.execute(
    `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [IDS.document(11), pid, 'cue_sheet', null, 'demo-cue-sheet.pdf', cuePath, 'application/pdf', ts, ts]
  )
  await db.execute(
    `INSERT INTO cue_sheets (id, production_id, generated_at, document_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [IDS.cueSheet, pid, ts, IDS.document(11), ts, ts]
  )

  await setSeedMeta('last_seeded_at', ts)
  await setSeedMeta('seed_version', SEED_VERSION)

  // Seed one GBP→USD rate for offline conversion testing; do not overwrite existing user-fetched rate.
  const existingRate = await db.select<Record<string, unknown>[]>(
    `SELECT 1 FROM exchange_rates WHERE base_currency = 'gbp' AND quote_currency = 'usd'`
  )
  if (existingRate.length === 0) {
    await db.execute(
      `INSERT INTO exchange_rates (id, base_currency, quote_currency, rate, fetched_at)
       VALUES ($1, 'gbp', 'usd', 1.25, $2)`,
      [DEMO_EXCHANGE_RATE_ID, ts]
    )
  }
}

async function buildCallSheetDataForSeed(
  productionId: string,
  shootDayId: string,
  fallbackShootDate: string
): Promise<import('@/lib/pdf/callSheet').CallSheetData> {
  const db = await getDb()
  const prodRows = await db.select<Record<string, unknown>[]>(`SELECT name FROM productions WHERE id = $1`, [productionId])
  const dayRows = await db.select<Record<string, unknown>[]>(`SELECT * FROM shoot_days WHERE id = $1`, [shootDayId])
  const strips = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM stripboard_strips WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY sort_index`,
    [shootDayId]
  )
  const keyContactRows = await db.select<Record<string, unknown>[]>(
    `SELECT department, name, phone, email FROM key_contacts WHERE production_id = $1 AND deleted_at IS NULL ORDER BY department`,
    [productionId]
  )
  const peopleRows = await db.select<Record<string, unknown>[]>(
    `SELECT name FROM people WHERE production_id = $1 AND is_cast = 1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  const locRows = await db.select<Record<string, unknown>[]>(
    `SELECT name, address FROM locations WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  const sceneRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, scene_number, title, int_ext, day_night, page_eighths FROM scenes WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  const sceneMap = new Map((sceneRows || []).map((r) => [r.id as string, r]))

  const productionName = (prodRows[0]?.name as string) ?? 'Demo'
  const day = dayRows[0] as Record<string, unknown>
  const shootDate = (day?.shoot_date as string) ?? fallbackShootDate
  const schedule: import('@/lib/pdf/callSheet').CallSheetStrip[] = strips.map((s) => {
    if ((s.strip_type === 'SHOT' || s.strip_type === 'SCENE') && s.scene_id) {
      const sc = sceneMap.get(s.scene_id as string) as Record<string, unknown> | undefined
      return {
        strip_type: 'SCENE',
        scene_number: (sc?.scene_number as string) ?? null,
        scene_title: (sc?.title as string) ?? null,
        int_ext: (sc?.int_ext as string) ?? null,
        day_night: (sc?.day_night as string) ?? null,
        page_eighths: (sc?.page_eighths as number) ?? null,
        title: null,
        description: null,
      }
    }
    return {
      strip_type: s.strip_type as import('@/lib/pdf/callSheet').CallSheetStrip['strip_type'],
      title: (s.title as string) ?? null,
      description: (s.description as string) ?? null,
    }
  })

  return {
    productionName,
    shootDate,
    unitName: 'Main Unit',
    callTime: (day?.call_time as string) ?? '07:00',
    wrapTime: (day?.wrap_time as string) ?? '18:00',
    keyContacts: keyContactRows.map((r) => ({
      department: r.department as string,
      name: r.name as string | null,
      phone: r.phone as string | null,
      email: r.email as string | null,
    })),
    hospitalName: (day?.hospital_name as string) ?? null,
    hospitalAddress: (day?.hospital_address as string) ?? null,
    policeStationName: (day?.police_station_name as string) ?? null,
    policeStationAddress: (day?.police_station_address as string) ?? null,
    weatherSummary: (day?.weather_manual as string) ?? 'Sunny',
    parkingBaseAddress: (day?.parking_base_address as string) ?? null,
    mealTimes: [{ name: 'Lunch', time: '13:00' }],
    specialNotes: (day?.special_notes as string) ?? null,
    schedule,
    castCalled: peopleRows.map((r) => r.name as string),
    locations: locRows.map((r) => ({ name: r.name as string, address: r.address as string | null })),
  }
}
