/**
 * Overtime (experimental) storage. Local SQLite only, like Script Supervisor: writes throw
 * OVERTIME_REMOTE_ERROR for productions served from a remote server.
 *
 * The unit's actual call / wrap are the Script Supervisor day log's (saveDayLog); this module only
 * stores per-person exceptions, buyouts and the production's overtime rule.
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { getEffectiveDataSourceForProduction } from '../projectDataSource'
import { coerceNumber } from '../sqlValueCoercion'
import { resolveBudgetRevisionId } from './budgetRevisions'
import { normaliseDayLogTime } from './scriptSupervisor'
import {
  DEFAULT_OVERTIME_SETTINGS,
  pickDayRates,
  type OvertimeSettings,
  type LabourRateCandidate,
  type OvertimeBasis,
} from '@/lib/overtime/overtime'
import { parseLabourLineItemDetails } from '@/lib/budget/line-items/labour'

export const OVERTIME_REMOTE_ERROR =
  'Overtime figures are stored on this device only and are not available for productions served from a remote server.'

type Stmt = { sql: string; bindValues: unknown[] }

const SETTINGS = 'production_crew_hours_settings'
const DAY_HOURS = 'crew_day_hours'
const PERSON_SETTINGS = 'crew_hours_person_settings'

export type CrewDayHours = {
  id: string
  production_id: string
  shoot_day_id: string
  person_id: string
  call_time: string | null
  wrap_time: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const str = (v: unknown): string | null => (v == null ? null : (v as string))

async function assertLocal(productionId: string): Promise<void> {
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    throw new Error(OVERTIME_REMOTE_ERROR)
  }
}

async function assertInProduction(table: 'shoot_days' | 'people', id: string, productionId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  const label = table === 'shoot_days' ? 'Shoot day' : 'Person'
  if (rows.length === 0) throw new Error(`${label} not found`)
  if (rows[0]!.production_id !== productionId) throw new Error(`${label} belongs to a different production`)
}

async function runBatch(statements: Stmt[]): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [{ sql: 'BEGIN', bindValues: [] }, ...statements, { sql: 'COMMIT', bindValues: [] }])
  })
}

// ─── Overtime rule ──────────────────────────────────────────────────────────

export async function getOvertimeSettings(productionId: string): Promise<OvertimeSettings> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SETTINGS} WHERE production_id = $1`, [
    productionId,
  ])
  const r = rows[0]
  if (!r) return { ...DEFAULT_OVERTIME_SETTINGS }
  const d = DEFAULT_OVERTIME_SETTINGS
  return {
    overtime_basis: r.overtime_basis === 'day_length' ? 'day_length' : 'scheduled_wrap',
    standard_day_minutes: coerceNumber(r.standard_day_minutes, d.standard_day_minutes),
    hourly_rate_divisor: coerceNumber(r.hourly_rate_divisor, d.hourly_rate_divisor),
    overtime_multiplier: coerceNumber(r.overtime_multiplier, d.overtime_multiplier),
    overtime_increment_minutes: coerceNumber(r.overtime_increment_minutes, d.overtime_increment_minutes),
    minimum_rest_minutes: coerceNumber(r.minimum_rest_minutes, d.minimum_rest_minutes),
  }
}

export function validateOvertimeSettings(s: OvertimeSettings): string | null {
  const basis: OvertimeBasis[] = ['scheduled_wrap', 'day_length']
  if (!basis.includes(s.overtime_basis)) return 'Choose when overtime starts.'
  if (!Number.isInteger(s.standard_day_minutes) || s.standard_day_minutes <= 0 || s.standard_day_minutes > 24 * 60)
    return 'A standard day must be between 1 minute and 24 hours.'
  if (!(s.hourly_rate_divisor > 0)) return 'The hourly rate divisor must be more than 0.'
  if (!(s.overtime_multiplier >= 0)) return 'The overtime multiplier cannot be negative.'
  if (!Number.isInteger(s.overtime_increment_minutes) || s.overtime_increment_minutes < 0 || s.overtime_increment_minutes > 240)
    return 'Billing blocks must be between 0 and 240 minutes.'
  if (!Number.isInteger(s.minimum_rest_minutes) || s.minimum_rest_minutes < 0 || s.minimum_rest_minutes > 24 * 60)
    return 'Minimum rest must be between 0 and 24 hours.'
  return null
}

export async function saveOvertimeSettings(productionId: string, settings: OvertimeSettings): Promise<OvertimeSettings> {
  await assertLocal(productionId)
  const problem = validateOvertimeSettings(settings)
  if (problem) throw new Error(problem)
  const ts = now()
  const values = [
    settings.overtime_basis,
    settings.standard_day_minutes,
    settings.hourly_rate_divisor,
    settings.overtime_multiplier,
    settings.overtime_increment_minutes,
    settings.minimum_rest_minutes,
  ]
  await runBatch([
    {
      sql: `INSERT INTO ${SETTINGS} (production_id, overtime_basis, standard_day_minutes, hourly_rate_divisor,
              overtime_multiplier, overtime_increment_minutes, minimum_rest_minutes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            ON CONFLICT (production_id) DO UPDATE SET overtime_basis = $2, standard_day_minutes = $3,
              hourly_rate_divisor = $4, overtime_multiplier = $5, overtime_increment_minutes = $6,
              minimum_rest_minutes = $7, updated_at = $8`,
      bindValues: [productionId, ...values, ts],
    },
    outboxStatementForRow({
      entity: SETTINGS,
      entityId: productionId,
      operation: 'update',
      payloadJson: JSON.stringify(settings),
    }),
  ])
  return getOvertimeSettings(productionId)
}

// ─── Per-person times on a day ──────────────────────────────────────────────

function rowToDayHours(r: Record<string, unknown>): CrewDayHours {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: r.shoot_day_id as string,
    person_id: r.person_id as string,
    call_time: str(r.call_time),
    wrap_time: str(r.wrap_time),
    notes: str(r.notes),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: str(r.deleted_at),
  }
}

/** Live per-person rows for the given shoot days. */
export async function listCrewDayHours(shootDayIds: readonly string[]): Promise<CrewDayHours[]> {
  const ids = [...new Set(shootDayIds)]
  if (ids.length === 0) return []
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${DAY_HOURS} WHERE shoot_day_id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})
     AND deleted_at IS NULL ORDER BY created_at`,
    ids
  )
  return rows.map(rowToDayHours)
}

export type SetCrewDayTimesInput = {
  productionId: string
  shootDayId: string
  personId: string
  /** Fields left undefined keep their saved value; null (or blank) means "the unit's time". */
  callTime?: string | null
  wrapTime?: string | null
  notes?: string | null
}

/**
 * Records a person's own call and/or wrap for a day. When nothing of their own is left
 * (both times and notes empty), the row is removed and they follow the unit again.
 */
export async function setCrewDayTimes(input: SetCrewDayTimesInput): Promise<CrewDayHours | null> {
  await assertLocal(input.productionId)
  await assertInProduction('shoot_days', input.shootDayId, input.productionId)
  await assertInProduction('people', input.personId, input.productionId)

  return runInSerializedTransaction(async () => {
    const db = await getDb()
    const existingRows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${DAY_HOURS} WHERE shoot_day_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
      [input.shootDayId, input.personId]
    )
    const existing = existingRows[0] ? rowToDayHours(existingRows[0]) : null
    const call = input.callTime !== undefined ? normaliseDayLogTime(input.callTime) : existing?.call_time ?? null
    const wrap = input.wrapTime !== undefined ? normaliseDayLogTime(input.wrapTime) : existing?.wrap_time ?? null
    const notes = input.notes !== undefined ? input.notes?.trim() || null : existing?.notes ?? null
    const ts = now()
    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    let resultId: string | null

    if (call == null && wrap == null && notes == null) {
      if (!existing) return null
      statements.push(
        { sql: `UPDATE ${DAY_HOURS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, existing.id] },
        outboxStatementForRow({ entity: DAY_HOURS, entityId: existing.id, operation: 'delete', payloadJson: null })
      )
      resultId = null
    } else if (existing) {
      statements.push(
        {
          sql: `UPDATE ${DAY_HOURS} SET call_time = $1, wrap_time = $2, notes = $3, updated_at = $4 WHERE id = $5`,
          bindValues: [call, wrap, notes, ts, existing.id],
        },
        outboxStatementForRow({
          entity: DAY_HOURS,
          entityId: existing.id,
          operation: 'update',
          payloadJson: JSON.stringify({ call_time: call, wrap_time: wrap, notes }),
        })
      )
      resultId = existing.id
    } else {
      const id = uuid()
      statements.push(
        {
          sql: `INSERT INTO ${DAY_HOURS} (id, production_id, shoot_day_id, person_id, call_time, wrap_time, notes, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          bindValues: [id, input.productionId, input.shootDayId, input.personId, call, wrap, notes, ts],
        },
        outboxStatementForRow({
          entity: DAY_HOURS,
          entityId: id,
          operation: 'create',
          payloadJson: JSON.stringify({
            production_id: input.productionId,
            shoot_day_id: input.shootDayId,
            person_id: input.personId,
            call_time: call,
            wrap_time: wrap,
            notes,
          }),
        })
      )
      resultId = id
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    if (!resultId) return null
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DAY_HOURS} WHERE id = $1`, [resultId])
    return rows[0] ? rowToDayHours(rows[0]) : null
  })
}

