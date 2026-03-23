/**
 * Calendar data layer — aggregated shoot-day events for the Schedule calendar view.
 *
 * One event per (shoot_day, shoot_day_unit). Aggregates shotCount and estMinutes
 * in SQL to avoid N+1. Primary location derived from scheduled SHOT strips.
 */
import { getDb } from '../client'
import type {
  CalendarShootDayEvent,
  CalendarDateRange,
  CalendarEventFilters,
  CalendarUnitKey,
} from '../types'

function unitNameToKey(name: string): CalendarUnitKey {
  const lower = name.toLowerCase()
  if (lower.includes('second') || lower.includes('2nd')) return 'second'
  return 'main'
}

/**
 * Extract lunch time from meal_times_json array.
 * Format: [{ name: "Lunch", time: "13:00" }, ...]
 */
function parseLunchTime(mealTimesJson: string | null): string | null {
  if (!mealTimesJson?.trim()) return null
  try {
    const arr = JSON.parse(mealTimesJson) as Array<{ name?: string; time?: string }>
    if (!Array.isArray(arr)) return null
    const lunch = arr.find((m) => (m.name ?? '').toLowerCase() === 'lunch')
    return lunch?.time ?? null
  } catch {
    return null
  }
}

/**
 * List calendar events (one per shoot_day_unit) in the given date range.
 * Aggregates shotCount and estMinutes in SQL. Primary location from first
 * scheduled SHOT strip by sort_index.
 */
export async function listCalendarShootDayEvents(
  productionId: string,
  dateRange: CalendarDateRange,
  filters?: CalendarEventFilters
): Promise<CalendarShootDayEvent[]> {
  const db = await getDb()
  const params: unknown[] = [productionId, dateRange.start, dateRange.end]
  let unitFilter = ''
  if (filters?.unitId) {
    params.push(filters.unitId)
    unitFilter = ` AND u.id = $${params.length}`
  }

  // Stats aggregation: shot count and est minutes per (shoot_day_id, shoot_day_unit_id).
  // estMinutes = SUM(COALESCE(strip.estimated_minutes, shot.estimated_shoot_minutes, 0))
  const rows = await db.select<Record<string, unknown>[]>(
    `
    WITH strip_stats AS (
      SELECT
        st.shoot_day_id,
        st.shoot_day_unit_id,
        COUNT(CASE WHEN st.strip_type IN ('SHOT', 'SCENE') THEN 1 END) AS shot_count,
        COALESCE(SUM(
          COALESCE(st.estimated_minutes, sh.estimated_shoot_minutes, 0)
        ), 0) AS est_minutes
      FROM stripboard_strips st
      LEFT JOIN shots sh ON sh.id = st.shot_id AND sh.deleted_at IS NULL
      WHERE st.shoot_day_id IS NOT NULL
        AND st.shoot_day_unit_id IS NOT NULL
        AND st.deleted_at IS NULL
        AND st.strip_status = 'SCHEDULED'
      GROUP BY st.shoot_day_id, st.shoot_day_unit_id
    )
    SELECT
      sd.id AS shoot_day_id,
      sdu.id AS shoot_day_unit_id,
      sd.shoot_date AS date,
      u.id AS unit_id,
      u.name AS unit_name,
      sd.call_time,
      sd.wrap_time,
      sd.notes,
      sd.meal_times_json,
      COALESCE(ss.shot_count, 0) AS shot_count,
      COALESCE(ss.est_minutes, 0) AS est_minutes,
      (
        SELECT sc.location_id
        FROM stripboard_strips st
        LEFT JOIN shots sh ON sh.id = st.shot_id AND sh.deleted_at IS NULL
        LEFT JOIN scenes sc ON sc.id = COALESCE(sh.scene_id, st.scene_id) AND sc.deleted_at IS NULL
        WHERE st.shoot_day_id = sd.id
          AND st.shoot_day_unit_id = sdu.id
          AND st.deleted_at IS NULL
          AND st.strip_status = 'SCHEDULED'
          AND st.strip_type IN ('SHOT', 'SCENE')
          AND sc.location_id IS NOT NULL
        ORDER BY st.sort_index
        LIMIT 1
      ) AS primary_location_id
    FROM shoot_days sd
    INNER JOIN shoot_day_units sdu ON sdu.shoot_day_id = sd.id AND sdu.deleted_at IS NULL
    INNER JOIN units u ON u.id = sdu.unit_id AND u.deleted_at IS NULL
    LEFT JOIN strip_stats ss ON ss.shoot_day_id = sd.id AND ss.shoot_day_unit_id = sdu.id
    WHERE sd.production_id = $1
      AND sd.deleted_at IS NULL
      AND sd.shoot_date >= $2
      AND sd.shoot_date <= $3
      ${unitFilter}
    ORDER BY sd.shoot_date, u.name
    `,
    params
  )

  const locationIds = [
    ...new Set(
      rows
        .map((r) => r.primary_location_id as string | null)
        .filter((id): id is string => !!id)
    ),
  ]
  const locationMap = new Map<string, string>()
  if (locationIds.length > 0) {
    const placeholders = locationIds.map((_, i) => `$${i + 1}`).join(', ')
    const locRows = await db.select<Record<string, unknown>[]>(
      `SELECT id, name FROM locations WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      locationIds
    )
    for (const r of locRows) {
      locationMap.set(r.id as string, r.name as string)
    }
  }

  return rows.map((r) => {
    const primaryLocationId = r.primary_location_id as string | null
    const mapped = {
      shootDayId: r.shoot_day_id as string,
      shootDayUnitId: r.shoot_day_unit_id as string,
      date: r.date as string,
      unitId: r.unit_id as string,
      unitName: r.unit_name as string,
      unitKey: unitNameToKey(r.unit_name as string),
      callTime: (r.call_time as string | null) ?? null,
      lunchTime: parseLunchTime(r.meal_times_json as string | null),
      wrapTime: (r.wrap_time as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      primaryLocationName: primaryLocationId ? locationMap.get(primaryLocationId) ?? null : null,
      primaryLocationId,
      shotCount: Number(r.shot_count) || 0,
      estMinutes: Number(r.est_minutes) || 0,
    } satisfies CalendarShootDayEvent
    return mapped
  })
}
