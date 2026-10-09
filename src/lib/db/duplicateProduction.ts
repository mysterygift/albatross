/**
 * Duplicate a production and all its related rows + attachment files.
 *
 * Root cause of "deletion stops working after duplicate": The Tauri SQL plugin uses a
 * connection pool; separate execute() calls can run on different connections. The previous
 * implementation had reserveSlugAndInsertProduction() run BEGIN + INSERT production on one
 * connection, then duplicateProduction() ran more INSERTs and COMMIT on other connections.
 * That left the first connection with an open transaction; when that connection was later
 * reused for soft-delete (UPDATE productions SET deleted_at ...) or hard-delete, the write
 * ran inside the stale transaction and was never committed, so deletion appeared to do nothing.
 *
 * Fix: Use a single executeBatch(BEGIN, ...all INSERTs..., COMMIT) so the entire transaction
 * runs in one execute() on one connection. Duplicate always gets a new id, new unique slug
 * (from slugify(newName), never the source slug), and all child rows reference the new production_id.
 * Attachments are copied to a new folder under the new production id.
 * Does not push to outbox (duplication is local-only).
 */
import { BaseDirectory, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { getCurrentSessionUserId } from '@/lib/auth/currentSessionUser'
import { executeBatch, getDb, now, uuid } from './client'
import { coerceBoolean } from './sqlValueCoercion'
import { seedDefaultBudgetAccounts } from './repositories/budgetAccounts'
import { projectMembershipInsertStatement } from './repositories/projectMemberships'
import { ensureUniqueSlug, slugify, withSlugLock } from './repositories/production'

/**
 * Production-scoped tables (or tables hanging off one) that duplication deliberately does NOT copy, with the
 * reason. `duplicateProduction.coverage.test.ts` fails when a new production-scoped table is neither copied by an
 * `INSERT` below nor listed here, so adding a table forces a decision.
 */
const EXCLUDED_REASON = {
  SS: 'Script Supervisor on-set record or setting (slates, takes, progress, lining, annotations, continuity media): it records what was shot, so a what-if copy starts without it',
  SYNC: 'Server sync, sharing and publish state belongs to the original project and is never duplicated',
  BUDGET: 'Budget reconciliation, derived rules, cost reports, floats and tax-credit setup are not copied (known gap): rebuild them on the copy',
  PAYABLES: 'Vendor invoices and purchase orders are financial records of the original and are not copied (known gap)',
  OTHER: 'Not copied (known gap): bookings, call sheets, overtime hours, cue sheets, equipment, storyboard and legacy stripboard items',
}

export const DUPLICATE_EXCLUDED_TABLES: Record<string, string> = {
  script_annotation_takes: EXCLUDED_REASON.SS,
  script_annotations: EXCLUDED_REASON.SS,
  script_documents: EXCLUDED_REASON.SS,
  script_elements: EXCLUDED_REASON.SS,
  script_revision_items: EXCLUDED_REASON.SS,
  script_supervisor_day_logs: EXCLUDED_REASON.SS,
  script_supervisor_scene_progress: EXCLUDED_REASON.SS,
  slates: EXCLUDED_REASON.SS,
  takes: EXCLUDED_REASON.SS,
  tramline_segments: EXCLUDED_REASON.SS,
  tramlines: EXCLUDED_REASON.SS,
  continuity_media: EXCLUDED_REASON.SS,
  production_script_supervisor_settings: EXCLUDED_REASON.SS,
  server_outbox_pending: EXCLUDED_REASON.SYNC,
  sync_apply_guard: EXCLUDED_REASON.SYNC,
  sync_conflicts: EXCLUDED_REASON.SYNC,
  sync_mutation_batches: EXCLUDED_REASON.SYNC,
  sync_mutations: EXCLUDED_REASON.SYNC,
  sync_project_state: EXCLUDED_REASON.SYNC,
  sync_row_state: EXCLUDED_REASON.SYNC,
  project_memberships: EXCLUDED_REASON.SYNC,
  publish_jobs: EXCLUDED_REASON.SYNC,
  linked_projects: EXCLUDED_REASON.SYNC,
  budget_item_expense_links: EXCLUDED_REASON.BUDGET,
  contingency_rule_scopes: EXCLUDED_REASON.BUDGET,
  contingency_rules: EXCLUDED_REASON.BUDGET,
  cost_report_group_accounts: EXCLUDED_REASON.BUDGET,
  cost_report_groups: EXCLUDED_REASON.BUDGET,
  float_expense_links: EXCLUDED_REASON.BUDGET,
  floats: EXCLUDED_REASON.BUDGET,
  fringe_rule_scopes: EXCLUDED_REASON.BUDGET,
  fringe_rules: EXCLUDED_REASON.BUDGET,
  production_budget_features: EXCLUDED_REASON.BUDGET,
  production_total_accounts: EXCLUDED_REASON.BUDGET,
  production_totals: EXCLUDED_REASON.BUDGET,
  tax_credit_schemes: EXCLUDED_REASON.BUDGET,
  vat_reclaim_rates: EXCLUDED_REASON.BUDGET,
  expense_receipts: EXCLUDED_REASON.BUDGET,
  expense_tax_credit_allocations: EXCLUDED_REASON.BUDGET,
  vendor_invoice_expenses: EXCLUDED_REASON.PAYABLES,
  vendor_invoices: EXCLUDED_REASON.PAYABLES,
  vendor_production_exclusions: EXCLUDED_REASON.PAYABLES,
  vendor_purchase_order_amendments: EXCLUDED_REASON.PAYABLES,
  vendor_purchase_order_expenses: EXCLUDED_REASON.PAYABLES,
  vendor_purchase_orders: EXCLUDED_REASON.PAYABLES,
  bookings: EXCLUDED_REASON.OTHER,
  call_sheets: EXCLUDED_REASON.OTHER,
  crew_day_hours: EXCLUDED_REASON.OTHER,
  crew_hours_person_settings: EXCLUDED_REASON.OTHER,
  production_crew_hours_settings: EXCLUDED_REASON.OTHER,
  cue_sheets: EXCLUDED_REASON.OTHER,
  equipment: EXCLUDED_REASON.OTHER,
  equipment_list_items: EXCLUDED_REASON.OTHER,
  equipment_lists: EXCLUDED_REASON.OTHER,
  storyboard_images: EXCLUDED_REASON.OTHER,
  storyboard_imports: EXCLUDED_REASON.OTHER,
  stripboard_items: EXCLUDED_REASON.OTHER,
}

/**
 * Columns of copied tables that are deliberately left at their defaults in the copy (table -> column -> reason).
 * The same test fails when a column is added to a copied table without being inserted or listed here.
 */
export const DUPLICATE_EXCLUDED_COLUMNS: Record<string, Record<string, string>> = {
  productions: {
    archived_at: 'the copy starts active',
    wrapped_at: 'the copy starts un-wrapped',
    created_from_template: 'the copy is not created from a template',
    deleted_at: 'the copy starts live',
  },
  production_tasks: {
    vendor_invoice_id: 'vendor invoices are not copied, so the task link would dangle',
    equipment_id: 'equipment is not copied, so the task link would dangle',
  },
  breakdown_tags: {
    carried_from_id: 'carried-from history stays with the original tags',
  },
}

const ATTACHMENTS = 'attachments'
const TABLE_PRODUCTIONS = 'productions'

type IdMap = Map<string, string>
type Stmt = { sql: string; bindValues: unknown[] }

function newId(): string {
  return uuid()
}

function mapId(map: IdMap, oldId: string | null): string | null {
  if (oldId == null) return null
  return map.get(oldId) ?? oldId
}

/** Episode ids not present in the map (e.g. archived source episodes) become null to satisfy FK on the copy. */
function mapEpisodeIdForDuplicate(map: IdMap, oldId: string | null | undefined): string | null {
  if (oldId == null) return null
  const t = String(oldId).trim()
  if (t === '') return null
  return map.has(t) ? map.get(t)! : null
}

export async function duplicateProduction(
  sourceProductionId: string,
  newName: string
): Promise<{ id: string; name: string; slug: string }> {
  const db = await getDb()
  const ts = now()

  const prodRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE_PRODUCTIONS} WHERE id = $1 AND deleted_at IS NULL`,
    [sourceProductionId]
  )
  if (prodRows.length === 0) throw new Error('Production not found')

  const newProdId = newId()
  const currencyCode = (prodRows[0]!.currency_code as string) ?? 'GBP'
  const notes = (prodRows[0]!.notes as string | null) ?? null
  const isEpisodic = coerceBoolean(prodRows[0]!.is_episodic, false)
  const clientId = (prodRows[0]!.client_id as string | null) ?? null
  const deliveryDate = (prodRows[0]!.delivery_date as string | null) ?? null
  const productionCode = (prodRows[0]!.production_code as string | null) ?? null

  // Load all source data first (reads only).
  const [units, people, locations, scenes, shootDays, sduRows, locScenes, shots, sceneCast, shotCast, strips, castAvail, crewAvail, categories, budgetItems, vendors, expRows, expenseTransactionDetails, keyContacts, taskSections, tasks, deliverables, techSpecs, musicTracks, clearances, equipmentTerms, docs, crewHierarchyConfigs, episodes, shootingBlocs, scriptVersions, scriptPages, scriptSections, scriptSectionRanges, scriptSectionCharacters, shotScriptSections, shootDaySidesExports, hazardTemplateRows, riskAssessmentRows, riskAssessmentUnitRows, riskAssessmentHazardRows, breakdownElements, breakdownTags, budgetAccounts, budgetRevisions, budgetItemDetails] = await Promise.all([
    db.select<Record<string, unknown>[]>(`SELECT * FROM units WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM people WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM locations WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM scenes WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM shoot_days WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT sdu.* FROM shoot_day_units sdu INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id AND sd.production_id = $1 AND sd.deleted_at IS NULL WHERE sdu.deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT ls.* FROM location_scene ls INNER JOIN locations loc ON loc.id = ls.location_id AND loc.production_id = $1 AND loc.deleted_at IS NULL WHERE ls.deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT s.* FROM shots s INNER JOIN scenes sc ON sc.id = s.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL WHERE s.deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM scene_cast WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM shot_cast WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM stripboard_strips WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM cast_availability WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM crew_availability WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM budget_categories WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM budget_items WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM vendors WHERE production_id = $1 AND deleted_at IS NULL AND is_global = 0`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM expenses WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(
      `SELECT d.* FROM expense_transaction_details d INNER JOIN expenses e ON e.id = d.expense_id WHERE e.production_id = $1 AND e.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(`SELECT * FROM key_contacts WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM production_task_sections WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM production_tasks WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM deliverables WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT ts.* FROM technical_specs ts INNER JOIN deliverables d ON d.id = ts.deliverable_id AND d.production_id = $1 AND d.deleted_at IS NULL WHERE ts.deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM music_tracks WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM clearances WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM equipment_terms WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM documents WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM production_crew_hierarchy_configs WHERE production_id = $1`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM episodes WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM shooting_blocs WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(`SELECT * FROM script_versions WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(
      `SELECT sp.* FROM script_pages sp INNER JOIN script_versions sv ON sv.id = sp.script_version_id AND sv.production_id = $1 AND sv.deleted_at IS NULL WHERE sp.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(`SELECT * FROM script_sections WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(
      `SELECT r.* FROM script_section_ranges r INNER JOIN script_sections ss ON ss.id = r.section_id AND ss.production_id = $1 AND ss.deleted_at IS NULL WHERE r.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT c.* FROM script_section_characters c INNER JOIN script_sections ss ON ss.id = c.section_id AND ss.production_id = $1 AND ss.deleted_at IS NULL WHERE c.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT l.* FROM shot_script_sections l
       INNER JOIN shots sh ON sh.id = l.shot_id AND sh.deleted_at IS NULL
       INNER JOIN scenes sc ON sc.id = sh.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL
       WHERE l.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(`SELECT * FROM shoot_day_sides_exports WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM hazard_templates WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM risk_assessments WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(
      `SELECT rau.* FROM risk_assessment_units rau
       INNER JOIN risk_assessments ra ON ra.id = rau.risk_assessment_id AND ra.production_id = $1 AND ra.deleted_at IS NULL
       WHERE rau.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT h.* FROM risk_assessment_hazards h
       INNER JOIN risk_assessments ra ON ra.id = h.risk_assessment_id AND ra.production_id = $1 AND ra.deleted_at IS NULL
       WHERE h.deleted_at IS NULL`,
      [sourceProductionId]
    ),
    db.select<Record<string, unknown>[]>(`SELECT * FROM breakdown_elements WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM breakdown_tags WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM budget_accounts WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM budget_revisions WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(
      `SELECT d.* FROM budget_item_details d INNER JOIN budget_items bi ON bi.id = d.budget_item_id WHERE bi.production_id = $1 AND bi.deleted_at IS NULL`,
      [sourceProductionId]
    ),
  ])

  const taskIdMap: IdMap = new Map()
  const sectionIdMap: IdMap = new Map()
  const unitIdMap: IdMap = new Map()
  const personIdMap: IdMap = new Map()
  const locationIdMap: IdMap = new Map()
  const sceneIdMap: IdMap = new Map()
  const episodeIdMap: IdMap = new Map()
  const shootDayIdMap: IdMap = new Map()
  const shootDayUnitIdMap: IdMap = new Map()
  const categoryIdMap: IdMap = new Map()
  const vendorIdMap: IdMap = new Map()
  const expenseIdMap: IdMap = new Map()
  const accountIdMap: IdMap = new Map()
  const budgetRevisionIdMap: IdMap = new Map()
  const budgetItemIdMap: IdMap = new Map()
  const deliverableIdMap: IdMap = new Map()
  const musicTrackIdMap: IdMap = new Map()
  const documentIdMap: IdMap = new Map()
  const shootingBlocIdMap: IdMap = new Map()
  const scriptVersionIdMap: IdMap = new Map()
  const scriptPageIdMap: IdMap = new Map()
  const scriptSectionIdMap: IdMap = new Map()
  const scriptSectionRangeIdMap: IdMap = new Map()
  const scriptSectionCharacterIdMap: IdMap = new Map()
  const shotScriptSectionIdMap: IdMap = new Map()
  const sidesExportIdMap: IdMap = new Map()
  const docNewPaths: { oldPath: string; newPath: string; docId: string }[] = []

  const slug = await withSlugLock(() => ensureUniqueSlug(slugify(newName)))

  const statements: Stmt[] = [
    { sql: 'BEGIN TRANSACTION', bindValues: [] },
    {
      sql: `INSERT INTO ${TABLE_PRODUCTIONS} (id, name, slug, currency_code, notes, client_id, delivery_date, is_episodic, created_at, updated_at, production_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      bindValues: [newProdId, newName, slug, currencyCode, notes, clientId, deliveryDate, isEpisodic ? 1 : 0, ts, ts, productionCode],
    },
  ]

  // Whoever duplicates owns the copy; otherwise a non-admin could not see it. Memberships are not copied.
  const duplicatorId = await getCurrentSessionUserId()
  if (duplicatorId) {
    statements.push(
      projectMembershipInsertStatement({ id: newId(), productionId: newProdId, userId: duplicatorId, accessLevel: 'administrator', ts })
    )
  }

  for (const r of episodes) {
    const id = newId()
    episodeIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [id, newProdId, r.name, r.sort_order ?? 0, ts, ts],
    })
  }
  for (const r of shootingBlocs) {
    const blocId = newId()
    shootingBlocIdMap.set(r.id as string, blocId)
    statements.push({
      sql: `INSERT INTO shooting_blocs (id, production_id, name, start_date, end_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      bindValues: [blocId, newProdId, r.name, r.start_date, r.end_date, ts, ts],
    })
  }

  for (const r of units) {
    const id = newId()
    unitIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      bindValues: [id, newProdId, r.name, ts, ts],
    })
  }
  for (const r of people) {
    const id = newId()
    personIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO people (id, production_id, name, name_sort_key, is_cast, email, phone, department, phases, notes, contributor_form_status, cast_number, agent_name, agent_email, agent_phone, role_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      bindValues: [id, newProdId, r.name, r.name_sort_key ?? null, coerceBoolean(r.is_cast, false), r.email, r.phone, r.department, r.phases, r.notes, r.contributor_form_status ?? 'not_requested', r.cast_number ?? null, r.agent_name ?? null, r.agent_email ?? null, r.agent_phone ?? null, r.role_name ?? null, ts, ts],
    })
  }
  for (const r of locations) {
    const id = newId()
    locationIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO locations (id, production_id, name, name_sort_key, booked_status, address, what3words, parking_info, availability_constraints, location_fee, notes, contact_name, contact_email, contact_phone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      bindValues: [
        id,
        newProdId,
        r.name,
        r.name_sort_key ?? null,
        r.booked_status ?? 'unbooked',
        r.address,
        r.what3words ?? null,
        r.parking_info ?? null,
        r.availability_constraints,
        r.location_fee,
        r.notes,
        r.contact_name ?? null,
        r.contact_email ?? null,
        r.contact_phone ?? null,
        ts,
        ts,
      ],
    })
  }
  for (const r of scenes) {
    const id = newId()
    sceneIdMap.set(r.id as string, id)
    const locId = mapId(locationIdMap, r.location_id as string | null)
    const episodeId = mapId(episodeIdMap, (r.episode_id as string | null) ?? null)
    statements.push({
      sql: `INSERT INTO scenes (id, production_id, scene_number, title, description, int_ext, day_night, page_eighths, location_id, duration_minutes, episode_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      bindValues: [
        id,
        newProdId,
        r.scene_number,
        r.title,
        r.description,
        r.int_ext,
        r.day_night,
        r.page_eighths,
        locId,
        r.duration_minutes ?? null,
        episodeId,
        ts,
        ts,
      ],
    })
  }
  for (const r of shootDays) {
    const id = newId()
    shootDayIdMap.set(r.id as string, id)
    const shootingBlocId = mapId(shootingBlocIdMap, (r.shooting_bloc_id as string | null) ?? null)
    statements.push({
      sql: `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, notes, weather_manual, wrap_time, meal_times_json, weather_json, parking_base_address, special_notes, hospital_name, hospital_address, police_station_name, police_station_address, shooting_bloc_id, movement_pins_json, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      bindValues: [
        id,
        newProdId,
        r.shoot_date,
        r.day_number,
        r.call_time,
        r.notes,
        r.weather_manual,
        r.wrap_time ?? null,
        r.meal_times_json ?? null,
        r.weather_json ?? null,
        r.parking_base_address ?? null,
        r.special_notes ?? null,
        r.hospital_name ?? null,
        r.hospital_address ?? null,
        r.police_station_name ?? null,
        r.police_station_address ?? null,
        shootingBlocId,
        r.movement_pins_json ?? null,
        ts,
        ts,
      ],
    })
  }
  for (const r of sduRows) {
    const id = newId()
    const dayId = shootDayIdMap.get(r.shoot_day_id as string)
    const unitId = unitIdMap.get(r.unit_id as string)
    if (dayId && unitId) {
      shootDayUnitIdMap.set(r.id as string, id)
      statements.push({
        sql: `INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, notes, is_locked, movement_order_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        bindValues: [id, dayId, unitId, r.notes, coerceBoolean(r.is_locked, false), remapMovementOrderJson((r.movement_order_json as string | null) ?? null, locationIdMap), ts, ts],
      })
    }
  }
  for (const r of locScenes) {
    const locId = locationIdMap.get(r.location_id as string)
    const sceneId = sceneIdMap.get(r.scene_id as string)
    if (locId && sceneId) {
      statements.push({
        sql: `INSERT INTO location_scene (id, location_id, scene_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        bindValues: [newId(), locId, sceneId, ts, ts],
      })
    }
  }
  const shotIdMap = new Map<string, string>()
  for (const r of shots) {
    const sceneId = sceneIdMap.get(r.scene_id as string)
    if (sceneId) {
      const id = newId()
      shotIdMap.set(r.id as string, id)
      statements.push({
        sql: `INSERT INTO shots (id, scene_id, shot_number, shot_description, subject, shot_size, support, lens, duration_seconds, estimated_shoot_minutes, camera_movement, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        bindValues: [id, sceneId, r.shot_number, r.shot_description ?? null, r.subject, r.shot_size, r.support, r.lens, r.duration_seconds, r.estimated_shoot_minutes, r.camera_movement, r.notes, ts, ts],
      })
    }
  }
  for (const r of sceneCast) {
    const sceneId = sceneIdMap.get(r.scene_id as string)
    const personId = personIdMap.get(r.person_id as string)
    if (sceneId && personId) {
      statements.push({
        sql: `INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        bindValues: [newId(), newProdId, sceneId, personId, ts, ts],
      })
    }
  }
  for (const r of shotCast) {
    const shotId = shotIdMap.get(r.shot_id as string)
    const personId = personIdMap.get(r.person_id as string)
    if (shotId && personId) {
      statements.push({
        sql: `INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        bindValues: [newId(), newProdId, shotId, personId, ts, ts],
      })
    }
  }
  for (const r of strips) {
    const dayId = shootDayIdMap.get(r.shoot_day_id as string)
    if (!dayId) continue
    const sduId = mapId(shootDayUnitIdMap, r.shoot_day_unit_id as string | null)
    const sceneId = mapId(sceneIdMap, r.scene_id as string | null)
    const shotId = mapId(shotIdMap, r.shot_id as string | null)
    const stripStatus = (r.strip_status as string) ?? 'SCHEDULED'
    const originLocationId = locationIdMap.get((r.origin_location_id as string | null) ?? '') ?? null
    const destinationLocationId = locationIdMap.get((r.destination_location_id as string | null) ?? '') ?? null
    statements.push({
      sql: `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, origin_location_id, destination_location_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      bindValues: [newId(), newProdId, dayId, sduId, r.strip_type ?? 'SHOT', sceneId, shotId, r.title, r.description, r.estimated_minutes ?? null, r.sort_index ?? 0, r.color_tag, stripStatus, originLocationId, destinationLocationId, ts, ts],
    })
  }
  for (const r of castAvail) {
    const personId = personIdMap.get(r.person_id as string)
    if (personId) {
      statements.push({
        sql: `INSERT INTO cast_availability (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        bindValues: [newId(), newProdId, personId, r.start_date, r.end_date, r.availability ?? 'AVAILABLE', r.notes, ts, ts],
      })
    }
  }
  for (const r of crewAvail) {
    const personId = personIdMap.get(r.person_id as string)
    if (personId) {
      statements.push({
        sql: `INSERT INTO crew_availability (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        bindValues: [newId(), newProdId, personId, r.start_date, r.end_date, r.availability ?? 'UNAVAILABLE', r.notes, ts, ts],
      })
    }
  }
  for (const r of categories) {
    const id = newId()
    categoryIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO budget_categories (id, production_id, code, name, phase, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      bindValues: [id, newProdId, r.code, r.name, r.phase ?? 'pre', ts, ts],
    })
  }
  for (const r of vendors) {
    const id = newId()
    vendorIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO vendors (id, production_id, is_global, company_name, company_name_sort_key, primary_contact_full_name, primary_contact_email, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [id, newProdId, r.is_global ?? 0, r.company_name, r.company_name_sort_key ?? null, r.primary_contact_full_name ?? null, r.primary_contact_email ?? null, ts, ts],
    })
  }
  // Chart of accounts: copy the source's accounts (parents first) so budget and expense coding survives;
  // a source with none gets the default chart seeded after the transaction, as for a new production.
  for (const r of orderParentsFirst(budgetAccounts, 'parent_account_id')) {
    const id = newId()
    accountIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO budget_accounts (id, production_id, code, name, parent_account_id, sort_order, is_postable, archived_at, color_hex, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      bindValues: [id, newProdId, r.code, r.name, mapId(accountIdMap, (r.parent_account_id as string | null) ?? null), r.sort_order ?? 0, r.is_postable ?? 1, r.archived_at ?? null, r.color_hex ?? null, ts, ts],
    })
  }
  // Budget revisions (a revision's baseline is copied before the revisions made from it).
  for (const r of orderParentsFirst(budgetRevisions, 'created_from_revision_id')) {
    const id = newId()
    budgetRevisionIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      bindValues: [id, newProdId, r.name, budgetRevisionIdMap.get((r.created_from_revision_id as string | null) ?? '') ?? null, r.is_live ?? 0, r.approval ?? 'unapproved', ts, ts],
    })
  }
  for (const r of budgetItems) {
    const itemId = newId()
    budgetItemIdMap.set(r.id as string, itemId)
    statements.push({
      sql: `INSERT INTO budget_items (id, production_id, budget_revision_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, line_item_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      bindValues: [
        itemId,
        newProdId,
        budgetRevisionIdMap.get((r.budget_revision_id as string | null) ?? '') ?? null,
        categoryIdMap.get((r.category_id as string | null) ?? '') ?? null,
        accountIdMap.get((r.account_id as string | null) ?? '') ?? null,
        r.description,
        r.estimated_cost ?? 0,
        r.actual_cost ?? 0,
        r.vendor,
        r.status ?? 'draft',
        r.line_item_type ?? null,
        ts,
        ts,
      ],
    })
  }
  for (const r of budgetItemDetails) {
    const itemId = budgetItemIdMap.get(r.budget_item_id as string)
    if (!itemId) continue
    statements.push({
      sql: `INSERT INTO budget_item_details (id, budget_item_id, line_item_type, details_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [newId(), itemId, r.line_item_type, r.details_json, ts, ts],
    })
  }
  for (const r of expRows) {
    const expId = newId()
    expenseIdMap.set(r.id as string, expId)
    statements.push({
      sql: `INSERT INTO expenses (id, production_id, category_id, account_id, transaction_type, vendor_id, amount, date, vendor, notes, expense_type, vat_rate_percent, vat_reclaimed_amount, vat_reclaim_date, vat_reclaim_reference, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      bindValues: [
        expId,
        newProdId,
        mapId(categoryIdMap, r.category_id as string | null),
        accountIdMap.get((r.account_id as string | null) ?? '') ?? null,
        r.transaction_type ?? null,
        mapId(vendorIdMap, r.vendor_id as string | null),
        r.amount,
        r.date,
        r.vendor,
        r.notes,
        r.expense_type ?? 'other',
        r.vat_rate_percent ?? null,
        r.vat_reclaimed_amount ?? null,
        r.vat_reclaim_date ?? null,
        r.vat_reclaim_reference ?? null,
        ts,
        ts,
      ],
    })
  }
  for (const r of expenseTransactionDetails) {
    const newExpenseId = expenseIdMap.get(r.expense_id as string)
    if (!newExpenseId) continue
    statements.push({
      sql: `INSERT INTO expense_transaction_details (id, expense_id, transaction_type, details_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [newId(), newExpenseId, r.transaction_type, r.details_json, ts, ts],
    })
  }
  for (const r of keyContacts) {
    statements.push({
      sql: `INSERT INTO key_contacts (id, production_id, department, name, phone, email, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [newId(), newProdId, r.department, r.name, r.phone, r.email, r.notes, ts, ts],
    })
  }
  for (const r of taskSections) {
    const id = newId()
    sectionIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO production_task_sections (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [id, newProdId, r.name, r.sort_order ?? 0, ts, ts],
    })
  }
  // Topological order: parents before children (for parent_task_id mapping)
  const taskRows = tasks as Array<Record<string, unknown> & { id: string; parent_task_id?: string | null }>
  const taskIds = new Set(taskRows.map((t) => t.id))
  const sortedTasks: typeof taskRows = []
  const seen = new Set<string>()
  while (sortedTasks.length < taskRows.length) {
    let added = false
    for (const t of taskRows) {
      if (seen.has(t.id)) continue
      const parentId = t.parent_task_id ?? null
      const parentInList = parentId == null || taskIds.has(parentId)
      if (parentInList && (parentId == null || seen.has(parentId))) {
        sortedTasks.push(t)
        seen.add(t.id)
        added = true
      }
    }
    if (!added) {
      // Orphaned or cyclic refs: add remaining as top-level
      for (const t of taskRows) {
        if (!seen.has(t.id)) {
          sortedTasks.push({ ...t, parent_task_id: null })
          seen.add(t.id)
        }
      }
      break
    }
  }
  for (const r of sortedTasks) {
    const id = newId()
    taskIdMap.set(r.id, id)
    const newParentId = mapId(taskIdMap, r.parent_task_id ?? null)
    const newSectionId = mapId(sectionIdMap, r.section_id as string | null)
    statements.push({
      sql: `INSERT INTO production_tasks (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, parent_task_id, section_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      bindValues: [
        id,
        newProdId,
        r.description,
        r.is_complete ?? 0,
        r.notes ?? null,
        r.due_date ?? null,
        r.assigned_department ?? null,
        r.priority ?? null,
        newParentId,
        newSectionId,
        ts,
        ts,
      ],
    })
  }
  for (const r of deliverables) {
    const id = newId()
    deliverableIdMap.set(r.id as string, id)
    const newEpisodeId = mapEpisodeIdForDuplicate(episodeIdMap, r.episode_id as string | null)
    statements.push({
      sql: `INSERT INTO deliverables (id, production_id, episode_id, name, due_date, status, recipient, delivery_method, delivered_by, delivered_at, approval_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      bindValues: [id, newProdId, newEpisodeId, r.name, r.due_date, r.status ?? 'pending', r.recipient ?? null, r.delivery_method ?? null, r.delivered_by ?? null, r.delivered_at ?? null, r.approval_status ?? null, ts, ts],
    })
  }
  for (const r of techSpecs) {
    const delId = deliverableIdMap.get(r.deliverable_id as string)
    if (delId) {
      statements.push({
        sql: `INSERT INTO technical_specs (id, deliverable_id, resolution, codec, audio, captions, aspect_ratio, platform, bitrate, subtitles, graphics, language, audio_mix, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        bindValues: [newId(), delId, r.resolution, r.codec, r.audio ?? null, r.captions ?? null, r.aspect_ratio ?? null, r.platform ?? null, r.bitrate ?? null, r.subtitles ?? null, r.graphics ?? null, r.language ?? null, r.audio_mix ?? null, r.notes, ts, ts],
      })
    }
  }
  for (const r of musicTracks) {
    const id = newId()
    musicTrackIdMap.set(r.id as string, id)
    const episodeId = mapEpisodeIdForDuplicate(episodeIdMap, r.episode_id as string | null)
    statements.push({
      sql: `INSERT INTO music_tracks (id, production_id, episode_id, title, artist, publisher_label, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [id, newProdId, episodeId, r.title, r.artist, r.publisher_label, r.notes ?? null, ts, ts],
    })
  }
  for (const r of clearances) {
    const itemId = musicTrackIdMap.get(r.item_id as string) ?? r.item_id
    statements.push({
      sql: `INSERT INTO clearances (id, production_id, type, item_id, status, requested_at, granted_at, expiry, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      bindValues: [newId(), newProdId, r.type, itemId, r.status, r.requested_at, r.granted_at, r.expiry ?? null, ts, ts],
    })
  }
  for (const r of equipmentTerms) {
    statements.push({
      sql: `INSERT INTO equipment_terms (id, production_id, type, value, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [newId(), newProdId, r.type, r.value, ts, ts],
    })
  }

  // Script versions (SB1): first pass inserts with previous_script_version_id null; lineage updated after map is complete.
  const scriptVersionLineage: Array<{ newId: string; previousOldId: string | null }> = []
  for (const r of scriptVersions) {
    const id = newId()
    scriptVersionIdMap.set(r.id as string, id)
    const episodeId = mapEpisodeIdForDuplicate(episodeIdMap, (r.episode_id as string | null) ?? null)
    scriptVersionLineage.push({
      newId: id,
      previousOldId: (r.previous_script_version_id as string | null) ?? null,
    })
    statements.push({
      sql: `INSERT INTO script_versions (id, production_id, episode_id, title, version_label, revision_colour, is_locked, locked_pages_json, previous_script_version_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      bindValues: [
        id,
        newProdId,
        episodeId,
        r.title ?? null,
        r.version_label ?? null,
        r.revision_colour ?? null,
        coerceBoolean(r.is_locked, false) ? 1 : 0,
        r.locked_pages_json ?? null,
        null,
        ts,
        ts,
      ],
    })
  }
  for (const { newId: versionId, previousOldId } of scriptVersionLineage) {
    if (previousOldId) {
      const mappedPrev = scriptVersionIdMap.get(previousOldId)
      if (mappedPrev) {
        statements.push({
          sql: `UPDATE script_versions SET previous_script_version_id = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [mappedPrev, ts, versionId],
        })
      }
    }
  }
  for (const r of scriptPages) {
    const versionId = scriptVersionIdMap.get(r.script_version_id as string)
    if (!versionId) continue
    const id = newId()
    scriptPageIdMap.set(r.id as string, id)
    const sceneId = mapId(sceneIdMap, (r.scene_id as string | null) ?? null)
    statements.push({
      sql: `INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, eighths, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [
        id,
        versionId,
        sceneId,
        r.page_number ?? null,
        r.page_index ?? 0,
        r.content ?? null,
        r.eighths ?? null,
        ts,
        ts,
      ],
    })
  }
  for (const r of scriptSections) {
    const versionId = scriptVersionIdMap.get(r.script_version_id as string)
    const sceneId = sceneIdMap.get(r.scene_id as string)
    if (!versionId || !sceneId) continue
    const id = newId()
    scriptSectionIdMap.set(r.id as string, id)
    const episodeId = mapEpisodeIdForDuplicate(episodeIdMap, (r.episode_id as string | null) ?? null)
    statements.push({
      sql: `INSERT INTO script_sections (id, production_id, script_version_id, scene_id, episode_id, label, section_type, status, notes, is_manual, ranges_user_edited, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      bindValues: [
        id,
        newProdId,
        versionId,
        sceneId,
        episodeId,
        r.label ?? null,
        r.section_type,
        r.status ?? 'unplanned',
        r.notes ?? null,
        coerceBoolean(r.is_manual, false) ? 1 : 0,
        coerceBoolean(r.ranges_user_edited, false) ? 1 : 0,
        ts,
        ts,
      ],
    })
  }
  for (const r of scriptSectionRanges) {
    const sectionId = scriptSectionIdMap.get(r.section_id as string)
    if (!sectionId) continue
    const id = newId()
    scriptSectionRangeIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO script_section_ranges (id, section_id, start_page, start_eighth, end_page, end_eighth, start_offset, end_offset, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      bindValues: [
        id,
        sectionId,
        r.start_page ?? null,
        r.start_eighth ?? null,
        r.end_page ?? null,
        r.end_eighth ?? null,
        r.start_offset ?? null,
        r.end_offset ?? null,
        ts,
        ts,
      ],
    })
  }
  for (const r of scriptSectionCharacters) {
    const sectionId = scriptSectionIdMap.get(r.section_id as string)
    if (!sectionId) continue
    const id = newId()
    scriptSectionCharacterIdMap.set(r.id as string, id)
    const personId = mapId(personIdMap, (r.person_id as string | null) ?? null)
    statements.push({
      sql: `INSERT INTO script_section_characters (id, section_id, person_id, character_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [id, sectionId, personId, r.character_name ?? null, ts, ts],
    })
  }
  for (const r of shotScriptSections) {
    const shotId = shotIdMap.get(r.shot_id as string)
    const sectionId = scriptSectionIdMap.get(r.script_section_id as string)
    if (!shotId || !sectionId) continue
    const id = newId()
    shotScriptSectionIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO shot_script_sections (id, shot_id, script_section_id, coverage_notes, sort_index, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      bindValues: [
        id,
        shotId,
        sectionId,
        r.coverage_notes ?? null,
        r.sort_index ?? 0,
        ts,
        ts,
      ],
    })
  }
  for (const r of docs) {
    const id = newId()
    documentIdMap.set(r.id as string, id)
    const fileName = (r.file_name as string) || 'file'
    const newRelPath = `${ATTACHMENTS}/${newProdId}/${id}-${fileName}`
    docNewPaths.push({ oldPath: r.file_path as string, newPath: newRelPath, docId: id })
    const entityId = mapEntityId(r.entity_type as string | null, r.entity_id as string | null, { locationIdMap, personIdMap, shootDayIdMap, deliverableIdMap })
    statements.push({
      sql: `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [id, newProdId, r.entity_type, entityId, r.file_name, newRelPath, r.mime_type, ts, ts],
    })
  }
  for (const r of shootDaySidesExports) {
    const shootDayId = shootDayIdMap.get(r.shoot_day_id as string)
    if (!shootDayId) continue
    const id = newId()
    sidesExportIdMap.set(r.id as string, id)
    const unitId = mapId(unitIdMap, (r.unit_id as string | null) ?? null)
    const documentId = mapId(documentIdMap, (r.document_id as string | null) ?? null)
    const scriptVersionId = mapId(scriptVersionIdMap, (r.script_version_id as string | null) ?? null)
    statements.push({
      sql: `INSERT INTO shoot_day_sides_exports (id, production_id, shoot_day_id, unit_id, document_id, script_version_id, export_label, metadata_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      bindValues: [
        id,
        newProdId,
        shootDayId,
        unitId,
        documentId,
        scriptVersionId,
        r.export_label ?? null,
        r.metadata_json ?? null,
        ts,
        ts,
      ],
    })
  }

  // Hazard templates and risk assessments (RAMS). Links to a location / person / PDF that did not
  // make it into the copy become NULL; a RAMS whose shoot day was not copied is skipped.
  for (const r of hazardTemplateRows) {
    statements.push({
      sql: `INSERT INTO hazard_templates (id, production_id, name, description, risks, outcomes, control_measures, at_risk_crew, at_risk_cast, at_risk_public, severity_before, probability_before, severity_after, probability_after, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      bindValues: [
        newId(), newProdId, r.name, r.description, r.risks, r.outcomes, r.control_measures,
        r.at_risk_crew, r.at_risk_cast, r.at_risk_public,
        r.severity_before, r.probability_before, r.severity_after, r.probability_after, ts, ts,
      ],
    })
  }
  const riskAssessmentIdMap: IdMap = new Map()
  for (const r of riskAssessmentRows) {
    const shootDayId = shootDayIdMap.get(r.shoot_day_id as string)
    if (!shootDayId) continue
    const id = newId()
    riskAssessmentIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO risk_assessments (id, production_id, shoot_day_id, location_id, location_name, activities, responsible_person_id, responsible_person_name, first_aiders_json, hospital_name, hospital_address, hospital_phone, police_name, police_address, police_phone, status, approved_by, approved_at, generated_document_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      bindValues: [
        id, newProdId, shootDayId,
        locationIdMap.get((r.location_id as string | null) ?? '') ?? null,
        r.location_name, r.activities,
        personIdMap.get((r.responsible_person_id as string | null) ?? '') ?? null,
        r.responsible_person_name, r.first_aiders_json ?? null,
        r.hospital_name ?? null, r.hospital_address ?? null, r.hospital_phone ?? null,
        r.police_name ?? null, r.police_address ?? null, r.police_phone ?? null,
        r.status, r.approved_by ?? null, r.approved_at ?? null,
        documentIdMap.get((r.generated_document_id as string | null) ?? '') ?? null,
        ts, ts,
      ],
    })
  }
  for (const r of riskAssessmentUnitRows) {
    const raId = riskAssessmentIdMap.get(r.risk_assessment_id as string)
    const sduId = shootDayUnitIdMap.get(r.shoot_day_unit_id as string)
    if (!raId || !sduId) continue
    statements.push({
      sql: `INSERT INTO risk_assessment_units (id, risk_assessment_id, shoot_day_unit_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      bindValues: [newId(), raId, sduId, ts, ts],
    })
  }
  for (const r of riskAssessmentHazardRows) {
    const raId = riskAssessmentIdMap.get(r.risk_assessment_id as string)
    if (!raId) continue
    statements.push({
      sql: `INSERT INTO risk_assessment_hazards (id, risk_assessment_id, sort_order, name, description, risks, outcomes, control_measures, at_risk_crew, at_risk_cast, at_risk_public, severity_before, probability_before, severity_after, probability_after, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      bindValues: [
        newId(), raId, r.sort_order, r.name, r.description, r.risks, r.outcomes, r.control_measures,
        r.at_risk_crew, r.at_risk_cast, r.at_risk_public,
        r.severity_before, r.probability_before, r.severity_after, r.probability_after, ts, ts,
      ],
    })
  }

  // Script breakdown: elements keep their status and notes; links follow the copied location / cast / music
  // track (equipment is not copied, so equipment links are dropped). Tags follow the copied script pages;
  // carried-from history stays with the original.
  const breakdownElementIdMap: IdMap = new Map()
  for (const r of breakdownElements) {
    const id = newId()
    breakdownElementIdMap.set(r.id as string, id)
    const linkedType = (r.linked_entity_type as string | null) ?? null
    const linkedOld = (r.linked_entity_id as string | null) ?? null
    const linkMap =
      linkedType === 'location' ? locationIdMap : linkedType === 'person' ? personIdMap : linkedType === 'music_track' ? musicTrackIdMap : null
    const linkedId = linkMap ? mapId(linkMap, linkedOld) : null
    statements.push({
      sql: `INSERT INTO breakdown_elements (id, production_id, category, name, notes, manual_status, linked_entity_type, linked_entity_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      bindValues: [id, newProdId, r.category, r.name, r.notes ?? null, r.manual_status ?? 'needed', linkedId ? linkedType : null, linkedId, ts, ts],
    })
  }
  for (const r of breakdownTags) {
    const elementId = breakdownElementIdMap.get(r.element_id as string)
    const versionId = scriptVersionIdMap.get(r.script_version_id as string)
    const sceneId = sceneIdMap.get(r.scene_id as string)
    const startPageId = scriptPageIdMap.get(r.start_page_id as string)
    const endPageId = scriptPageIdMap.get(r.end_page_id as string)
    if (!elementId || !versionId || !sceneId || !startPageId || !endPageId) continue
    statements.push({
      sql: `INSERT INTO breakdown_tags (id, production_id, element_id, script_version_id, scene_id, start_page_id, start_offset, end_page_id, end_offset, tagged_text, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      bindValues: [newId(), newProdId, elementId, versionId, sceneId, startPageId, r.start_offset, endPageId, r.end_offset, r.tagged_text, ts, ts],
    })
  }

  // Floor plans follow their copied location; setups follow the copied plan, scene and shot.
  const [floorPlans, floorPlanSetups] = await Promise.all([
    db.select<Record<string, unknown>[]>(`SELECT * FROM floor_plans WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
    db.select<Record<string, unknown>[]>(`SELECT * FROM floor_plan_setups WHERE production_id = $1 AND deleted_at IS NULL`, [sourceProductionId]),
  ])
  const floorPlanIdMap: IdMap = new Map()
  for (const r of floorPlans) {
    const locationId = locationIdMap.get(r.location_id as string)
    if (!locationId) continue
    const id = newId()
    floorPlanIdMap.set(r.id as string, id)
    statements.push({
      sql: `INSERT INTO floor_plans (id, production_id, location_id, name, layout_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      bindValues: [id, newProdId, locationId, r.name, r.layout_json, ts, ts],
    })
  }
  for (const r of floorPlanSetups) {
    const planId = floorPlanIdMap.get(r.floor_plan_id as string)
    const sceneId = sceneIdMap.get(r.scene_id as string)
    const oldShotId = (r.shot_id as string | null) ?? null
    const shotId = oldShotId ? shotIdMap.get(oldShotId) : null
    if (!planId || !sceneId || shotId === undefined) continue
    statements.push({
      sql: `INSERT INTO floor_plan_setups (id, production_id, floor_plan_id, scene_id, shot_id, markers_json, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [newId(), newProdId, planId, sceneId, shotId, r.markers_json, r.notes ?? null, ts, ts],
    })
  }

  // Crew hierarchy is production-specific setup; Crew Manager, task mapping, and call-sheet
  // ordering depend on it. Duplicate any stored config so the new production keeps the same
  // operational structure. If source has no config row, none is created—resolver falls back to default.
  for (const r of crewHierarchyConfigs) {
    statements.push({
      sql: `INSERT INTO production_crew_hierarchy_configs (id, production_id, config_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      bindValues: [newId(), newProdId, r.config_json, ts, ts],
    })
  }

  statements.push({ sql: 'COMMIT', bindValues: [] })
  await executeBatch(db, statements)

  await mkdir(`${ATTACHMENTS}/${newProdId}`, { baseDir: BaseDirectory.AppData, recursive: true })
  for (const { oldPath, newPath } of docNewPaths) {
    try {
      const content = await readFile(oldPath, { baseDir: BaseDirectory.AppData })
      await writeFile(newPath, content, { baseDir: BaseDirectory.AppData })
    } catch {
      // File may not exist (e.g. demo); leave doc row with new path
    }
  }

  if (budgetAccounts.length === 0) await seedDefaultBudgetAccounts(newProdId)

  return { id: newProdId, name: newName, slug }
}

/** Rows ordered so every row follows the row its `parentKey` points at (rows whose parent is absent come first). */
function orderParentsFirst(rows: Record<string, unknown>[], parentKey: string): Record<string, unknown>[] {
  const ids = new Set(rows.map((r) => r.id as string))
  const placed = new Set<string>()
  const ordered: Record<string, unknown>[] = []
  let remaining = rows
  while (remaining.length > 0) {
    const next: Record<string, unknown>[] = []
    for (const r of remaining) {
      const parent = (r[parentKey] as string | null) ?? null
      if (parent == null || !ids.has(parent) || placed.has(parent)) {
        ordered.push(r)
        placed.add(r.id as string)
      } else {
        next.push(r)
      }
    }
    if (next.length === remaining.length) {
      ordered.push(...next) // cycle: keep input order; mapId leaves the unplaced parent unmapped
      break
    }
    remaining = next
  }
  return ordered
}

/**
 * `shoot_day_units.movement_order_json` keys per-leg times by `fromLocationId>toLocationId[#n]`; point the keys at
 * the copied locations. Malformed JSON is copied untouched.
 */
function remapMovementOrderJson(json: string | null, locationIdMap: IdMap): string | null {
  if (!json) return json
  try {
    const parsed = JSON.parse(json) as { legs?: Record<string, unknown> }
    if (!parsed || typeof parsed !== 'object' || !parsed.legs || typeof parsed.legs !== 'object') return json
    const legs: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed.legs)) {
      const m = /^([^>]+)>([^>#]+)(#\d+)?$/.exec(key)
      legs[m ? `${locationIdMap.get(m[1]!) ?? m[1]}>${locationIdMap.get(m[2]!) ?? m[2]}${m[3] ?? ''}` : key] = value
    }
    return JSON.stringify({ ...parsed, legs })
  } catch {
    return json
  }
}

function mapEntityId(
  entityType: string | null,
  entityId: string | null,
  maps: { locationIdMap: IdMap; personIdMap: IdMap; shootDayIdMap: IdMap; deliverableIdMap: IdMap }
): string | null {
  if (entityId == null) return null
  if (entityType === 'location_release' || entityType === 'permit' || entityType === 'location') return maps.locationIdMap.get(entityId) ?? entityId
  if (entityType === 'contributor_form' || entityType === 'person') return maps.personIdMap.get(entityId) ?? entityId
  if (entityType === 'call_sheet' || entityType === 'shoot_day' || entityType === 'sides_export' || entityType === 'risk_assessment') return maps.shootDayIdMap.get(entityId) ?? entityId
  if (entityType === 'deliverable') return maps.deliverableIdMap.get(entityId) ?? entityId
  return entityId
}
