import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import { ApfInvalidDataError, ApfMigrationError } from '@/lib/importExport/errors'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfV1DataFile, ApfV1Tables } from '@/lib/importExport/payload'
import { assertApfManifestDataFormatVersionAligned } from '@/lib/importExport/payload'
import { APF_V10_TABLE_KEYS, APF_V11_TABLE_KEYS, APF_V9_TABLE_KEYS } from '@/lib/importExport/tableKeys'

export type ApfMigrationContext = {
  manifest: ApfManifestV1
  data: ApfV1DataFile
}

/**
 * One step in the file-level migration chain (e.g. v1 → v2).
 * Implementations must update both `manifest.formatVersion` and `data.formatVersion` to `toVersion`.
 */
export type ApfFileMigrator = {
  fromVersion: number
  toVersion: number
  migrate: (ctx: ApfMigrationContext) => ApfMigrationContext
}

function cloneCtx(ctx: ApfMigrationContext): ApfMigrationContext {
  return JSON.parse(JSON.stringify(ctx)) as ApfMigrationContext
}

const BUDGET_REVISION_CHILD_TABLES = [
  'fringe_rules',
  'contingency_rules',
  'cost_report_groups',
  'production_totals',
  'budget_items',
  'budget_item_expense_links',
  'floats',
] as const satisfies readonly (keyof ApfV1Tables)[]

/** v2 files exported budget rows with revision FKs but omitted the parent table. */
export function synthesizeMissingBudgetRevisions(tables: ApfV1Tables): void {
  if (tables.budget_revisions.length > 0) return

  const prod = tables.productions[0]
  const productionId = prod?.id != null ? String(prod.id) : ''
  if (!productionId) return

  const revisionIds = new Set<string>()
  for (const table of BUDGET_REVISION_CHILD_TABLES) {
    for (const row of tables[table]) {
      const rid = row.budget_revision_id
      if (rid != null && String(rid).length > 0) revisionIds.add(String(rid))
    }
  }
  if (revisionIds.size === 0) return

  const sortedIds = [...revisionIds].sort()
  const now = new Date().toISOString()
  tables.budget_revisions = sortedIds.map((id, idx) => ({
    id,
    production_id: productionId,
    name: idx === 0 ? 'Current budget' : `Imported revision ${idx + 1}`,
    created_from_revision_id: null,
    is_live: idx === 0 ? 1 : 0,
    approval: 'unapproved',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }))
}

const migrateV1ToV2: ApfFileMigrator = {
  fromVersion: 1,
  toVersion: 2,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 2
    next.data.formatVersion = 2
    const t = next.data.tables
    if (!Array.isArray(t.episodes)) t.episodes = []
    if (!Array.isArray(t.shooting_blocs)) t.shooting_blocs = []
    const prows = t.productions
    if (Array.isArray(prows) && prows.length > 0) {
      const p0 = { ...prows[0] } as Record<string, unknown>
      if (!('is_episodic' in p0)) p0.is_episodic = 0
      if (!('client_id' in p0)) p0.client_id = null
      if (!('delivery_date' in p0)) p0.delivery_date = null
      t.productions = [p0, ...prows.slice(1)] as typeof t.productions
    }
    return next
  },
}

const migrateV2ToV3: ApfFileMigrator = {
  fromVersion: 2,
  toVersion: 3,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 3
    next.data.formatVersion = 3
    if (!Array.isArray(next.data.tables.budget_revisions)) next.data.tables.budget_revisions = []
    if (!Array.isArray(next.data.tables.floats)) next.data.tables.floats = []
    if (!Array.isArray(next.data.tables.float_expense_links)) next.data.tables.float_expense_links = []
    synthesizeMissingBudgetRevisions(next.data.tables)
    return next
  },
}

function isBlankCell(value: unknown): boolean {
  return value == null || String(value).trim() === ''
}

