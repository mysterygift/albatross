import { getDb } from '../client'

/**
 * Latest `updated_at` among what a shoot day + unit's paperwork is built from: the unit's strips,
 * the shoot day, the shoot-day unit, and bookings that call people to that unit (including deleted
 * rows, since removing one is a change too). Null when there is nothing.
 */
export async function getLatestScheduleChangeForDayUnit(
  shootDayId: string,
  shootDayUnitId: string
): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT MAX(ts) AS latest FROM (
       SELECT MAX(updated_at) AS ts FROM stripboard_strips WHERE shoot_day_id = $1 AND shoot_day_unit_id = $2
       UNION ALL SELECT updated_at AS ts FROM shoot_days WHERE id = $1
       UNION ALL SELECT updated_at AS ts FROM shoot_day_units WHERE id = $2
       UNION ALL SELECT MAX(updated_at) AS ts FROM bookings
         WHERE shoot_day_id = $1 AND (shoot_day_unit_id IS NULL OR shoot_day_unit_id = $2)
     ) changes`,
    [shootDayId, shootDayUnitId]
  )
  const latest = rows[0]?.latest
  return latest == null ? null : String(latest)
}
