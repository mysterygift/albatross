/**
 * Deterministic demo production seed. Mint Heist uses DEMO_SLUG; episodic suite uses DEMO_EPISODIC_SLUG.
 * Never delete or match by name; never touch non-demo productions.
 *
 * North Shore (DEMO_EPISODIC_SLUG): episodic demo with 3 episodes × 10 scenes × 8 shots, Italian coastal
 * locations, 50 crew (see demoCrewSeed NORTH_SHORE_EPISODIC_CREW), Mint Heist cast reuse, equipment/vendor
 * pattern mirrored from the singleton demo via EPISODIC_DEMO_IDS. Two non-overlapping shooting blocs
 * (days 1–6 vs 7–12) with mixed-episode stripboard rows; call sheets, music, and deliverables remain
 * episode-aware. Mint Heist (DEMO_SLUG) remains the non-episodic regression anchor.
 *
 * Shot list seed (Shot Lists page):
 * - Edge cases: 10+ shots with NULL lens/shot_size/camera_movement/duration_seconds (shots 1-10);
 *   ­3 shots with very long notes (truncation/tooltip); 2× duration_seconds=0, 2× duration_seconds=60;
 *   every camera_movement enum at least once.
 * - Lens suggestions: 25+ shots use "24mm", 25+ use "35mm", 10+ use "24–70mm"; unique set in equipment_terms.
 * - equipment_terms: LENS (18mm, 24mm, 35mm, 50mm, 85mm, 100mm Macro, 24–70mm, 70–200mm) and SUPPORT terms.
 * - Verify: Schedule → Shot lists, pick a scene; check columns, lens/support dropdowns, null handling, long notes.
 */