/** v4 drops redundant `scenes.heading`; preserve label text in `title` when it was the only value. */
export function migrateScenesDropHeading(tables: ApfV1Tables): void {
  for (const row of tables.scenes) {
    const scene = row as Record<string, unknown>
    const heading = scene.heading
    if (isBlankCell(scene.title) && !isBlankCell(heading)) {
      scene.title = String(heading).trim()
    }
    delete scene.heading
    if (scene.day_night === 'UNK') scene.day_night = null
    if (scene.int_ext === 'UNK') scene.int_ext = null
  }
}

const migrateV3ToV4: ApfFileMigrator = {
  fromVersion: 3,
  toVersion: 4,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 4
    next.data.formatVersion = 4
    migrateScenesDropHeading(next.data.tables)
    return next
  },
}

/**
 * v5 adds `vendor_purchase_order_amendments` and `vendor_purchase_order_expenses.allocated_amount`.
 * Older payloads get an empty amendments table (injected before validation); a missing
 * `allocated_amount` imports as NULL, which means "whole expense" for single-PO expenses.
 */
const migrateV4ToV5: ApfFileMigrator = {
  fromVersion: 4,
  toVersion: 5,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 5
    next.data.formatVersion = 5
    if (!Array.isArray(next.data.tables.vendor_purchase_order_amendments)) {
      next.data.tables.vendor_purchase_order_amendments = []
    }
    return next
  },
}

/**
 * v6 adds `expense_receipts` (receipt metadata keyed to an `expense_receipt` document).
 * Older payloads get an empty table (injected before validation).
 */
const migrateV5ToV6: ApfFileMigrator = {
  fromVersion: 5,
  toVersion: 6,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 6
    next.data.formatVersion = 6
    if (!Array.isArray(next.data.tables.expense_receipts)) {
      next.data.tables.expense_receipts = []
    }
    return next
  },
}

/**
 * v7 adds `vendor_purchase_orders.currency_code` / `exchange_rate` (NULL = production currency) and makes
 * `approval` a value DERIVED from `status` (approved / closed => 1). Older rows import with NULL currency;
 * POs that were ticked approved but still draft / issued become `approved` (matches SQLite migration 0090).
 */
const migrateV6ToV7: ApfFileMigrator = {
  fromVersion: 6,
  toVersion: 7,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 7
    next.data.formatVersion = 7
    const pos = next.data.tables.vendor_purchase_orders
    if (Array.isArray(pos)) {
      next.data.tables.vendor_purchase_orders = pos.map((row) => {
        const r = { ...(row as Record<string, unknown>) }
        const ticked = r.approval === 1 || r.approval === true || r.approval === '1'
        if (ticked && (r.status === 'draft' || r.status === 'issued')) r.status = 'approved'
        r.approval = r.status === 'approved' || r.status === 'closed' ? 1 : 0
        if (r.currency_code === undefined) r.currency_code = null
        if (r.exchange_rate === undefined) r.exchange_rate = null
        return r
      }) as typeof pos
    }
    return next
  },
}

/**
 * v8 adds risk assessments (`risk_assessments`, `risk_assessment_units`, `risk_assessment_hazards`)
 * and project hazard templates (`hazard_templates`). Older payloads get empty tables.
 */
const migrateV7ToV8: ApfFileMigrator = {
  fromVersion: 7,
  toVersion: 8,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 8
    next.data.formatVersion = 8
    for (const key of [
      'hazard_templates',
      'risk_assessments',
      'risk_assessment_units',
      'risk_assessment_hazards',
    ] as const) {
      if (!Array.isArray(next.data.tables[key])) next.data.tables[key] = []
    }
    return next
  },
}

