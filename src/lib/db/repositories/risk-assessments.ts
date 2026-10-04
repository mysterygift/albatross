import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow, outboxStatementForRows, type OutboxRow } from '../outbox'
import type {
  FirstAider,
  RiskAssessment,
  RiskAssessmentHazard,
  RiskAssessmentStatus,
} from '../types'
import { hardDeleteDocument } from '@/lib/documents/hardDeleteDocument'
import {
  normalizeHazard,
  parseFirstAiders,
  riskAssessmentContentSignature,
  serializeFirstAiders,
  type HazardInput,
  type RiskAssessmentContent,
} from '@/lib/risk-assessments/content'

const TABLE = 'risk_assessments'
const UNITS_TABLE = 'risk_assessment_units'
const HAZARDS_TABLE = 'risk_assessment_hazards'

type Stmt = { sql: string; bindValues: unknown[] }
type Row = Record<string, unknown>

/** A RAMS with parsed first aiders, covered units and hazards (editor / PDF shape). */
export type RiskAssessmentFull = RiskAssessment & {
  first_aiders: FirstAider[]
  shoot_day_unit_ids: string[]
  hazards: RiskAssessmentHazard[]
}

/** List row: header plus the aggregates the list page and call sheet gate need. */
export type RiskAssessmentSummary = RiskAssessment & {
  shoot_date: string
  day_number: number | null
  /** Covered units; `unit_id` lets the UI colour chips by Main / Second. */
  units: { shoot_day_unit_id: string; unit_id: string }[]
  shoot_day_unit_ids: string[]
  hazard_count: number
  /** Highest residual (after-controls) factor across hazards; null with no hazards. */
  max_residual_factor: number | null
}

export type RiskAssessmentInput = {
  /** Omit to create. */
  id?: string
  production_id: string
  shoot_day_id: string
  shoot_day_unit_ids: string[]
  location_id?: string | null
  location_name?: string
  activities?: string
  responsible_person_id?: string | null
  responsible_person_name?: string
  first_aiders?: FirstAider[]
  hospital_name?: string | null
  hospital_address?: string | null
  hospital_phone?: string | null
  police_name?: string | null
  police_address?: string | null
  police_phone?: string | null
  hazards: HazardInput[]
}