import { executeBatch, getDb, now, runInSerializedTransaction } from '../client'
import { getProductionBySlug, hardDeleteProduction } from '../repositories/production'
import { seedDemoBudget } from './demoBudgetSeed'
import { seedDemoBookings, seedDemoCrewBookings } from './demoBookingSeed'
import { seedDemoPeople } from './demoPeopleSeed'
import { seedDemoDeliverables } from './demoDeliverableSeed'
import { seedDemoReconciliation } from './demoReconciliationSeed'
import { seedDemoTasks } from './demoTaskSeed'
import { seedDemoVendorFinance } from './demoVendorFinanceSeed'
import { seedDemoVendors } from './demoVendorSeed'
import { seedDemoEquipment } from './demoEquipmentSeed'
import { DEMO_CREW_MEMBER_COUNT, NORTH_SHORE_EPISODIC_CREW, seedDemoCrew } from './demoCrewSeed'
import { listDocumentsByProduction } from '../repositories/document'
import { listEpisodesByProduction } from '../repositories/episodes'
import { BaseDirectory, mkdir, remove, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { generateCueSheet, generateLocationReleaseCover, generateContributorFormCover } from '@/lib/pdf'
import { generateCallSheetPdf, parseCallSheetWeatherJson } from '@/lib/pdf/callSheet'
import { isLockError } from '../perf'
import {
  enrichCallSheetStripEpisodeLabel,
  shootingBlocMastheadLabelForCallSheet,
} from '@/lib/call-sheets/callSheetEpisodic'
import { selectPrimaryCallSheetContacts } from '@/lib/call-sheets/primaryContacts'
import { buildCallSheetStripFromStripboard } from '@/lib/call-sheets/scheduleStripRow'
import { persistShootDayShootingBlocId } from '@/lib/db/shootingBlocAssociation'
import type { CameraMovement, ShotSize } from '../types'
import { CAMERA_MOVEMENT_VALUES, SHOT_SIZE_VALUES } from '../types'
import {
  DEMO_EPISODIC_SLUG,
  DEMO_EXCHANGE_RATE_ID,
  DEMO_SLUG,
  EPISODIC_DEMO_IDS,
  EPISODIC_DEMO_MIXED_STRIP_SCENES,
  IDS,
  SEED_VERSION,
} from './constants'
import {
  buildNorthShoreShotRows,
  NORTH_SHORE_DEMO_PRODUCTION_NAME,
  NORTH_SHORE_LOCATIONS,
  NORTH_SHORE_SCENES,
} from './northShoreDemoContent'
import type { DemoSeedIdSource } from './demoSeedContext'
import {
  buildDemoSeedIdSourceWithUuid,
  makeDemoSeedIdSourceFromEpisodicIDS,
  makeDemoSeedIdSourceFromIDS,
} from './demoSeedContext'
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
 * Hard-delete a demo production and its attachment files. Gets document paths first (before cascade
 * removes rows), then hard-deletes production (FK cascades remove all children), then deletes files.
 */
async function hardDeleteDemoAndRelated(productionId: string): Promise<void> {
  const paths = await getDocumentFilePathsForProduction(productionId)
  await hardDeleteProduction(productionId)
  await deleteAttachmentFilesOnDisk(paths)
}

/** Avoid parallel backfills (e.g. React StrictMode) racing on the same empty crew state. */
let singletonDemoCrewBackfillPromise: Promise<void> | null = null

/**
 * If the singleton demo production exists but has no crew rows (e.g. created before crew seed),
 * run `seedDemoCrew` + `seedDemoCrewBookings` idempotently. No-op when crew count is already full
 * or when `productionId` is not `IDS.production`.
 */
async function maybeBackfillSingletonDemoCrewIfEmpty(productionId: string): Promise<void> {
  if (productionId !== IDS.production) return
  if (singletonDemoCrewBackfillPromise) return singletonDemoCrewBackfillPromise

  singletonDemoCrewBackfillPromise = (async () => {
    try {
      const db = await getDb()
      const countRows = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM people WHERE production_id = $1 AND is_cast = 0 AND deleted_at IS NULL`,
        [productionId]
      )
      const n = Number(countRows[0]?.n ?? 0)
      if (n >= DEMO_CREW_MEMBER_COUNT) return
      if (n > 0) return

      const sd = await db.select<{ shoot_date: string }[]>(
        `SELECT shoot_date FROM shoot_days WHERE production_id = $1 AND deleted_at IS NULL ORDER BY day_number ASC LIMIT 1`,
        [productionId]
      )
      const startDate = sd[0]?.shoot_date ?? todayLocalYYYYMMDD()
      const ts = now()
      const idSource = makeDemoSeedIdSourceFromIDS()
      await seedDemoCrew(productionId, startDate, ts, idSource, addDaysLocal)
      await seedDemoCrewBookings(productionId, ts, idSource)
    } finally {
      singletonDemoCrewBackfillPromise = null
    }
  })()

  return singletonDemoCrewBackfillPromise
}

/**
 * If demo production (by slug) does not exist, insert full demo dataset.
 * If it already exists (singleton), ensure crew people + crew bookings are present when missing.
 */
export async function ensureDemoData(): Promise<void> {
  const existing = await getProductionBySlug(DEMO_SLUG)
  if (!existing) {
    await runFullSeed()
  } else {
    await maybeBackfillSingletonDemoCrewIfEmpty(existing.id)
  }
  await ensureEpisodicDemoProduction()
}

/**
 * Ensure the episodic North Shore demo exists (used after migrations or when Mint Heist already present).
 */
export async function ensureEpisodicDemoProduction(): Promise<void> {
  if (await getProductionBySlug(DEMO_EPISODIC_SLUG)) return
  await runEpisodicFullSeed()
}

/**
 * Find demo production(s) by slug; hard-delete Mint Heist and episodic demo and attachment files;
 * remove only the demo-seeded exchange rate (not user-fetched cache); then re-run full demo seed.
 * Does NOT reset user settings (display_currency, enable_currency_conversion_api).
 */
export async function resetDemoData(): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM exchange_rates WHERE id = $1`, [DEMO_EXCHANGE_RATE_ID])
  for (const slug of [DEMO_SLUG, DEMO_EPISODIC_SLUG] as const) {
    const prod = await getProductionBySlug(slug)
    if (prod) await hardDeleteDemoAndRelated(prod.id)
  }
  await runFullSeed()
  await ensureEpisodicDemoProduction()
}

export { getLastSeededAt, getSeedVersion }

const VERIFY_PID = 'b0000000-0000-4000-8000-000000000001'
const VERIFY_SLUG = 'verify-cascade-test'

/**
 * Dev-only: create a minimal production with a few child rows, hard-delete it, then verify
 * no child rows remain. Confirms FK ON DELETE CASCADE is working.
 * Uses executeBatch (no explicit BEGIN/COMMIT) to avoid "cannot start a transaction within a
 * transaction" with the Tauri plugin/sqlx; the batch runs as one write-queue task.
 * The batch plus the follow-up orphan check SELECT run inside runInSerializedTransaction so no
 * other queued write can run between them (avoids SQLITE_BUSY / error 5 from interleaved writers).
 */
export async function verifyCascades(): Promise<{ ok: boolean; message: string; details?: string }> {
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
    'episodes',
    'music_tracks',
    'clearances',
    'cue_sheets',
    'script_documents',
    'shooting_blocs',
    'equipment_terms',
  ]
  try {
    const result = await runInSerializedTransaction(async () => {
      const db = await getDb()
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
          sql: `INSERT INTO scenes (id, production_id, scene_number, episode_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          bindValues: ['b0000000-0000-4000-8000-000000000004', VERIFY_PID, '1', null, ts, ts],
        },
        {
          sql: `INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
          bindValues: ['b0000000-0000-4000-8000-000000000005', VERIFY_PID, '2025-01-01', ts, ts],
        },
        { sql: `DELETE FROM productions WHERE id = $1`, bindValues: [VERIFY_PID] },
      ]
      await executeBatch(db, statements)
      // Single round-trip; SQLite forbids LIMIT on each arm of UNION ALL — use EXISTS instead.
      const unionSql = [
        `SELECT 'productions' AS t WHERE EXISTS (SELECT 1 FROM productions WHERE id = $1)`,
        ...tablesWithProductionId.map(
          (table) =>
            `SELECT '${table}' AS t WHERE EXISTS (SELECT 1 FROM ${table} WHERE production_id = $1)`
        ),
      ].join(' UNION ALL ')
      const orphanRows = await db.select<{ t: string }[]>(unionSql, [VERIFY_PID])
      const remaining = orphanRows.map((r) => r.t)
      if (remaining.length > 0) {
        return {
          ok: false as const,
          message: 'Cascade check failed: rows still exist after hard delete.',
          details: remaining.join(', '),
        }
      }
      return { ok: true as const, message: 'Cascades verified: hard delete removed production and all child rows.' }
    })
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isBusy = isLockError(msg)
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
   * - Conversion API is on by default (enable_currency_conversion_api = "true").
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

  const startDate = todayLocalYYYYMMDD()
  await runDemoContentSeed(pid, makeDemoSeedIdSourceFromIDS(), startDate, ts, {
    includeDocuments: true,
    includeExchangeRate: true,
  })
  await setSeedMeta('last_seeded_at', ts)
  await setSeedMeta('seed_version', SEED_VERSION)
}

export async function runEpisodicFullSeed(): Promise<void> {
  const db = await getDb()
  const ts = now()
  const pid = EPISODIC_DEMO_IDS.production

  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM productions WHERE id = $1 OR slug = $2`,
    [pid, DEMO_EPISODIC_SLUG]
  )
  if (existing.length > 0) {
    const existingId = existing[0]!.id
    const paths = await getDocumentFilePathsForProduction(existingId)
    await hardDeleteProduction(existingId)
    await deleteAttachmentFilesOnDisk(paths)
  }

  await mkdir(ATTACHMENTS, { baseDir: BaseDirectory.AppData, recursive: true })

  const startDate = todayLocalYYYYMMDD()
  const bloc1end = addDaysLocal(startDate, 5)
  const bloc2start = addDaysLocal(startDate, 6)
  const bloc2end = addDaysLocal(startDate, 11)

  await db.execute(
    `INSERT INTO productions (id, name, slug, currency_code, notes, is_episodic, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
    [
      pid,
      NORTH_SHORE_DEMO_PRODUCTION_NAME,
      DEMO_EPISODIC_SLUG,
      'GBP',
      'Episodic demo — Italian coastal drama. Episodes, shooting blocs, mixed stripboard days, crew, equipment, call sheets.',
      ts,
      ts,
    ]
  )

  const episodeNames = ['Episode 1', 'Episode 2', 'Episode 3'] as const
  for (let i = 0; i < episodeNames.length; i++) {
    await db.execute(
      `INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
      [EPISODIC_DEMO_IDS.episode(i + 1), pid, episodeNames[i], i, ts, ts]
    )
  }

  await db.execute(
    `INSERT INTO shooting_blocs (id, production_id, name, start_date, end_date, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8), ($9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      EPISODIC_DEMO_IDS.shootingBloc(1),
      pid,
      'Block A — Liguria coast',
      startDate,
      bloc1end,
      ts,
      ts,
      null,
      EPISODIC_DEMO_IDS.shootingBloc(2),
      pid,
      'Block B — Tyrrhenian run',
      bloc2start,
      bloc2end,
      ts,
      ts,
      null,
    ]
  )

  const e1 = EPISODIC_DEMO_IDS.episode(1)
  const e2 = EPISODIC_DEMO_IDS.episode(2)
  const e3 = EPISODIC_DEMO_IDS.episode(3)
  const episodeIdForSceneNumber = (sceneNum: number): string => {
    if (sceneNum <= 10) return e1
    if (sceneNum <= 20) return e2
    return e3
  }

  const musicEpisodeIdForIndex = (i: number): string | null => {
    if (i <= 3) return e1
    if (i <= 6) return e2
    return null
  }

  const deliverableEpisodeIdForIndex = (i: number): string | null => {
    if (i <= 4) return e1
    if (i <= 8) return e2
    return null
  }

  const idSource = makeDemoSeedIdSourceFromEpisodicIDS()
  await runDemoContentSeed(pid, idSource, startDate, ts, {
    includeDocuments: true,
    includeExchangeRate: false,
    attachmentBasePrefix: 'demo-episodic',
    demoProductionDisplayName: NORTH_SHORE_DEMO_PRODUCTION_NAME,
    northShoreEpisodicLayout: true,
    episodeIdForSceneNumber,
    mixedStripSceneNumbersByDay: EPISODIC_DEMO_MIXED_STRIP_SCENES,
    musicEpisodeIdForIndex,
    deliverableEpisodeIdForIndex,
    persistShootDayBlocsAfterSeed: true,
  })
}

export type RunDemoContentSeedOptions = {
  includeDocuments: boolean
  includeExchangeRate: boolean
  /** Attachment filenames: `${prefix}-location-release.pdf`, etc. Default `demo` (Mint Heist). */
  attachmentBasePrefix?: string
  /** Cover / PDF branding when including documents. */
  demoProductionDisplayName?: string
  episodeIdForSceneNumber?: (sceneNumber: number) => string | null
  mixedStripSceneNumbersByDay?: number[][] | null
  musicEpisodeIdForIndex?: (index1Based: number) => string | null
  deliverableEpisodeIdForIndex?: (index1Based: number) => string | null
  /** When true, resolves `shooting_bloc_id` for each seeded day before documents (e.g. call sheet PDF). */
  persistShootDayBlocsAfterSeed?: boolean
  /** North Shore episodic demo: 30 scenes, 7 Italian locations, 8 shots/scene, 50 crew, equipment + vendors. */
  northShoreEpisodicLayout?: boolean
}

/**
 * Seed demo-style content into an arbitrary production (user-created Demo template).
 * Uses uuid-based ids so it does not collide with the singleton DEMO_SLUG production.
 * Does not insert the production row; does not write document files or seed exchange rate.
 */
export async function seedDemoStyleContentIntoProduction(productionId: string): Promise<void> {
  const startDate = todayLocalYYYYMMDD()
  const ts = now()
  const idSource = buildDemoSeedIdSourceWithUuid()
  await runDemoContentSeed(productionId, idSource, startDate, ts, {
    includeDocuments: false,
    includeExchangeRate: false,
  })
}

/**
 * Seed demo-style content into a production (chart of accounts, tasks, deliverables,
 * scenes, schedule, cast, budget, reconciliation, etc.). Used by (1) singleton demo
 * (runFullSeed) with makeDemoSeedIdSourceFromIDS, and (2) user-created Demo template
 * with buildDemoSeedIdSourceWithUuid. Does not insert the production row.
 */
async function runDemoContentSeed(
  productionId: string,
  idSource: DemoSeedIdSource,
  startDate: string,
  ts: string,
  options: RunDemoContentSeedOptions
): Promise<void> {
  const db = await getDb()
  const attachmentBasePrefix = options.attachmentBasePrefix ?? 'demo'
  const demoProductionDisplayName = options.demoProductionDisplayName ?? 'Demo: The Mint Heist'
  const northShoreLayout = options.northShoreEpisodicLayout === true
  const sceneCount = northShoreLayout ? NORTH_SHORE_SCENES.length : 45
  const locationCount = northShoreLayout ? NORTH_SHORE_LOCATIONS.length : 14
  const isNorthShoreEpisodicProd = productionId === EPISODIC_DEMO_IDS.production

  const prodMeta = await db.select<{ is_episodic: number }[]>(
    `SELECT is_episodic FROM productions WHERE id = $1`,
    [productionId]
  )
  const isEpisodicSeed = prodMeta.length > 0 && Number(prodMeta[0]!.is_episodic) === 1
  let defaultEpisodeId: string | null = null
  if (isEpisodicSeed) {
    const eps = await listEpisodesByProduction(productionId)
    if (eps.length === 0) {
      throw new Error('Episodic production has no active episodes; cannot seed demo scenes.')
    }
    defaultEpisodeId = eps[0]!.id
  }

  await db.execute(
    `INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)`,
    [idSource.unitMain, productionId, 'Main Unit', ts, ts, idSource.unitSecond, productionId, 'Second Unit', ts, ts]
  )

  for (let d = 0; d < 12; d++) {
    const shootDate = addDaysLocal(startDate, d)
    await db.execute(
      `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, wrap_time, notes, weather_manual, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        idSource.shootDay(d + 1),
        productionId,
        shootDate,
        d + 1,
        '07:00',
        '18:00',
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
        idSource.shootDayUnit(d - 1, 0),
        idSource.shootDay(d),
        idSource.unitMain,
        ts,
        ts,
        idSource.shootDayUnit(d - 1, 1),
        idSource.shootDay(d),
        idSource.unitSecond,
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

  for (let i = 1; i <= locationCount; i++) {
    const loc = northShoreLayout ? NORTH_SHORE_LOCATIONS[i - 1]! : DEMO_LOCATIONS[i - 1]!
    await db.execute(
      `INSERT INTO locations (id, production_id, name, booked_status, address, availability_constraints, permit_fee, location_fee, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        idSource.location(i),
        productionId,
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

  const intExtMint = ['INT', 'EXT', 'EXT', 'INT', 'EXT'] as const
  const dayNightMint = ['DAY', 'NIGHT', 'DAY', 'NIGHT', 'DAY'] as const
  for (let s = 1; s <= sceneCount; s++) {
    const episodeIdForScene =
      isEpisodicSeed && options.episodeIdForSceneNumber
        ? (options.episodeIdForSceneNumber(s) ?? defaultEpisodeId)
        : defaultEpisodeId
    let locId: string | null
    let heading: string
    let title: string
    let description: string
    let int_ext: 'INT' | 'EXT'
    let day_night: 'DAY' | 'NIGHT'
    let page_eighths: number
    if (northShoreLayout) {
      const def = NORTH_SHORE_SCENES[s - 1]!
      locId = idSource.location(def.locationIndex)
      heading = def.heading
      title = def.title
      description = def.description
      int_ext = def.int_ext
      day_night = def.day_night
      page_eighths = def.page_eighths
    } else {
      locId = s <= 14 ? idSource.location(((s - 1) % 14) + 1) : null
      heading = `${intExtMint[(s - 1) % 5]} - ${dayNightMint[(s - 1) % 5]}`
      title = `Scene ${s}`
      description = `Description for scene ${s}`
      int_ext = intExtMint[(s - 1) % 5]
      day_night = dayNightMint[(s - 1) % 5]
      page_eighths = 8 + (s % 4)
    }
    await db.execute(
      `INSERT INTO scenes (id, production_id, scene_number, heading, title, description, int_ext, day_night, page_eighths, location_id, episode_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        idSource.scene(s),
        productionId,
        String(s),
        heading,
        title,
        description,
        int_ext,
        day_night,
        page_eighths,
        locId,
        episodeIdForScene,
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
      [idSource.equipmentTerm(termN++), productionId, value, ts, ts]
    )
  }
  for (const value of SUPPORT_SEED) {
    await db.execute(
      `INSERT INTO equipment_terms (id, production_id, type, value, created_at, updated_at)
       VALUES ($1, $2, 'SUPPORT', $3, $4, $5)`,
      [idSource.equipmentTerm(termN++), productionId, value, ts, ts]
    )
  }

  // -------------------------------------------------------------------------
  // Shots: Mint Heist 120 w/ edge cases; North Shore 30×8 coastal coverage
  // -------------------------------------------------------------------------
  const firstShotIdBySceneId = new Map<string, string>()
  if (northShoreLayout) {
    const northRows = buildNorthShoreShotRows({ idSource, ts })
    for (const row of northRows) {
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
  } else {
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
      const shotId = idSource.shot(globalShotIndex)
      const sceneId = idSource.scene(sceneNum)
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
  }

  await seedDemoPeople(
    productionId,
    startDate,
    ts,
    idSource,
    northShoreLayout ? { castScheduleVariant: 'north-shore-episodic' } : undefined
  )

  if (northShoreLayout) {
    for (let s = 1; s <= sceneCount; s++) {
      const locIdx = NORTH_SHORE_SCENES[s - 1]!.locationIndex
      const locId = idSource.location(locIdx)
      await db.execute(
        `INSERT INTO location_scene (id, location_id, scene_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
        [idSource.locationScene(s), locId, idSource.scene(s), ts, ts]
      )
    }
  } else {
    for (let s = 1; s <= 12; s++) {
      const locId = idSource.location(((s - 1) % 14) + 1)
      await db.execute(
        `INSERT INTO location_scene (id, location_id, scene_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
        [idSource.locationScene(s), locId, idSource.scene(s), ts, ts]
      )
    }
  }

  // -------------------------------------------------------------------------
  // Cast bookings: aligned with scene_cast and stripboard; respects cast availability clashes
  // -------------------------------------------------------------------------
  await seedDemoBookings(
    productionId,
    ts,
    idSource,
    northShoreLayout
      ? {
          sceneNumbersForDay: (dayNum) => EPISODIC_DEMO_MIXED_STRIP_SCENES[dayNum - 1] ?? [],
          maxSceneNumber: sceneCount,
        }
      : undefined
  )

  // -------------------------------------------------------------------------
  // Vendors + equipment: singleton Mint Heist and North Shore episodic share vendor/invoice/equipment pattern.
  // -------------------------------------------------------------------------
  const isSingletonDemo = productionId === IDS.production
  let vendorIdByCompanyName: Record<string, string> | null = null
  if (isSingletonDemo || isNorthShoreEpisodicProd) {
    vendorIdByCompanyName = await seedDemoVendors(
      productionId,
      ts,
      isNorthShoreEpisodicProd ? EPISODIC_DEMO_IDS : IDS
    )
  }

  // -------------------------------------------------------------------------
  // Budget: generated only via demoBudgetSeed (chart of accounts, budget items, expenses,
  // production totals). No legacy budget_categories; category_id left null. All values in GBP.
  // Uses runInSerializedTransaction + executeBatch. Do not add alternate budget seeding for demo.
  // When singleton demo, vendorIdByCompanyName sets expense.vendor_id for vendor-linked spend.
  // -------------------------------------------------------------------------
  await seedDemoBudget(productionId, startDate, ts, addDaysLocal, idSource.budgetItem, idSource.expense, vendorIdByCompanyName ?? undefined)
  await seedDemoTasks(productionId, startDate, ts, addDaysLocal, idSource)
  await seedDemoReconciliation(productionId, ts, idSource.budgetItem, idSource.expense, idSource.reconciliationLink)
  await seedDemoDeliverables(
    productionId,
    startDate,
    ts,
    addDaysLocal,
    idSource,
    options.deliverableEpisodeIdForIndex
  )

  // -------------------------------------------------------------------------
  // Vendor finance (singleton demo only): invoices, POs, reminder tasks, invoice/PO↔expense links.
  // -------------------------------------------------------------------------
  if ((isSingletonDemo || isNorthShoreEpisodicProd) && vendorIdByCompanyName) {
    await seedDemoVendorFinance(
      productionId,
      startDate,
      ts,
      addDaysLocal,
      vendorIdByCompanyName,
      isNorthShoreEpisodicProd ? EPISODIC_DEMO_IDS : IDS
    )
    await seedDemoEquipment(
      productionId,
      startDate,
      ts,
      addDaysLocal,
      vendorIdByCompanyName,
      isNorthShoreEpisodicProd ? EPISODIC_DEMO_IDS : IDS
    )
  }

  // Crew: people (is_cast=0), and for singleton Mint Heist only: crew labour vendors and invoices
  await seedDemoCrew(productionId, startDate, ts, idSource, addDaysLocal, {
    crewRoster: isNorthShoreEpisodicProd ? NORTH_SHORE_EPISODIC_CREW : undefined,
  })
  await seedDemoCrewBookings(productionId, ts, idSource)

  const hods = northShoreLayout
    ? ([
        ['Director', 'Giuseppe Conti', '+39 329 0104501', 'giuseppe.conti@northshore-demo.pictures'],
        ['1st AD', 'Alessandro Costa', '+39 329 0104509', 'alessandro.costa@northshore-demo.pictures'],
        ['DoP', 'Filippo Colombo', '+39 329 0104528', 'filippo.colombo@northshore-demo.pictures'],
        ['Sound', 'Emiliano Rizzo', '+39 329 0104545', 'emiliano.rizzo@northshore-demo.pictures'],
        ['Gaffer', 'Francesco Damico', '+39 329 0104536', 'francesco.damico@northshore-demo.pictures'],
        ['Art Director', 'Andrea Moretti', '+39 329 0104522', 'andrea.moretti@northshore-demo.pictures'],
      ] as const)
    : ([
        ['Director', 'Jane Doe', '555-0100', 'director@demo.com'],
        ['1st AD', 'John Smith', '555-0101', 'ad@demo.com'],
        ['DoP', 'Alex Camera', '555-0102', 'dop@demo.com'],
        ['Sound', 'Sam Mix', '555-0103', 'sound@demo.com'],
        ['Gaffer', 'Glen Light', '555-0104', 'gaffer@demo.com'],
        ['Art Director', 'Art Design', '555-0105', 'art@demo.com'],
      ] as const)
  for (let i = 0; i < hods.length; i++) {
    const row = hods[i]!
    await db.execute(
      `INSERT INTO key_contacts (id, production_id, department, name, phone, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [idSource.keyContact(i + 1), productionId, row[0], row[1], row[2], row[3], ts, ts]
    )
  }

  let stripIdx = 0
  for (let day = 1; day <= 12; day++) {
    const dayId = idSource.shootDay(day)
    for (const unitId of [idSource.unitMain, idSource.unitSecond]) {
      const sduRows = await db.select<Record<string, unknown>[]>(
        `SELECT id FROM shoot_day_units WHERE shoot_day_id = $1 AND unit_id = $2 AND deleted_at IS NULL`,
        [dayId, unitId]
      )
      const sduId = sduRows[0]?.id as string | null
      let sortIndex = 0
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)`,
        [idSource.strip(stripIdx++), productionId, dayId, sduId, 'CALL', 'Call 07:00', sortIndex++, ts, ts]
      )
      for (let sc = 1; sc <= 5; sc++) {
        const mixed = options.mixedStripSceneNumbersByDay?.[day - 1]
        const sceneNum = mixed?.[sc - 1] ?? (day - 1) * 4 + sc
        if (sceneNum < 1 || sceneNum > sceneCount) continue
        const sceneId = idSource.scene(sceneNum)
        const shotId = firstShotIdBySceneId.get(sceneId) ?? null
        await db.execute(
          `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, sort_index, strip_status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'SHOT', $5, $6, $7, 'SCHEDULED', $8, $9)`,
          [idSource.strip(stripIdx++), productionId, dayId, sduId, sceneId, shotId, sortIndex++, ts, ts]
        )
      }
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)`,
        [idSource.strip(stripIdx++), productionId, dayId, sduId, 'LUNCH', 'Lunch 13:00', sortIndex++, ts, ts]
      )
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8, $9)`,
        [idSource.strip(stripIdx++), productionId, dayId, sduId, 'WRAP', 'Wrap 18:00', sortIndex++, ts, ts]
      )
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, title, description, sort_index, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10)`,
        [idSource.strip(stripIdx++), productionId, dayId, sduId, 'NOTE', 'Unit note', 'Demo note', sortIndex++, ts, ts]
      )
    }
  }

  const trackTitles = ['Opening Theme', 'Chase Sequence', 'Love Scene', 'Tension Build', 'End Credits', 'Ambient 1', 'Ambient 2', 'Action Sting', 'Emotional', 'Transition']
  for (let i = 1; i <= 10; i++) {
    const episodeId = options.musicEpisodeIdForIndex?.(i) ?? null
    await db.execute(
      `INSERT INTO music_tracks (id, production_id, episode_id, title, artist, publisher_label, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [idSource.musicTrack(i), productionId, episodeId, trackTitles[i - 1], 'Demo Artist', 'Demo Music Co', ts, ts]
    )
  }

  for (let i = 1; i <= 10; i++) {
    await db.execute(
      `INSERT INTO clearances (id, production_id, type, item_id, status, requested_at, granted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [idSource.clearance(i), productionId, 'music', idSource.musicTrack(i), i % 2 === 0 ? 'granted' : 'pending', ts, i % 2 === 0 ? ts : null, ts, ts]
    )
  }

  if (options.persistShootDayBlocsAfterSeed) {
    for (let d = 1; d <= 12; d++) {
      const shootDate = addDaysLocal(startDate, d - 1)
      await persistShootDayShootingBlocId(idSource.shootDay(d), productionId, shootDate)
    }
  }

  if (options.includeDocuments) {
    const nsLoc0 = NORTH_SHORE_LOCATIONS[0]!
    const locReleasePdf = await generateLocationReleaseCover({
      productionName: demoProductionDisplayName,
      locationName: northShoreLayout ? nsLoc0.name : 'Mint Building',
      address: northShoreLayout ? nsLoc0.address.split(',')[0] ?? nsLoc0.address : '105 Main St',
    })
    const locPath = `${ATTACHMENTS}/${attachmentBasePrefix}-location-release.pdf`
    await writeFile(locPath, locReleasePdf, { baseDir: BaseDirectory.AppData })
    await db.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        idSource.document(1),
        productionId,
        'location_release',
        northShoreLayout ? idSource.location(1) : idSource.location(5),
        `${attachmentBasePrefix}-location-release.pdf`,
        locPath,
        'application/pdf',
        ts,
        ts,
      ]
    )

    const contribPdf = await generateContributorFormCover({
      productionName: demoProductionDisplayName,
      contributorName: 'Jade Mercer',
      role: "Eleanor 'Jade' Mercer",
    })
    const contribPath = `${ATTACHMENTS}/${attachmentBasePrefix}-contributor-form.pdf`
    await writeFile(contribPath, contribPdf, { baseDir: BaseDirectory.AppData })
    await db.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        idSource.document(2),
        productionId,
        'contributor_form',
        idSource.person(1),
        `${attachmentBasePrefix}-contributor-form.pdf`,
        contribPath,
        'application/pdf',
        ts,
        ts,
      ]
    )

    const callSheetPath = `${ATTACHMENTS}/${attachmentBasePrefix}-call-sheet.pdf`
    const shootDay = await db.select<Record<string, unknown>[]>(`SELECT * FROM shoot_days WHERE id = $1`, [idSource.shootDay(1)])
    if (shootDay.length) {
      const data = await buildCallSheetDataForSeed(productionId, idSource.shootDay(1), startDate)
      const callPdfBytes = await generateCallSheetPdf(data)
      await writeFile(callSheetPath, new Uint8Array(callPdfBytes), { baseDir: BaseDirectory.AppData })
    }
    await db.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        idSource.document(3),
        productionId,
        'call_sheet',
        idSource.shootDay(1),
        `${attachmentBasePrefix}-call-sheet.pdf`,
        callSheetPath,
        'application/pdf',
        ts,
        ts,
      ]
    )

    for (let i = 4; i <= 10; i++) {
      const fileName = `${attachmentBasePrefix}-doc-${i}.txt`
      const path = `${ATTACHMENTS}/${fileName}`
      await writeTextFile(path, `Demo document ${i} for Albatross.\nGenerated at ${ts}`, { baseDir: BaseDirectory.AppData })
      await db.execute(
        `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [idSource.document(i), productionId, null, null, fileName, path, 'text/plain', ts, ts]
      )
    }

    const cueRows = trackTitles.map((title) => ({
      title,
      artist: 'Demo Artist',
      publisher: 'Demo Music Co',
    }))
    const cuePdf = await generateCueSheet(demoProductionDisplayName, cueRows)
    const cuePath = `${ATTACHMENTS}/${attachmentBasePrefix}-cue-sheet.pdf`
    await writeFile(cuePath, cuePdf, { baseDir: BaseDirectory.AppData })
    await db.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        idSource.document(11),
        productionId,
        'cue_sheet',
        null,
        `${attachmentBasePrefix}-cue-sheet.pdf`,
        cuePath,
        'application/pdf',
        ts,
        ts,
      ]
    )
    await db.execute(
      `INSERT INTO cue_sheets (id, production_id, generated_at, document_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idSource.cueSheet, productionId, ts, idSource.document(11), ts, ts]
    )
  }

  if (options.includeExchangeRate) {
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
}

