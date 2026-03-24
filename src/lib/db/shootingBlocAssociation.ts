/**
 * Canonical shooting-bloc association for shoot days (EP4 / EP11).
 *
 * **Product rules**
 * - `shoot_date` values are ISO `YYYY-MM-DD`. Bloc assignment is **inclusive**:
 *   `start_date <= shoot_date <= end_date` (same convention as `shootingBlocRangesOverlap`).
 * - EP1 ensures blocs do not overlap within a production; at most one bloc contains a date.
 *   The resolver still uses `ORDER BY start_date ASC, id ASC LIMIT 1` if data were inconsistent.
 * - If no bloc contains the date → persist `shooting_bloc_id` as `NULL`.
 * - `shooting_bloc_id` is **system-managed** from date + bloc ranges. Do not expose it on public
 *   shoot-day update APIs, and do not change shoot-day dates with raw SQL that skips this layer.
 * - **Range edits (EP11):** pure calendar shifts (same span, parallel delta) move all bloc-tagged
 *   shoot days by that delta (collision-safe with other production days). Shrinks delete bloc-tagged
 *   shoot days whose dates fall outside the new inclusive range. Expands only re-resolve associations.
 */

import { executeBatch, getDb, now, runInSerializedTransaction } from './client'
import { outboxPush, outboxStatementForRow } from './outbox'

const SHOOT_DAYS_TABLE = 'shoot_days'
const SHOOTING_BLOCS_TABLE = 'shooting_blocs'

type BlocRow = { id: string; start_date: string; end_date: string }

function utcMidnightMs(isoYyyyMmDd: string): number {
  const [y, m, d] = isoYyyyMmDd.split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid ISO date: ${isoYyyyMmDd}`)
  }
  return Date.UTC(y!, m! - 1, d!)
}

/** Inclusive day count from `start` through `end` (ISO `YYYY-MM-DD`). */
export function inclusiveDayCount(isoStart: string, isoEnd: string): number {
  const diff = Math.round((utcMidnightMs(isoEnd) - utcMidnightMs(isoStart)) / 86400000)
  return diff + 1
}

export function calendarDayDeltaBetween(isoFrom: string, isoTo: string): number {
  return Math.round((utcMidnightMs(isoTo) - utcMidnightMs(isoFrom)) / 86400000)
}

export function addCalendarDaysToIso(iso: string, deltaDays: number): string {
  const t = utcMidnightMs(iso) + deltaDays * 86400000
  const d = new Date(t)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isPureCalendarShift(
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string
): boolean {
  return calendarDayDeltaBetween(oldStart, newStart) === calendarDayDeltaBetween(oldEnd, newEnd)
}

export type ShootingBlocRangeMutationKind = 'none' | 'shift' | 'shrink' | 'expand'

export function classifyShootingBlocRangeMutation(
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string
):
  | { kind: 'none' }
  | { kind: 'shift'; deltaDays: number }
  | { kind: 'shrink' }
  | { kind: 'expand' } {
  if (oldStart === newStart && oldEnd === newEnd) return { kind: 'none' }
  const oldLen = inclusiveDayCount(oldStart, oldEnd)
  const newLen = inclusiveDayCount(newStart, newEnd)
  if (isPureCalendarShift(oldStart, oldEnd, newStart, newEnd)) {
    const deltaDays = calendarDayDeltaBetween(oldStart, newStart)
    if (deltaDays === 0) return { kind: 'none' }
    return { kind: 'shift', deltaDays }
  }
  if (newLen > oldLen) return { kind: 'expand' }
  return { kind: 'shrink' }
}

export type BlocTaggedShootDaySummary = { id: string; shoot_date: string }

export type ShootingBlocRangeChangeDescription = {
  kind: ShootingBlocRangeMutationKind
  deltaDays: number | null
  excludedShootDayIds: string[]
  trimFromStart: boolean
  trimFromEnd: boolean
  title: string
  detailLines: string[]
}

/** UX copy + structured data for confirmation before `updateShootingBloc` date mutations. */
export function describeShootingBlocRangeChange(
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string,
  blocTaggedShootDays: BlocTaggedShootDaySummary[]
): ShootingBlocRangeChangeDescription {
  const classified = classifyShootingBlocRangeMutation(oldStart, oldEnd, newStart, newEnd)
  if (classified.kind === 'none') {
    return {
      kind: 'none',
      deltaDays: null,
      excludedShootDayIds: [],
      trimFromStart: false,
      trimFromEnd: false,
      title: 'No date change',
      detailLines: [],
    }
  }

  const excluded = blocTaggedShootDays
    .filter((d) => d.shoot_date < newStart || d.shoot_date > newEnd)
    .map((d) => d.id)
  const trimFromStart = newStart > oldStart
  const trimFromEnd = newEnd < oldEnd

  if (classified.kind === 'shift') {
    const d = classified.deltaDays
    const mag = Math.abs(d)
    const dir = d > 0 ? 'later' : 'earlier'
    const label = mag === 1 ? '1 day' : `${mag} days`
    return {
      kind: 'shift',
      deltaDays: d,
      excludedShootDayIds: [],
      trimFromStart: false,
      trimFromEnd: false,
      title: 'Shift shoot days with the bloc',
      detailLines: [
        `All shoot days in this bloc will move ${dir} by ${label} (same calendar span).`,
        `Delta: ${d > 0 ? '+' : ''}${d} day(s).`,
      ],
    }
  }

  if (classified.kind === 'expand') {
    return {
      kind: 'expand',
      deltaDays: null,
      excludedShootDayIds: [],
      trimFromStart: false,
      trimFromEnd: false,
      title: 'Extend shooting bloc',
      detailLines: [
        'The bloc will cover more calendar days.',
        'No shoot days will be removed or shifted; associations will be updated from dates.',
      ],
    }
  }

  const parts: string[] = []
  if (trimFromStart && trimFromEnd) parts.push('the start and end of the bloc')
  else if (trimFromStart) parts.push('the start of the bloc')
  else if (trimFromEnd) parts.push('the end of the bloc')
  else parts.push('this bloc')

  const count = excluded.length
  const countPhrase = count === 1 ? 'One shoot day will be removed.' : `${count} shoot days will be removed.`

  return {
    kind: 'shrink',
    deltaDays: null,
    excludedShootDayIds: excluded,
    trimFromStart,
    trimFromEnd,
    title: 'Shrink shooting bloc',
    detailLines: [
      `Excluded days no longer fall inside the new range (${parts.join(' and ')}).`,
      count > 0 ? countPhrase : 'No shoot days are currently scheduled in the removed span.',
    ],
  }
}

function resolveBlocIdFromSortedBlocs(blocs: BlocRow[], shootDate: string): string | null {
  for (const b of blocs) {
    if (b.start_date <= shootDate && b.end_date >= shootDate) return b.id
  }
  return null
}

export async function findShootingBlocIdForProductionDate(
  productionId: string,
  shootDate: string
): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `
    SELECT id FROM ${SHOOTING_BLOCS_TABLE}
    WHERE production_id = $1 AND deleted_at IS NULL
      AND start_date <= $2 AND end_date >= $2
    ORDER BY start_date ASC, id ASC
    LIMIT 1
    `,
    [productionId, shootDate]
  )
  return rows.length ? (rows[0]!.id as string) : null
}

/**
 * Ensures `blocId` references a non-deleted bloc in `productionId`. No-op when `blocId` is null.
 */
export async function validateShootingBlocForShootDay(
  productionId: string,
  blocId: string | null
): Promise<void> {
  if (blocId == null) return
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT 1 AS n FROM ${SHOOTING_BLOCS_TABLE}
     WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [blocId, productionId]
  )
  if (rows.length === 0) {
    throw new Error('shooting_bloc_id must reference a non-deleted bloc in the same production')
  }
}

export async function persistShootDayShootingBlocId(
  shootDayId: string,
  productionId: string,
  shootDate: string
): Promise<void> {
  const resolved = await findShootingBlocIdForProductionDate(productionId, shootDate)
  await validateShootingBlocForShootDay(productionId, resolved)

  const db = await getDb()
  const curRows = await db.select<Record<string, unknown>[]>(
    `SELECT shooting_bloc_id FROM ${SHOOT_DAYS_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [shootDayId]
  )
  const current = curRows.length ? ((curRows[0]!.shooting_bloc_id as string | null) ?? null) : null
  const same =
    (current === null && resolved === null) ||
    (current !== null && resolved !== null && current === resolved)
  if (same) return

  const ts = now()
  await db.execute(
    `UPDATE ${SHOOT_DAYS_TABLE} SET shooting_bloc_id = $1, updated_at = $2 WHERE id = $3`,
    [resolved, ts, shootDayId]
  )
  await outboxPush(SHOOT_DAYS_TABLE, shootDayId, 'update', JSON.stringify({ shooting_bloc_id: resolved }))
}

