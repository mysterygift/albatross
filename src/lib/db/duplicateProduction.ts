/**
 * Duplicate a production and all its related rows + attachment files.
 * Uses a single DB transaction for writes. Does not push to outbox (duplication is local-only).
 */
import { BaseDirectory, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { getDb, now, uuid } from './client'
import { reserveSlugAndInsertProduction, slugify } from './repositories/production'

const ATTACHMENTS = 'attachments'

type IdMap = Map<string, string>

function newId(): string {
  return uuid()
}

function mapId(map: IdMap, oldId: string | null): string | null {
  if (oldId == null) return null
  return map.get(oldId) ?? oldId
}

export async function duplicateProduction(
  sourceProductionId: string,
  newName: string
): Promise<{ id: string; name: string; slug: string }> {
  const db = await getDb()
  const ts = now()

  const prodRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM productions WHERE id = $1 AND deleted_at IS NULL`,
    [sourceProductionId]
  )
  if (prodRows.length === 0) throw new Error('Production not found')

  const newProdId = newId()
  const currencyCode = (prodRows[0]!.currency_code as string) ?? 'GBP'
  const notes = (prodRows[0]!.notes as string | null) ?? null

  const unitIdMap: IdMap = new Map()
  const personIdMap: IdMap = new Map()
  const locationIdMap: IdMap = new Map()
  const sceneIdMap: IdMap = new Map()
  const shootDayIdMap: IdMap = new Map()
  const shootDayUnitIdMap: IdMap = new Map()
  const categoryIdMap: IdMap = new Map()
  const deliverableIdMap: IdMap = new Map()
  const musicTrackIdMap: IdMap = new Map()
  const documentIdMap: IdMap = new Map()
  const docNewPaths: { oldPath: string; newPath: string; docId: string }[] = []

  const slug = await reserveSlugAndInsertProduction(db, {
    id: newProdId,
    name: newName,
    baseSlug: slugify(newName),
    currencyCode,
    notes,
    ts,
  })

  try {
    const units = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM units WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of units) {
      const id = newId()
      unitIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        [id, newProdId, r.name, ts, ts]
      )
    }

    const people = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM people WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of people) {
      const id = newId()
      personIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO people (id, production_id, name, is_cast, email, phone, department, phases, notes, contributor_form_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id, newProdId, r.name, r.is_cast ?? 0, r.email, r.phone, r.department, r.phases, r.notes,
          r.contributor_form_status ?? 'not_requested', ts, ts,
        ]
      )
    }

    const locations = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM locations WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of locations) {
      const id = newId()
      locationIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO locations (id, production_id, name, booked_status, address, availability_constraints, permit_fee, location_fee, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id, newProdId, r.name, r.booked_status ?? 'unbooked', r.address, r.availability_constraints,
          r.permit_fee, r.location_fee, r.notes, ts, ts,
        ]
      )
    }

    const scenes = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM scenes WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of scenes) {
      const id = newId()
      sceneIdMap.set(r.id as string, id)
      const locId = mapId(locationIdMap, r.location_id as string | null)
      await db.execute(
        `INSERT INTO scenes (id, production_id, scene_number, heading, title, description, int_ext, day_night, page_eighths, location_id, duration_minutes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id, newProdId, r.scene_number, r.heading, r.title, r.description, r.int_ext, r.day_night,
          r.page_eighths, locId, r.duration_minutes ?? null, ts, ts,
        ]
      )
    }

    const shootDays = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM shoot_days WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of shootDays) {
      const id = newId()
      shootDayIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, notes, weather_manual, wrap_time, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, newProdId, r.shoot_date, r.day_number, r.call_time, r.notes, r.weather_manual, r.wrap_time ?? null, ts, ts]
      )
    }

    const sduRows = await db.select<Record<string, unknown>[]>(
      `SELECT sdu.* FROM shoot_day_units sdu
       INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id AND sd.production_id = $1 AND sd.deleted_at IS NULL
       WHERE sdu.deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of sduRows) {
      const id = newId()
      const dayId = shootDayIdMap.get(r.shoot_day_id as string)
      const unitId = unitIdMap.get(r.unit_id as string)
      if (dayId && unitId) {
        shootDayUnitIdMap.set(r.id as string, id)
        await db.execute(
          `INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, notes, is_locked, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, dayId, unitId, r.notes, r.is_locked ?? 0, ts, ts]
        )
      }
    }

    const locScenes = await db.select<Record<string, unknown>[]>(
      `SELECT ls.* FROM location_scene ls
       INNER JOIN locations loc ON loc.id = ls.location_id AND loc.production_id = $1 AND loc.deleted_at IS NULL
       WHERE ls.deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of locScenes) {
      const locId = locationIdMap.get(r.location_id as string)
      const sceneId = sceneIdMap.get(r.scene_id as string)
      if (locId && sceneId) {
        await db.execute(
          `INSERT INTO location_scene (id, location_id, scene_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [newId(), locId, sceneId, ts, ts]
        )
      }
    }

    const shotIdMap = new Map<string, string>()
    const shots = await db.select<Record<string, unknown>[]>(
      `SELECT s.* FROM shots s INNER JOIN scenes sc ON sc.id = s.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL WHERE s.deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of shots) {
      const sceneId = sceneIdMap.get(r.scene_id as string)
      if (sceneId) {
        const id = newId()
        shotIdMap.set(r.id as string, id)
        await db.execute(
          `INSERT INTO shots (id, scene_id, shot_number, description, shot_description, subject, action_description, shot_size, support, lens, duration_seconds, estimated_shoot_minutes, camera_movement, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            id, sceneId, r.shot_number, r.description, r.shot_description ?? null, r.subject, r.action_description, r.shot_size, r.support, r.lens,
            r.duration_seconds, r.estimated_shoot_minutes, r.camera_movement, r.notes, ts, ts,
          ]
        )
      }
    }

    const sceneCast = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM scene_cast WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of sceneCast) {
      const sceneId = sceneIdMap.get(r.scene_id as string)
      const personId = personIdMap.get(r.person_id as string)
      if (sceneId && personId) {
        await db.execute(
          `INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [newId(), newProdId, sceneId, personId, ts, ts]
        )
      }
    }

    const strips = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM stripboard_strips WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of strips) {
      const dayId = shootDayIdMap.get(r.shoot_day_id as string)
      if (!dayId) continue
      const sduId = mapId(shootDayUnitIdMap, r.shoot_day_unit_id as string | null)
      const sceneId = mapId(sceneIdMap, r.scene_id as string | null)
      const shotId = mapId(shotIdMap, r.shot_id as string | null)
      const stripStatus = (r.strip_status as string) ?? 'SCHEDULED'
      await db.execute(
        `INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [newId(), newProdId, dayId, sduId, r.strip_type ?? 'SHOT', sceneId, shotId, r.title, r.description, r.estimated_minutes ?? null, r.sort_index ?? 0, r.color_tag, stripStatus, ts, ts]
      )
    }

    const castAvail = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM cast_availability WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of castAvail) {
      const personId = personIdMap.get(r.person_id as string)
      if (personId) {
        await db.execute(
          `INSERT INTO cast_availability (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newId(), newProdId, personId, r.start_date, r.end_date, r.availability ?? 'AVAILABLE', r.notes, ts, ts]
        )
      }
    }

    const categories = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_categories WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of categories) {
      const id = newId()
      categoryIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO budget_categories (id, production_id, code, name, phase, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, newProdId, r.code, r.name, r.phase ?? 'pre', ts, ts]
      )
    }

    const budgetItems = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_items WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of budgetItems) {
      const catId = categoryIdMap.get(r.category_id as string)
      if (catId) {
        await db.execute(
          `INSERT INTO budget_items (id, production_id, category_id, description, estimated_cost, actual_cost, vendor, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [newId(), newProdId, catId, r.description, r.estimated_cost ?? 0, r.actual_cost ?? 0, r.vendor, r.status ?? 'draft', ts, ts]
        )
      }
    }

    const expRows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM expenses WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of expRows) {
      const catId = mapId(categoryIdMap, r.category_id as string | null)
      await db.execute(
        `INSERT INTO expenses (id, production_id, category_id, amount, date, vendor, notes, expense_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [newId(), newProdId, catId, r.amount, r.date, r.vendor, r.notes, r.expense_type ?? 'other', ts, ts]
      )
    }

    const keyContacts = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM key_contacts WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of keyContacts) {
      await db.execute(
        `INSERT INTO key_contacts (id, production_id, department, name, phone, email, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newId(), newProdId, r.department, r.name, r.phone, r.email, r.notes, ts, ts]
      )
    }

    const checklist = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM checklist_items WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of checklist) {
      await db.execute(
        `INSERT INTO checklist_items (id, production_id, title, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId(), newProdId, r.title, r.sort_order ?? 0, ts, ts]
      )
    }

    const deliverables = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM deliverables WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of deliverables) {
      const id = newId()
      deliverableIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO deliverables (id, production_id, name, due_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, newProdId, r.name, r.due_date, r.status ?? 'pending', ts, ts]
      )
    }

    const techSpecs = await db.select<Record<string, unknown>[]>(
      `SELECT ts.* FROM technical_specs ts INNER JOIN deliverables d ON d.id = ts.deliverable_id AND d.production_id = $1 AND d.deleted_at IS NULL WHERE ts.deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of techSpecs) {
      const delId = deliverableIdMap.get(r.deliverable_id as string)
      if (delId) {
        await db.execute(
          `INSERT INTO technical_specs (id, deliverable_id, resolution, codec, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newId(), delId, r.resolution, r.codec, r.notes, ts, ts]
        )
      }
    }

    const musicTracks = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM music_tracks WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of musicTracks) {
      const id = newId()
      musicTrackIdMap.set(r.id as string, id)
      await db.execute(
        `INSERT INTO music_tracks (id, production_id, title, artist, publisher_label, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, newProdId, r.title, r.artist, r.publisher_label, ts, ts]
      )
    }

    const clearances = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM clearances WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of clearances) {
      const itemId = musicTrackIdMap.get(r.item_id as string) ?? r.item_id
      await db.execute(
        `INSERT INTO clearances (id, production_id, type, item_id, status, requested_at, granted_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newId(), newProdId, r.type, itemId, r.status, r.requested_at, r.granted_at, ts, ts]
      )
    }

    const equipmentTerms = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM equipment_terms WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of equipmentTerms) {
      await db.execute(
        `INSERT INTO equipment_terms (id, production_id, type, value, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId(), newProdId, r.type, r.value, ts, ts]
      )
    }

    const docs = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM documents WHERE production_id = $1 AND deleted_at IS NULL`,
      [sourceProductionId]
    )
    for (const r of docs) {
      const id = newId()
      documentIdMap.set(r.id as string, id)
      const fileName = (r.file_name as string) || 'file'
      const newRelPath = `${ATTACHMENTS}/${newProdId}/${id}-${fileName}`
      docNewPaths.push({ oldPath: r.file_path as string, newPath: newRelPath, docId: id })
      const entityId = mapEntityId(r.entity_type as string | null, r.entity_id as string | null, {
        locationIdMap,
        personIdMap,
        shootDayIdMap,
      })
      await db.execute(
        `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, newProdId, r.entity_type, entityId, r.file_name, newRelPath, r.mime_type, ts, ts]
      )
    }

    await db.execute('COMMIT')
  } catch (e) {
    await db.execute('ROLLBACK')
    throw e
  }

  await mkdir(`${ATTACHMENTS}/${newProdId}`, { baseDir: BaseDirectory.AppData, recursive: true })
  for (const { oldPath, newPath } of docNewPaths) {
    try {
      const content = await readFile(oldPath, { baseDir: BaseDirectory.AppData })
      await writeFile(newPath, content, { baseDir: BaseDirectory.AppData })
    } catch {
      // File may not exist (e.g. demo); leave doc row with new path
    }
  }

  return { id: newProdId, name: newName, slug }
}

function mapEntityId(
  entityType: string | null,
  entityId: string | null,
  maps: { locationIdMap: IdMap; personIdMap: IdMap; shootDayIdMap: IdMap }
): string | null {
  if (entityId == null) return null
  if (entityType === 'location_release' || entityType === 'location') return maps.locationIdMap.get(entityId) ?? entityId
  if (entityType === 'contributor_form' || entityType === 'person') return maps.personIdMap.get(entityId) ?? entityId
  if (entityType === 'call_sheet' || entityType === 'shoot_day') return maps.shootDayIdMap.get(entityId) ?? entityId
  return entityId
}