/**
 * v9 adds the script sections / sides builder tables (`script_versions`, `script_pages`, `script_sections`,
 * `script_section_ranges`, `script_section_characters`, `shot_script_sections`, `shoot_day_sides_exports`) and the
 * script supervisor tables (slates, takes, scene progress, day logs, script elements, tramlines, annotations,
 * continuity media, revision items). Older payloads get empty tables.
 *
 * `shoot_day_units.movement_order_json` and `shoot_days.movement_pins_json` also arrive in v9 files; they are plain
 * columns, so older rows simply import with NULL (the importer only inserts columns present in the row).
 */
const migrateV8ToV9: ApfFileMigrator = {
  fromVersion: 8,
  toVersion: 9,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 9
    next.data.formatVersion = 9
    for (const key of APF_V9_TABLE_KEYS) {
      if (!Array.isArray(next.data.tables[key])) next.data.tables[key] = []
    }
    return next
  },
}

/** v10 adds the script breakdown tables (`breakdown_elements`, `breakdown_tags`). Older payloads get empty tables. */
const migrateV9ToV10: ApfFileMigrator = {
  fromVersion: 9,
  toVersion: 10,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 10
    next.data.formatVersion = 10
    for (const key of APF_V10_TABLE_KEYS) {
      if (!Array.isArray(next.data.tables[key])) next.data.tables[key] = []
    }
    return next
  },
}

/**
 * v11 adds storyboard imports and images, vendor production exclusions and the overtime tables
 * (`production_crew_hours_settings`, `crew_hours_person_settings`, `crew_day_hours`). Older payloads get empty tables.
 */
const migrateV10ToV11: ApfFileMigrator = {
  fromVersion: 10,
  toVersion: 11,
  migrate: (ctx) => {
    const next = cloneCtx(ctx)
    next.manifest.formatVersion = 11
    next.data.formatVersion = 11
    for (const key of APF_V11_TABLE_KEYS) {
      if (!Array.isArray(next.data.tables[key])) next.data.tables[key] = []
    }
    return next
  },
}

/** Registered migrators for older `.apf` payloads (sequential v → v+1). */
export const APF_FILE_MIGRATIONS: ApfFileMigrator[] = [
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
  migrateV6ToV7,
  migrateV7ToV8,
  migrateV8ToV9,
  migrateV9ToV10,
  migrateV10ToV11,
]

/**
 * Applies sequential migrators until `manifest.formatVersion === CURRENT_APF_FORMAT_VERSION`.
 * Requires manifest and data versions to match before and after each step.
 */
export function migrateApfToCurrentVersion(ctx: ApfMigrationContext): ApfMigrationContext {
  let cur = ctx
  assertApfManifestDataFormatVersionAligned(cur.manifest.formatVersion, cur.data.formatVersion)

  let v = cur.manifest.formatVersion
  while (v < CURRENT_APF_FORMAT_VERSION) {
    const next = v + 1
    const migrator = APF_FILE_MIGRATIONS.find((m) => m.fromVersion === v && m.toVersion === next)
    if (!migrator) {
      throw new ApfMigrationError(
        `No file-level migration from formatVersion ${v} to ${next}. Update Albatross or obtain a compatible .apf.`,
        'MIGRATION_MISSING'
      )
    }
    cur = migrator.migrate(cur)
    assertApfManifestDataFormatVersionAligned(cur.manifest.formatVersion, cur.data.formatVersion)
    if (cur.manifest.formatVersion !== next) {
      throw new ApfMigrationError(
        `Migration ${v}→${next} did not set manifest.formatVersion to ${next}`,
        'MIGRATION_FAILED'
      )
    }
    if (cur.data.formatVersion !== next) {
      throw new ApfMigrationError(
        `Migration ${v}→${next} did not set data formatVersion to ${next}`,
        'MIGRATION_FAILED'
      )
    }
    v = next
  }

  if (cur.manifest.formatVersion !== CURRENT_APF_FORMAT_VERSION) {
    throw new ApfInvalidDataError(
      `After migrations, expected formatVersion ${CURRENT_APF_FORMAT_VERSION}, got ${cur.manifest.formatVersion}`
    )
  }
  return cur
}