function parseCallSheetMealTimesFromJson(raw: string | null | undefined): Array<{ name: string; time: string }> {
  if (!raw?.trim()) return []
  try {
    const arr = JSON.parse(raw) as Array<{ name?: string; time?: string }>
    return Array.isArray(arr) ? arr.map((m) => ({ name: m.name ?? 'Meal', time: m.time ?? '—' })) : []
  } catch {
    return []
  }
}

async function buildCallSheetDataForSeed(
  productionId: string,
  shootDayId: string,
  fallbackShootDate: string
): Promise<import('@/lib/pdf/callSheet').CallSheetData> {
  const db = await getDb()
  const prodRows = await db.select<Record<string, unknown>[]>(
    `SELECT name, is_episodic FROM productions WHERE id = $1`,
    [productionId]
  )
  const isEpisodicProduction = Number(prodRows[0]?.is_episodic ?? 0) === 1
  const dayRows = await db.select<Record<string, unknown>[]>(`SELECT * FROM shoot_days WHERE id = $1`, [shootDayId])
  const strips = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM stripboard_strips WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY sort_index`,
    [shootDayId]
  )
  const keyContactRows = await db.select<Record<string, unknown>[]>(
    `SELECT department, name, phone, email FROM key_contacts WHERE production_id = $1 AND deleted_at IS NULL ORDER BY department`,
    [productionId]
  )
  const keyContactsMapped = keyContactRows.map((r) => ({
    department: r.department as string,
    name: r.name as string | null,
    phone: r.phone as string | null,
    email: r.email as string | null,
    notes: null as string | null,
  }))
  const peopleRows = await db.select<Record<string, unknown>[]>(
    `SELECT name FROM people WHERE production_id = $1 AND is_cast = 1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  const locRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, name, address FROM locations WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  const locById = new Map((locRows || []).map((r) => [r.id as string, r]))
  const sceneRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, scene_number, title, heading, description, int_ext, day_night, page_eighths, location_id, episode_id FROM scenes WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  const shotRows = await db.select<Record<string, unknown>[]>(
    `SELECT sh.id, sh.scene_id, sh.shot_number, sh.description, sh.shot_description, sh.notes
     FROM shots sh
     INNER JOIN scenes sc ON sc.id = sh.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL
     WHERE sh.deleted_at IS NULL`,
    [productionId]
  )
  const sceneMap = new Map((sceneRows || []).map((r) => [r.id as string, r]))
  const shotMap = new Map((shotRows || []).map((r) => [r.id as string, r]))
  const sceneByEpisode = new Map(
    (sceneRows || []).map((r) => [r.id as string, { episode_id: (r.episode_id as string | null) ?? null }])
  )
  const shotByScene = new Map(
    (shotRows || []).map((r) => [r.id as string, { scene_id: r.scene_id as string }])
  )
  let episodeById = new Map<string, { name: string }>()
  let blocsById = new Map<string, { name: string }>()
  if (isEpisodicProduction) {
    const epRows = await db.select<Record<string, unknown>[]>(
      `SELECT id, name FROM episodes WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    )
    episodeById = new Map((epRows || []).map((r) => [r.id as string, { name: r.name as string }]))
    const blocRows = await db.select<Record<string, unknown>[]>(
      `SELECT id, name FROM shooting_blocs WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    )
    blocsById = new Map((blocRows || []).map((r) => [r.id as string, { name: r.name as string }]))
  }

  const productionName = (prodRows[0]?.name as string) ?? 'Demo'
  const day = dayRows[0] as Record<string, unknown>
  const shootDate = (day?.shoot_date as string) ?? fallbackShootDate
  const locState = { lastLocationId: null as string | null }
  const schedule: import('@/lib/pdf/callSheet').CallSheetStrip[] = []
  for (const s of strips) {
    const sceneId = s.scene_id as string | null
    const shotId = s.shot_id as string | null
    const scRaw = sceneId ? sceneMap.get(sceneId) : undefined
    const shRaw = shotId ? shotMap.get(shotId) : undefined
    const scene =
      scRaw != null
        ? {
            id: scRaw.id as string,
            scene_number: scRaw.scene_number as string,
            heading: (scRaw.heading as string) ?? null,
            title: (scRaw.title as string) ?? null,
            description: (scRaw.description as string) ?? null,
            int_ext: (scRaw.int_ext as string) ?? null,
            day_night: (scRaw.day_night as string) ?? null,
            page_eighths: (scRaw.page_eighths as number) ?? null,
            location_id: (scRaw.location_id as string) ?? null,
          }
        : null
    const shot =
      shRaw != null
        ? {
            shot_number: shRaw.shot_number as string,
            description: (shRaw.description as string) ?? null,
            shot_description: (shRaw.shot_description as string) ?? null,
            notes: (shRaw.notes as string) ?? null,
          }
        : null
    const locRec = scene?.location_id ? locById.get(scene.location_id) : undefined
    const locName = locRec ? ((locRec.name as string) ?? null) : null
    let row = buildCallSheetStripFromStripboard(
      {
        strip_type: s.strip_type as string,
        scene_id: sceneId,
        shot_id: shotId,
        title: (s.title as string) ?? null,
        description: (s.description as string) ?? null,
      },
      scene,
      shot,
      locName,
      locState,
      [],
      [],
    )
    if (isEpisodicProduction) {
      const ep = enrichCallSheetStripEpisodeLabel({
        strip: {
          strip_type: s.strip_type as string,
          scene_id: sceneId,
          shot_id: shotId,
        },
        shotById: shotByScene,
        sceneById: sceneByEpisode,
        episodeById,
        includeEpisodes: true,
      })
      row = { ...row, ...ep }
    }
    schedule.push(row)
  }

  const shootingBlocId = (day?.shooting_bloc_id as string | null) ?? null
  const shootingBlocMastheadLabel = shootingBlocMastheadLabelForCallSheet({
    isEpisodicProduction,
    shootingBlocId,
    blocsById,
  })

  return {
    productionName,
    isEpisodicProduction,
    includeEpisodesInSchedule: isEpisodicProduction,
    shootingBlocMastheadLabel,
    shootDate,
    unitName: 'Main Unit',
    dayNumber: (day?.day_number as number) ?? null,
    callTime: (day?.call_time as string) ?? '07:00',
    wrapTime: (day?.wrap_time as string) ?? '18:00',
    dayNotes: (day?.notes as string) ?? null,
    unitNotes: null,
    keyContacts: keyContactsMapped,
    primaryContactsTop: selectPrimaryCallSheetContacts(keyContactsMapped),
    hospitalName: (day?.hospital_name as string) ?? null,
    hospitalAddress: (day?.hospital_address as string) ?? null,
    policeStationName: (day?.police_station_name as string) ?? null,
    policeStationAddress: (day?.police_station_address as string) ?? null,
    weatherSummary: null,
    weatherManual: (day?.weather_manual as string) ?? null,
    weatherStored: parseCallSheetWeatherJson((day?.weather_json as string) ?? null),
    weatherSunrise: null,
    weatherSunset: null,
    parkingBaseAddress: (day?.parking_base_address as string) ?? null,
    mealTimes: parseCallSheetMealTimesFromJson(day?.meal_times_json as string | null),
    specialNotes: (day?.special_notes as string) ?? null,
    schedule,
    crewGroups: [],
    advancedScheduleDays: [],
    castCalled: peopleRows.map((r) => r.name as string),
    locations: locRows.map((r) => ({
      name: r.name as string,
      address: r.address as string | null,
      what3words: null,
      notes: null,
    })),
  }
}
