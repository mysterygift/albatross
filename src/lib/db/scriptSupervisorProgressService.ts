/**
 * Script Supervisor shooting progress (SS4): per-scene status and per-day pages, derived from slates,
 * takes, the stripboard and the script supervisor's scene marks. Local SQLite only; read-only.
 */
import { getDb } from './client'
import { coerceNumber } from './sqlValueCoercion'
import {
  buildSceneProgressRows,
  summariseProgress,
  type ProgressTotals,
  type SceneForProgress,
  type SceneMarkedStatus,
  type SceneProgressMark,
  type SceneProgressRow,
  type SceneSlateAggregate,
} from '@/lib/script-supervisor/progress'

export type DayProgress = {
  shootDayId: string
  shootDate: string
  dayNumber: number | null
  /** Eighths of the scenes on this day's stripboard. */
  scheduledEighths: number
  /** Eighths of scenes marked complete on this day. */
  completedEighths: number
  slates: number
  takes: number
}

export type ShootProgress = {
  rows: SceneProgressRow[]
  totals: ProgressTotals
  days: DayProgress[]
}

const num = (v: unknown): number => coerceNumber(v, 0)
const numOrNull = (v: unknown): number | null => (v == null ? null : coerceNumber(v, 0))

/** Natural scene order: 2 < 10 < 10A < 11. */
export function compareSceneNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export async function loadShootProgress(productionId: string): Promise<ShootProgress> {
  const db = await getDb()
  const [sceneRows, aggRows, markRows, dayRows, dayCountRows, scheduledRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT id, scene_number, title, page_eighths, episode_id FROM scenes
       WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT s.scene_id,
              COUNT(DISTINCT s.id) AS slates,
              COUNT(t.id) AS takes,
              SUM(CASE WHEN t.status = 'print' THEN 1 ELSE 0 END) AS prints,
              MAX(d.shoot_date) AS last_date
       FROM slates s
       INNER JOIN shoot_days d ON d.id = s.shoot_day_id
       LEFT JOIN takes t ON t.slate_id = s.id AND t.deleted_at IS NULL
       WHERE s.production_id = $1 AND s.deleted_at IS NULL AND s.scene_id IS NOT NULL
       GROUP BY s.scene_id`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT scene_id, marked_status, completed_shoot_day_id, credited_eighths, notes
       FROM script_supervisor_scene_progress WHERE production_id = $1`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT id, shoot_date, day_number FROM shoot_days
       WHERE production_id = $1 AND deleted_at IS NULL ORDER BY shoot_date`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT s.shoot_day_id, COUNT(DISTINCT s.id) AS slates, COUNT(t.id) AS takes
       FROM slates s
       LEFT JOIN takes t ON t.slate_id = s.id AND t.deleted_at IS NULL
       WHERE s.production_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.shoot_day_id`,
      [productionId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT DISTINCT st.shoot_day_id, sc.id AS scene_id, sc.page_eighths
       FROM stripboard_strips st
       LEFT JOIN shots sh ON sh.id = st.shot_id AND sh.deleted_at IS NULL
       INNER JOIN scenes sc ON sc.id = CASE
           WHEN st.strip_type = 'SCENE' THEN st.scene_id
           WHEN st.strip_type = 'SHOT' THEN sh.scene_id
         END
       WHERE st.production_id = $1 AND st.deleted_at IS NULL AND sc.deleted_at IS NULL`,
      [productionId]
    ),
  ])

  const dayNumberByDate = new Map<string, number | null>(
    dayRows.map((d) => [d.shoot_date as string, numOrNull(d.day_number)])
  )

  const scenes: SceneForProgress[] = sceneRows
    .map((r) => ({
      id: r.id as string,
      scene_number: r.scene_number as string,
      title: (r.title as string | null) ?? null,
      page_eighths: numOrNull(r.page_eighths),
      episode_id: (r.episode_id as string | null) ?? null,
    }))
    .sort((a, b) => compareSceneNumbers(a.scene_number, b.scene_number))

  const aggregates = new Map<string, SceneSlateAggregate>(
    aggRows.map((r) => {
      const lastDate = (r.last_date as string | null) ?? null
      return [
        r.scene_id as string,
        {
          slates: num(r.slates),
          takes: num(r.takes),
          prints: num(r.prints),
          lastShootDate: lastDate,
          lastDayNumber: lastDate ? dayNumberByDate.get(lastDate) ?? null : null,
        },
      ]
    })
  )

  const marks = new Map<string, SceneProgressMark>(
    markRows.map((r) => [
      r.scene_id as string,
      {
        marked_status: (r.marked_status as SceneMarkedStatus | null) ?? null,
        completed_shoot_day_id: (r.completed_shoot_day_id as string | null) ?? null,
        credited_eighths: numOrNull(r.credited_eighths),
        notes: (r.notes as string | null) ?? null,
      },
    ])
  )

  const rows = buildSceneProgressRows(scenes, aggregates, marks)

  const scheduledByDay = new Map<string, number>()
  for (const r of scheduledRows) {
    const day = r.shoot_day_id as string
    scheduledByDay.set(day, (scheduledByDay.get(day) ?? 0) + Math.max(0, num(r.page_eighths)))
  }
  const completedByDay = new Map<string, number>()
  for (const r of rows) {
    if (r.status === 'complete' && r.completedShootDayId) {
      completedByDay.set(r.completedShootDayId, (completedByDay.get(r.completedShootDayId) ?? 0) + r.totalEighths)
    }
  }
  const countsByDay = new Map(dayCountRows.map((r) => [r.shoot_day_id as string, r]))

  const days: DayProgress[] = dayRows.map((d) => {
    const id = d.id as string
    const counts = countsByDay.get(id)
    return {
      shootDayId: id,
      shootDate: d.shoot_date as string,
      dayNumber: numOrNull(d.day_number),
      scheduledEighths: scheduledByDay.get(id) ?? 0,
      completedEighths: completedByDay.get(id) ?? 0,
      slates: counts ? num(counts.slates) : 0,
      takes: counts ? num(counts.takes) : 0,
    }
  })

  return { rows, totals: summariseProgress(rows), days }
}
