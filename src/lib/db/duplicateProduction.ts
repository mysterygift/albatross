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
import { executeBatch, getDb, now, uuid } from './client'
import { coerceBoolean } from './sqlValueCoercion'
import { seedDefaultBudgetAccounts } from './repositories/budgetAccounts'
import { ensureUniqueSlug, slugify, withSlugLock } from './repositories/production'

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

  // Load all source data first (reads only).
  const [units, people, locations, scenes, shootDays, sduRows, locScenes, shots, sceneCast, shotCast, strips, castAvail, crewAvail, categories, budgetItems, vendors, expRows, expenseTransactionDetails, keyContacts, taskSections, tasks, deliverables, techSpecs, musicTracks, clearances, equipmentTerms, docs, crewHierarchyConfigs, episodes, shootingBlocs, scriptVersions, scriptPages, scriptSections, scriptSectionRanges, scriptSectionCharacters, shotScriptSections, shootDaySidesExports] = await Promise.all([
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
      sql: `INSERT INTO ${TABLE_PRODUCTIONS} (id, name, slug, currency_code, notes, client_id, delivery_date, is_episodic, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      bindValues: [newProdId, newName, slug, currencyCode, notes, clientId, deliveryDate, isEpisodic ? 1 : 0, ts, ts],
    },
  ]

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
      sql: `INSERT INTO locations (id, production_id, name, name_sort_key, booked_status, address, what3words, parking_info, availability_constraints, permit_fee, location_fee, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        r.permit_fee,
        r.location_fee,
        r.notes,
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
      sql: `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, notes, weather_manual, wrap_time, shooting_bloc_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      bindValues: [
        id,
        newProdId,
        r.shoot_date,
        r.day_number,
        r.call_time,
        r.notes,
        r.weather_manual,
        r.wrap_time ?? null,
        shootingBlocId,
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
        sql: `INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, notes, is_locked, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        bindValues: [id, dayId, unitId, r.notes, coerceBoolean(r.is_locked, false), ts, ts],
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
    statements.push({
      sql: `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      bindValues: [newId(), newProdId, dayId, sduId, r.strip_type ?? 'SHOT', sceneId, shotId, r.title, r.description, r.estimated_minutes ?? null, r.sort_index ?? 0, r.color_tag, stripStatus, ts, ts],
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
  for (const r of budgetItems) {
    const catId = r.category_id != null ? categoryIdMap.get(r.category_id as string) ?? null : null
    statements.push({
      sql: `INSERT INTO budget_items (id, production_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, line_item_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      bindValues: [newId(), newProdId, catId, null, r.description, r.estimated_cost ?? 0, r.actual_cost ?? 0, r.vendor, r.status ?? 'draft', null, ts, ts],
    })
  }
  for (const r of expRows) {
    const expId = newId()
    expenseIdMap.set(r.id as string, expId)
    const catId = mapId(categoryIdMap, r.category_id as string | null)
    const vendorId = mapId(vendorIdMap, r.vendor_id as string | null)
    statements.push({
      sql: `INSERT INTO expenses (id, production_id, category_id, account_id, transaction_type, vendor_id, amount, date, vendor, notes, expense_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      bindValues: [
        expId,
        newProdId,
        catId,
        null,
        r.transaction_type ?? null,
        vendorId,
        r.amount,
        r.date,
        r.vendor,
        r.notes,
        r.expense_type ?? 'other',
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
      sql: `INSERT INTO deliverables (id, production_id, episode_id, name, due_date, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      bindValues: [id, newProdId, newEpisodeId, r.name, r.due_date, r.status ?? 'pending', ts, ts],
    })
  }
  for (const r of techSpecs) {
    const delId = deliverableIdMap.get(r.deliverable_id as string)
    if (delId) {
      statements.push({
        sql: `INSERT INTO technical_specs (id, deliverable_id, resolution, codec, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        bindValues: [newId(), delId, r.resolution, r.codec, r.notes, ts, ts],
      })
    }
  }
  for (const r of musicTracks) {
    const id = newId()
    musicTrackIdMap.set(r.id as string, id)
    const episodeId = mapEpisodeIdForDuplicate(episodeIdMap, r.episode_id as string | null)
    statements.push({
      sql: `INSERT INTO music_tracks (id, production_id, episode_id, title, artist, publisher_label, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      bindValues: [id, newProdId, episodeId, r.title, r.artist, r.publisher_label, ts, ts],
    })
  }
  for (const r of clearances) {
    const itemId = musicTrackIdMap.get(r.item_id as string) ?? r.item_id
    statements.push({
      sql: `INSERT INTO clearances (id, production_id, type, item_id, status, requested_at, granted_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [newId(), newProdId, r.type, itemId, r.status, r.requested_at, r.granted_at, ts, ts],
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

  await seedDefaultBudgetAccounts(newProdId)

  return { id: newProdId, name: newName, slug }
}

function mapEntityId(
  entityType: string | null,
  entityId: string | null,
  maps: { locationIdMap: IdMap; personIdMap: IdMap; shootDayIdMap: IdMap; deliverableIdMap: IdMap }
): string | null {
  if (entityId == null) return null
  if (entityType === 'location_release' || entityType === 'location') return maps.locationIdMap.get(entityId) ?? entityId
  if (entityType === 'contributor_form' || entityType === 'person') return maps.personIdMap.get(entityId) ?? entityId
  if (entityType === 'call_sheet' || entityType === 'shoot_day' || entityType === 'sides_export') return maps.shootDayIdMap.get(entityId) ?? entityId
  if (entityType === 'deliverable') return maps.deliverableIdMap.get(entityId) ?? entityId
  return entityId
}