function rowToRiskAssessment(r: Row): RiskAssessment {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: r.shoot_day_id as string,
    location_id: (r.location_id as string | null) ?? null,
    location_name: (r.location_name as string | null) ?? '',
    activities: (r.activities as string | null) ?? '',
    responsible_person_id: (r.responsible_person_id as string | null) ?? null,
    responsible_person_name: (r.responsible_person_name as string | null) ?? '',
    first_aiders_json: (r.first_aiders_json as string | null) ?? null,
    hospital_name: (r.hospital_name as string | null) ?? null,
    hospital_address: (r.hospital_address as string | null) ?? null,
    hospital_phone: (r.hospital_phone as string | null) ?? null,
    police_name: (r.police_name as string | null) ?? null,
    police_address: (r.police_address as string | null) ?? null,
    police_phone: (r.police_phone as string | null) ?? null,
    status: (r.status as RiskAssessmentStatus) === 'approved' ? 'approved' : 'draft',
    approved_by: (r.approved_by as string | null) ?? null,
    approved_at: (r.approved_at as string | null) ?? null,
    generated_document_id: (r.generated_document_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToHazard(r: Row): RiskAssessmentHazard {
  return {
    id: r.id as string,
    risk_assessment_id: r.risk_assessment_id as string,
    sort_order: Number(r.sort_order ?? 0),
    name: (r.name as string | null) ?? '',
    description: (r.description as string | null) ?? '',
    risks: (r.risks as string | null) ?? '',
    outcomes: (r.outcomes as string | null) ?? '',
    control_measures: (r.control_measures as string | null) ?? '',
    at_risk_crew: Number(r.at_risk_crew ?? 0) ? 1 : 0,
    at_risk_cast: Number(r.at_risk_cast ?? 0) ? 1 : 0,
    at_risk_public: Number(r.at_risk_public ?? 0) ? 1 : 0,
    severity_before: Number(r.severity_before),
    probability_before: Number(r.probability_before),
    severity_after: Number(r.severity_after),
    probability_after: Number(r.probability_after),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function toSummary(
  r: Row,
  unitsByRa: Map<string, { shoot_day_unit_id: string; unit_id: string }[]>
): RiskAssessmentSummary {
  const header = rowToRiskAssessment(r)
  const units = unitsByRa.get(header.id) ?? []
  return {
    ...header,
    shoot_date: r.shoot_date as string,
    day_number: r.day_number == null ? null : Number(r.day_number),
    units,
    shoot_day_unit_ids: units.map((u) => u.shoot_day_unit_id),
    hazard_count: Number(r.hazard_count ?? 0),
    max_residual_factor: r.max_residual_factor == null ? null : Number(r.max_residual_factor),
  }
}

const SUMMARY_SELECT = `
  SELECT ra.*, sd.shoot_date AS shoot_date, sd.day_number AS day_number,
    (SELECT COUNT(*) FROM ${HAZARDS_TABLE} h WHERE h.risk_assessment_id = ra.id AND h.deleted_at IS NULL) AS hazard_count,
    (SELECT MAX(h.severity_after * h.probability_after) FROM ${HAZARDS_TABLE} h
       WHERE h.risk_assessment_id = ra.id AND h.deleted_at IS NULL) AS max_residual_factor
  FROM ${TABLE} ra
  INNER JOIN shoot_days sd ON sd.id = ra.shoot_day_id AND sd.deleted_at IS NULL`

async function loadUnits(
  where: string,
  bind: unknown[]
): Promise<Map<string, { shoot_day_unit_id: string; unit_id: string }[]>> {
  const db = await getDb()
  const rows = await db.select<Row[]>(
    `SELECT rau.risk_assessment_id AS risk_assessment_id, rau.shoot_day_unit_id AS shoot_day_unit_id, sdu.unit_id AS unit_id
     FROM ${UNITS_TABLE} rau
     INNER JOIN ${TABLE} ra ON ra.id = rau.risk_assessment_id
     INNER JOIN shoot_day_units sdu ON sdu.id = rau.shoot_day_unit_id AND sdu.deleted_at IS NULL
     WHERE rau.deleted_at IS NULL AND ${where}
     ORDER BY sdu.unit_id`,
    bind
  )
  const map = new Map<string, { shoot_day_unit_id: string; unit_id: string }[]>()
  for (const r of rows) {
    const key = r.risk_assessment_id as string
    const list = map.get(key) ?? []
    list.push({ shoot_day_unit_id: r.shoot_day_unit_id as string, unit_id: r.unit_id as string })
    map.set(key, list)
  }
  return map
}

/** All RAMS in a production, oldest shoot day first. */
export async function listRiskAssessmentsByProduction(
  productionId: string
): Promise<RiskAssessmentSummary[]> {
  const db = await getDb()
  const [rows, units] = await Promise.all([
    db.select<Row[]>(
      `${SUMMARY_SELECT} WHERE ra.production_id = $1 AND ra.deleted_at IS NULL
       ORDER BY sd.shoot_date ASC, ra.created_at ASC`,
      [productionId]
    ),
    loadUnits('ra.production_id = $1 AND ra.deleted_at IS NULL', [productionId]),
  ])
  return rows.map((r) => toSummary(r, units))
}

/** Every RAMS on one shoot day (call sheet gate). */
export async function listRiskAssessmentsByShootDay(
  shootDayId: string
): Promise<RiskAssessmentSummary[]> {
  const db = await getDb()
  const [rows, units] = await Promise.all([
    db.select<Row[]>(
      `${SUMMARY_SELECT} WHERE ra.shoot_day_id = $1 AND ra.deleted_at IS NULL ORDER BY ra.created_at ASC`,
      [shootDayId]
    ),
    loadUnits('ra.shoot_day_id = $1 AND ra.deleted_at IS NULL', [shootDayId]),
  ])
  return rows.map((r) => toSummary(r, units))
}

async function selectHeader(id: string): Promise<RiskAssessment | null> {
  const db = await getDb()
  const rows = await db.select<Row[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
  return rows.length ? rowToRiskAssessment(rows[0]!) : null
}

async function selectHazards(riskAssessmentId: string): Promise<RiskAssessmentHazard[]> {
  const db = await getDb()
  const rows = await db.select<Row[]>(
    `SELECT * FROM ${HAZARDS_TABLE} WHERE risk_assessment_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
    [riskAssessmentId]
  )
  return rows.map(rowToHazard)
}

export async function getRiskAssessment(id: string): Promise<RiskAssessmentFull | null> {
  const header = await selectHeader(id)
  if (!header) return null
  const [hazards, units] = await Promise.all([
    selectHazards(id),
    loadUnits('rau.risk_assessment_id = $1', [id]),
  ])
  return {
    ...header,
    first_aiders: parseFirstAiders(header.first_aiders_json),
    shoot_day_unit_ids: (units.get(id) ?? []).map((u) => u.shoot_day_unit_id),
    hazards,
  }
}

function contentOf(ra: RiskAssessmentFull): RiskAssessmentContent {
  return {
    shoot_day_id: ra.shoot_day_id,
    shoot_day_unit_ids: ra.shoot_day_unit_ids,
    location_id: ra.location_id,
    location_name: ra.location_name,
    activities: ra.activities,
    responsible_person_id: ra.responsible_person_id,
    responsible_person_name: ra.responsible_person_name,
    first_aiders: ra.first_aiders,
    hospital_name: ra.hospital_name ?? '',
    hospital_address: ra.hospital_address ?? '',
    hospital_phone: ra.hospital_phone ?? '',
    police_name: ra.police_name ?? '',
    police_address: ra.police_address ?? '',
    police_phone: ra.police_phone ?? '',
    hazards: ra.hazards,
  }
}

function contentOfInput(input: RiskAssessmentInput): RiskAssessmentContent {
  return {
    shoot_day_id: input.shoot_day_id,
    shoot_day_unit_ids: input.shoot_day_unit_ids,
    location_id: input.location_id ?? null,
    location_name: input.location_name ?? '',
    activities: input.activities ?? '',
    responsible_person_id: input.responsible_person_id ?? null,
    responsible_person_name: input.responsible_person_name ?? '',
    first_aiders: input.first_aiders ?? [],
    hospital_name: input.hospital_name ?? '',
    hospital_address: input.hospital_address ?? '',
    hospital_phone: input.hospital_phone ?? '',
    police_name: input.police_name ?? '',
    police_address: input.police_address ?? '',
    police_phone: input.police_phone ?? '',
    hazards: input.hazards,
  }
}

function blankToNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t ? t : null
}

function hazardInsert(riskAssessmentId: string, h: HazardInput, sortOrder: number, ts: string): { stmt: Stmt; id: string; payload: Record<string, unknown> } {
  const id = h.id ?? uuid()
  const n = normalizeHazard(h)
  return {
    id,
    payload: { id, risk_assessment_id: riskAssessmentId, sort_order: sortOrder, ...n },
    stmt: {
      sql: `INSERT INTO ${HAZARDS_TABLE}
        (id, risk_assessment_id, sort_order, name, description, risks, outcomes, control_measures,
         at_risk_crew, at_risk_cast, at_risk_public,
         severity_before, probability_before, severity_after, probability_after, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      bindValues: [
        id,
        riskAssessmentId,
        sortOrder,
        n.name,
        n.description,
        n.risks,
        n.outcomes,
        n.control_measures,
        n.at_risk_crew,
        n.at_risk_cast,
        n.at_risk_public,
        n.severity_before,
        n.probability_before,
        n.severity_after,
        n.probability_after,
        ts,
        ts,
      ],
    },
  }
}

/** Header insert statement for a brand new RAMS. */
function headerInsert(
  id: string,
  c: RiskAssessmentContent & { production_id: string },
  ts: string
): { stmt: Stmt; payload: Record<string, unknown> } {
  const firstAidersJson = serializeFirstAiders(c.first_aiders)
  const payload = {
    id,
    production_id: c.production_id,
    shoot_day_id: c.shoot_day_id,
    location_id: c.location_id,
    location_name: c.location_name.trim(),
    activities: c.activities.trim(),
    responsible_person_id: c.responsible_person_id,
    responsible_person_name: c.responsible_person_name.trim(),
    first_aiders_json: firstAidersJson,
    hospital_name: blankToNull(c.hospital_name),
    hospital_address: blankToNull(c.hospital_address),
    hospital_phone: blankToNull(c.hospital_phone),
    police_name: blankToNull(c.police_name),
    police_address: blankToNull(c.police_address),
    police_phone: blankToNull(c.police_phone),
    status: 'draft',
  }
  return {
    payload,
    stmt: {
      sql: `INSERT INTO ${TABLE}
        (id, production_id, shoot_day_id, location_id, location_name, activities,
         responsible_person_id, responsible_person_name, first_aiders_json,
         hospital_name, hospital_address, hospital_phone, police_name, police_address, police_phone,
         status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft', $16, $17)`,
      bindValues: [
        id,
        payload.production_id,
        payload.shoot_day_id,
        payload.location_id,
        payload.location_name,
        payload.activities,
        payload.responsible_person_id,
        payload.responsible_person_name,
        payload.first_aiders_json,
        payload.hospital_name,
        payload.hospital_address,
        payload.hospital_phone,
        payload.police_name,
        payload.police_address,
        payload.police_phone,
        ts,
        ts,
      ],
    },
  }
}

function unitInserts(riskAssessmentId: string, shootDayUnitIds: string[], ts: string): { stmts: Stmt[]; outbox: OutboxRow[] } {
  const stmts: Stmt[] = []
  const outbox: OutboxRow[] = []
  for (const sduId of new Set(shootDayUnitIds)) {
    const id = uuid()
    stmts.push({
      sql: `INSERT INTO ${UNITS_TABLE} (id, risk_assessment_id, shoot_day_unit_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      bindValues: [id, riskAssessmentId, sduId, ts, ts],
    })
    outbox.push({
      entity: UNITS_TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({ id, risk_assessment_id: riskAssessmentId, shoot_day_unit_id: sduId }),
    })
  }
  return { stmts, outbox }
}

async function assertUnitsBelongToDay(shootDayId: string, shootDayUnitIds: string[]): Promise<void> {
  if (shootDayUnitIds.length === 0) return
  const db = await getDb()
  const rows = await db.select<Row[]>(
    `SELECT id FROM shoot_day_units WHERE shoot_day_id = $1 AND deleted_at IS NULL`,
    [shootDayId]
  )
  const valid = new Set(rows.map((r) => r.id as string))
  for (const id of shootDayUnitIds) {
    if (!valid.has(id)) throw new Error('Risk assessment unit does not belong to the selected shoot day')
  }
}

async function selectChildIds(riskAssessmentId: string): Promise<{ units: string[]; hazards: string[] }> {
  const db = await getDb()
  const [units, hazards] = await Promise.all([
    db.select<Row[]>(`SELECT id FROM ${UNITS_TABLE} WHERE risk_assessment_id = $1`, [riskAssessmentId]),
    db.select<Row[]>(`SELECT id FROM ${HAZARDS_TABLE} WHERE risk_assessment_id = $1`, [riskAssessmentId]),
  ])
  return { units: units.map((r) => r.id as string), hazards: hazards.map((r) => r.id as string) }
}

function pushOutbox(statements: Stmt[], rows: OutboxRow[]): void {
  const stmt = outboxStatementForRows(rows)
  if (stmt) statements.push(stmt)
}

/**
 * Creates or updates a RAMS in one transaction: upserts the header and replaces the unit links and
 * hazards. Any content change on an approved RAMS reverts it to draft and clears the approval; a save
 * that changes nothing keeps the approval.
 */
export async function saveRiskAssessment(input: RiskAssessmentInput): Promise<RiskAssessmentFull> {
  const unitIds = [...new Set(input.shoot_day_unit_ids)]
  await assertUnitsBelongToDay(input.shoot_day_id, unitIds)

  const id = await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()
    const existing = input.id ? await getRiskAssessment(input.id) : null
    if (input.id && !existing) throw new Error('Risk assessment not found')
    if (existing && existing.production_id !== input.production_id) {
      throw new Error('Risk assessment belongs to a different production')
    }

    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    const outbox: OutboxRow[] = []
    const content = contentOfInput({ ...input, shoot_day_unit_ids: unitIds })
    const raId = existing?.id ?? uuid()

    if (!existing) {
      const { stmt, payload } = headerInsert(raId, { ...content, production_id: input.production_id }, ts)
      statements.push(stmt)
      outbox.push({ entity: TABLE, entityId: raId, operation: 'create', payloadJson: JSON.stringify(payload) })
    } else {
      const changed =
        riskAssessmentContentSignature(content) !== riskAssessmentContentSignature(contentOf(existing))
      const revert = changed && existing.status === 'approved'
      const status: RiskAssessmentStatus = revert ? 'draft' : existing.status
      const approvedBy = revert ? null : existing.approved_by
      const approvedAt = revert ? null : existing.approved_at
      const payload = {
        shoot_day_id: content.shoot_day_id,
        location_id: content.location_id,
        location_name: content.location_name.trim(),
        activities: content.activities.trim(),
        responsible_person_id: content.responsible_person_id,
        responsible_person_name: content.responsible_person_name.trim(),
        first_aiders_json: serializeFirstAiders(content.first_aiders),
        hospital_name: blankToNull(content.hospital_name),
        hospital_address: blankToNull(content.hospital_address),
        hospital_phone: blankToNull(content.hospital_phone),
        police_name: blankToNull(content.police_name),
        police_address: blankToNull(content.police_address),
        police_phone: blankToNull(content.police_phone),
        status,
        approved_by: approvedBy,
        approved_at: approvedAt,
      }
      statements.push({
        sql: `UPDATE ${TABLE} SET shoot_day_id = $1, location_id = $2, location_name = $3, activities = $4,
          responsible_person_id = $5, responsible_person_name = $6, first_aiders_json = $7,
          hospital_name = $8, hospital_address = $9, hospital_phone = $10,
          police_name = $11, police_address = $12, police_phone = $13,
          status = $14, approved_by = $15, approved_at = $16, updated_at = $17 WHERE id = $18`,
        bindValues: [
          payload.shoot_day_id,
          payload.location_id,
          payload.location_name,
          payload.activities,
          payload.responsible_person_id,
          payload.responsible_person_name,
          payload.first_aiders_json,
          payload.hospital_name,
          payload.hospital_address,
          payload.hospital_phone,
          payload.police_name,
          payload.police_address,
          payload.police_phone,
          payload.status,
          payload.approved_by,
          payload.approved_at,
          ts,
          raId,
        ],
      })
      outbox.push({ entity: TABLE, entityId: raId, operation: 'update', payloadJson: JSON.stringify(payload) })

      const children = await selectChildIds(raId)
      statements.push({ sql: `DELETE FROM ${UNITS_TABLE} WHERE risk_assessment_id = $1`, bindValues: [raId] })
      statements.push({ sql: `DELETE FROM ${HAZARDS_TABLE} WHERE risk_assessment_id = $1`, bindValues: [raId] })
      for (const cid of children.units) outbox.push({ entity: UNITS_TABLE, entityId: cid, operation: 'delete', payloadJson: null })
      for (const cid of children.hazards) outbox.push({ entity: HAZARDS_TABLE, entityId: cid, operation: 'delete', payloadJson: null })
    }

    const units = unitInserts(raId, unitIds, ts)
    statements.push(...units.stmts)
    outbox.push(...units.outbox)

    input.hazards.forEach((h, i) => {
      const ins = hazardInsert(raId, h, i, ts)
      statements.push(ins.stmt)
      outbox.push({ entity: HAZARDS_TABLE, entityId: ins.id, operation: 'create', payloadJson: JSON.stringify(ins.payload) })
    })

    pushOutbox(statements, outbox)
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    return raId
  })

  return (await getRiskAssessment(id))!
}

/** Signs off a RAMS. Needs at least one hazard and a responsible person. */
export async function approveRiskAssessment(id: string, approvedBy: string): Promise<RiskAssessmentFull> {
  const name = approvedBy.trim()
  if (!name) throw new Error('Approver name is required')
  const ra = await getRiskAssessment(id)
  if (!ra) throw new Error('Risk assessment not found')
  if (ra.hazards.length === 0) throw new Error('Add at least one hazard before approving')
  if (!ra.responsible_person_name.trim()) throw new Error('Set a responsible person before approving')

  const db = await getDb()
  const ts = now()
  await runInSerializedTransaction(async () => {
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `UPDATE ${TABLE} SET status = 'approved', approved_by = $1, approved_at = $2, updated_at = $3 WHERE id = $4`,
        bindValues: [name, ts, ts, id],
      },
      outboxStatementForRow({
        entity: TABLE,
        entityId: id,
        operation: 'update',
        payloadJson: JSON.stringify({ status: 'approved', approved_by: name, approved_at: ts }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
  return (await getRiskAssessment(id))!
}

/**
 * Copies a RAMS onto each target shoot day as a draft (content copied, approval and exported PDF not).
 * Units map by `unit_id` onto the target day's units; if none match, the target day's units are used.
 * Returns the new ids in target order.
 */
export async function duplicateRiskAssessment(id: string, targetShootDayIds: string[]): Promise<string[]> {
  const source = await getRiskAssessment(id)
  if (!source) throw new Error('Risk assessment not found')
  if (targetShootDayIds.length === 0) return []

  const db = await getDb()
  const sourceUnits = await db.select<Row[]>(
    `SELECT id, unit_id FROM shoot_day_units WHERE shoot_day_id = $1 AND deleted_at IS NULL`,
    [source.shoot_day_id]
  )
  const unitIdBySourceSdu = new Map(sourceUnits.map((r) => [r.id as string, r.unit_id as string]))
  const wantedUnitIds = new Set(
    source.shoot_day_unit_ids.map((sdu) => unitIdBySourceSdu.get(sdu)).filter((u): u is string => !!u)
  )

  const targetUnitsByDay = new Map<string, { id: string; unit_id: string }[]>()
  for (const dayId of new Set(targetShootDayIds)) {
    const rows = await db.select<Row[]>(
      `SELECT id, unit_id FROM shoot_day_units WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY unit_id`,
      [dayId]
    )
    targetUnitsByDay.set(dayId, rows.map((r) => ({ id: r.id as string, unit_id: r.unit_id as string })))
  }

  return runInSerializedTransaction(async () => {
    const ts = now()
    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    const outbox: OutboxRow[] = []
    const newIds: string[] = []

    for (const dayId of targetShootDayIds) {
      const targetUnits = targetUnitsByDay.get(dayId) ?? []
      const mapped = targetUnits.filter((u) => wantedUnitIds.has(u.unit_id))
      const unitIds = (mapped.length > 0 ? mapped : targetUnits).map((u) => u.id)

      const raId = uuid()
      newIds.push(raId)
      const content: RiskAssessmentContent = { ...contentOf(source), shoot_day_id: dayId, shoot_day_unit_ids: unitIds }
      const { stmt, payload } = headerInsert(raId, { ...content, production_id: source.production_id }, ts)
      statements.push(stmt)
      outbox.push({ entity: TABLE, entityId: raId, operation: 'create', payloadJson: JSON.stringify(payload) })

      const units = unitInserts(raId, unitIds, ts)
      statements.push(...units.stmts)
      outbox.push(...units.outbox)

      source.hazards.forEach((h, i) => {
        const ins = hazardInsert(raId, { ...h, id: undefined }, i, ts)
        statements.push(ins.stmt)
        outbox.push({ entity: HAZARDS_TABLE, entityId: ins.id, operation: 'create', payloadJson: JSON.stringify(ins.payload) })
      })
    }

    pushOutbox(statements, outbox)
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    return newIds
  })
}

/**
 * Permanently deletes a RAMS with its hazards and unit links, and its exported PDF (file and
 * document row) so nothing is left behind in Documents.
 */
export async function deleteRiskAssessment(id: string): Promise<void> {
  const ra = await selectHeader(id)
  if (!ra) return
  // Document first (file, then row): if the RAMS delete fails the link is already SET NULL and a retry works.
  if (ra.generated_document_id) await hardDeleteDocument(ra.generated_document_id)

  const children = await selectChildIds(id)
  const db = await getDb()
  await runInSerializedTransaction(async () => {
    const statements: Stmt[] = [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `DELETE FROM ${HAZARDS_TABLE} WHERE risk_assessment_id = $1`, bindValues: [id] },
      { sql: `DELETE FROM ${UNITS_TABLE} WHERE risk_assessment_id = $1`, bindValues: [id] },
      { sql: `DELETE FROM ${TABLE} WHERE id = $1`, bindValues: [id] },
    ]
    const outbox: OutboxRow[] = [
      ...children.hazards.map((cid): OutboxRow => ({ entity: HAZARDS_TABLE, entityId: cid, operation: 'delete', payloadJson: null })),
      ...children.units.map((cid): OutboxRow => ({ entity: UNITS_TABLE, entityId: cid, operation: 'delete', payloadJson: null })),
      { entity: TABLE, entityId: id, operation: 'delete', payloadJson: null },
    ]
    pushOutbox(statements, outbox)
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}

/**
 * Builds the statements that link a freshly exported PDF to a RAMS (for `persistProductionDocument`'s
 * `extraStatements`, so the document and the link commit together).
 */
export function buildSetGeneratedDocumentStatements(riskAssessmentId: string, documentId: string, ts: string): Stmt[] {
  return [
    {
      sql: `UPDATE ${TABLE} SET generated_document_id = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [documentId, ts, riskAssessmentId],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: riskAssessmentId,
      operation: 'update',
      payloadJson: JSON.stringify({ generated_document_id: documentId }),
    }),
  ]
}
