/**
 * Pure shooting-progress derivation for the Script Supervisor review (SS4).
 *
 * Status per scene:
 * - omitted   — marked omitted by the script supervisor (excluded from totals)
 * - complete  — marked complete; credited in full on its completion day
 * - part_shot — has at least one live slate but is not marked complete
 * - not_shot  — no slates yet
 *
 * Pages are counted in eighths (8 = one page). A part-shot scene is credited with the script
 * supervisor's estimate (never more than the scene's length).
 */

export type SceneProgressStatus = 'not_shot' | 'part_shot' | 'complete' | 'omitted'

export type SceneMarkedStatus = 'complete' | 'omitted'

export type SceneSlateAggregate = {
  slates: number
  takes: number
  prints: number
  /** Latest shoot date (YYYY-MM-DD) with a slate on this scene. */
  lastShootDate: string | null
  lastDayNumber: number | null
}

export type SceneProgressMark = {
  marked_status: SceneMarkedStatus | null
  completed_shoot_day_id: string | null
  credited_eighths: number | null
  /** Screen time timed by the script supervisor, in seconds. */
  timed_seconds: number | null
  notes: string | null
}

export type SceneForProgress = {
  id: string
  scene_number: string
  title: string | null
  page_eighths: number | null
  episode_id: string | null
  /** Pre-timed estimate from the schedule, in minutes. */
  duration_minutes: number | null
}

export type SceneProgressRow = {
  scene: SceneForProgress
  status: SceneProgressStatus
  slates: number
  takes: number
  prints: number
  lastShootDate: string | null
  lastDayNumber: number | null
  /** Eighths credited as shot (0 for not shot / omitted). */
  shotEighths: number
  /** Scene length in eighths, 0 when unknown. */
  totalEighths: number
  completedShootDayId: string | null
  creditedEighths: number | null
  /** Timed screen time in seconds, when the script supervisor has timed the scene. */
  timedSeconds: number | null
  /** Pre-timed estimate in seconds (0 when unknown). */
  estimatedSeconds: number
  notes: string | null
}

/** Screen time to report for a scene: timed when known, else the estimate. */
export function sceneScreenSeconds(row: Pick<SceneProgressRow, 'timedSeconds' | 'estimatedSeconds'>): number {
  return row.timedSeconds != null ? row.timedSeconds : row.estimatedSeconds
}

export function deriveSceneStatus(slateCount: number, mark: SceneProgressMark | null | undefined): SceneProgressStatus {
  if (mark?.marked_status === 'omitted') return 'omitted'
  if (mark?.marked_status === 'complete') return 'complete'
  return slateCount > 0 ? 'part_shot' : 'not_shot'
}

export function deriveShotEighths(
  status: SceneProgressStatus,
  sceneEighths: number | null | undefined,
  creditedEighths: number | null | undefined
): number {
  const length = sceneEighths != null && sceneEighths > 0 ? sceneEighths : 0
  if (status === 'complete') return length
  if (status === 'part_shot') {
    const credit = creditedEighths != null && creditedEighths > 0 ? creditedEighths : 0
    return length > 0 ? Math.min(credit, length) : credit
  }
  return 0
}

export function buildSceneProgressRows(
  scenes: readonly SceneForProgress[],
  aggregates: ReadonlyMap<string, SceneSlateAggregate>,
  marks: ReadonlyMap<string, SceneProgressMark>
): SceneProgressRow[] {
  return scenes.map((scene) => {
    const agg = aggregates.get(scene.id)
    const mark = marks.get(scene.id) ?? null
    const status = deriveSceneStatus(agg?.slates ?? 0, mark)
    return {
      scene,
      status,
      slates: agg?.slates ?? 0,
      takes: agg?.takes ?? 0,
      prints: agg?.prints ?? 0,
      lastShootDate: agg?.lastShootDate ?? null,
      lastDayNumber: agg?.lastDayNumber ?? null,
      shotEighths: deriveShotEighths(status, scene.page_eighths, mark?.credited_eighths),
      totalEighths: scene.page_eighths != null && scene.page_eighths > 0 ? scene.page_eighths : 0,
      completedShootDayId: mark?.completed_shoot_day_id ?? null,
      creditedEighths: mark?.credited_eighths ?? null,
      timedSeconds: mark?.timed_seconds ?? null,
      estimatedSeconds:
        scene.duration_minutes != null && scene.duration_minutes > 0 ? Math.round(scene.duration_minutes * 60) : 0,
      notes: mark?.notes ?? null,
    }
  })
}

export type ProgressTotals = {
  /** Scenes still in the script (omitted excluded). */
  scenes: number
  complete: number
  partShot: number
  notShot: number
  omitted: number
  totalEighths: number
  shotEighths: number
  slates: number
  takes: number
}

export function summariseProgress(rows: readonly SceneProgressRow[]): ProgressTotals {
  const t: ProgressTotals = {
    scenes: 0, complete: 0, partShot: 0, notShot: 0, omitted: 0, totalEighths: 0, shotEighths: 0, slates: 0, takes: 0,
  }
  for (const r of rows) {
    t.slates += r.slates
    t.takes += r.takes
    if (r.status === 'omitted') {
      t.omitted += 1
      continue
    }
    t.scenes += 1
    t.totalEighths += r.totalEighths
    t.shotEighths += r.shotEighths
    if (r.status === 'complete') t.complete += 1
    else if (r.status === 'part_shot') t.partShot += 1
    else t.notShot += 1
  }
  return t
}

/** Page count from eighths, the way it is written on a breakdown: 11 → '1 3/8', 8 → '1', 3 → '3/8'. */
export function formatPageEighths(eighths: number | null | undefined): string {
  if (eighths == null || !Number.isFinite(eighths) || eighths <= 0) return '0'
  const whole = Math.floor(eighths / 8)
  const rest = Math.round(eighths % 8)
  if (rest === 0) return String(whole)
  return whole > 0 ? `${whole} ${rest}/8` : `${rest}/8`
}

export const SCENE_STATUS_LABEL: Record<SceneProgressStatus, string> = {
  not_shot: 'Not shot',
  part_shot: 'Part shot',
  complete: 'Complete',
  omitted: 'Omitted',
}

/** Screen time as m:ss (h:mm:ss past an hour). */
export function formatScreenTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Parses '1:35', '95' (seconds) or '1:02:05'; null when blank or invalid. */
export function parseScreenTime(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null
  const parts = raw.split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length > 1 && nums.slice(1).some((n) => n >= 60)) return null
  return nums.reduce((acc, n) => acc * 60 + n, 0)
}