export type ShootingBlocRangeChangeArgs = {
  productionId: string
  blocId: string
  oldStart: string
  oldEnd: string
  newStart: string
  newEnd: string
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b
}

function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b
}

/**
 * Re-resolve `shooting_bloc_id` for shoot days possibly affected by a bloc range edit.
 * Uses the union of old and new bloc intervals plus any day currently tagged to this bloc.
 */
export async function reassignShootDaysAfterShootingBlocRangeChange(
  args: ShootingBlocRangeChangeArgs
): Promise<void> {
  const { productionId, blocId, oldStart, oldEnd, newStart, newEnd } = args
  const windowMin = minIsoDate(oldStart, newStart)
  const windowMax = maxIsoDate(oldEnd, newEnd)

  const db = await getDb()
  const affected = await db.select<Record<string, unknown>[]>(
    `
    SELECT id, shoot_date, shooting_bloc_id FROM ${SHOOT_DAYS_TABLE}
    WHERE production_id = $1 AND deleted_at IS NULL
      AND (
        (shoot_date >= $2 AND shoot_date <= $3)
        OR shooting_bloc_id = $4
      )
    `,
    [productionId, windowMin, windowMax, blocId]
  )
  if (affected.length === 0) return

  const blocRows = await db.select<Record<string, unknown>[]>(
    `
    SELECT id, start_date, end_date FROM ${SHOOTING_BLOCS_TABLE}
    WHERE production_id = $1 AND deleted_at IS NULL
    ORDER BY start_date ASC, id ASC
    `,
    [productionId]
  )
  const blocs: BlocRow[] = blocRows.map((r) => ({
    id: r.id as string,
    start_date: r.start_date as string,
    end_date: r.end_date as string,
  }))

  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]
  for (const row of affected) {
    const id = row.id as string
    const shootDate = row.shoot_date as string
    const current = (row.shooting_bloc_id as string | null) ?? null
    const expected = resolveBlocIdFromSortedBlocs(blocs, shootDate)
    const unchanged =
      (current === null && expected === null) ||
      (current !== null && expected !== null && current === expected)
    if (unchanged) continue

    statements.push({
      sql: `UPDATE ${SHOOT_DAYS_TABLE} SET shooting_bloc_id = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [expected, ts, id],
    })
    statements.push(
      outboxStatementForRow({
        entity: SHOOT_DAYS_TABLE,
        entityId: id,
        operation: 'update',
        payloadJson: JSON.stringify({ shooting_bloc_id: expected }),
      })
    )
  }
  if (statements.length === 1) return
  statements.push({ sql: 'COMMIT', bindValues: [] })
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
}