// ─── Buyouts ────────────────────────────────────────────────────────────────

export async function listOvertimeExemptPersonIds(productionId: string): Promise<Set<string>> {
  const db = await getDb()
  const rows = await db.select<Array<{ person_id: string }>>(
    `SELECT person_id FROM ${PERSON_SETTINGS} WHERE production_id = $1 AND overtime_exempt = 1`,
    [productionId]
  )
  return new Set(rows.map((r) => r.person_id))
}

export async function setOvertimeExempt(productionId: string, personId: string, exempt: boolean): Promise<void> {
  await assertLocal(productionId)
  await assertInProduction('people', personId, productionId)
  const ts = now()
  await runBatch([
    {
      sql: `INSERT INTO ${PERSON_SETTINGS} (production_id, person_id, overtime_exempt, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $4)
            ON CONFLICT (production_id, person_id) DO UPDATE SET overtime_exempt = $3, updated_at = $4`,
      bindValues: [productionId, personId, exempt ? 1 : 0, ts],
    },
    outboxStatementForRow({
      entity: PERSON_SETTINGS,
      entityId: `${productionId}:${personId}`,
      operation: 'update',
      payloadJson: JSON.stringify({ production_id: productionId, person_id: personId, overtime_exempt: exempt }),
    }),
  ])
}

// ─── Day rates ──────────────────────────────────────────────────────────────

/**
 * Each person's day rate from labour line items in the given (else live) budget revision.
 * See pickDayRates for which line wins when a person has several.
 */
export async function listLabourDayRates(productionId: string, revisionId?: string | null): Promise<Map<string, number>> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rows = await db.select<Array<{ details_json: string }>>(
    `SELECT d.details_json FROM budget_items bi
     INNER JOIN budget_item_details d ON d.budget_item_id = bi.id
     WHERE bi.production_id = $1 AND bi.budget_revision_id = $2 AND bi.deleted_at IS NULL
       AND d.line_item_type = 'labour'`,
    [productionId, budgetRevisionId]
  )
  const lines: LabourRateCandidate[] = []
  for (const r of rows) {
    const parsed = parseLabourLineItemDetails(r.details_json)
    if (!parsed.ok) continue
    lines.push({
      person_id: parsed.value.person_id ?? null,
      rate_per_day: parsed.value.rate_per_day ?? null,
      labour_rate_type: parsed.value.labour_rate_type ?? null,
    })
  }
  return pickDayRates(lines)
}
