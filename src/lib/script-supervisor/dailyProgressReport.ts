/**
 * Daily Progress Report (SS5): the script supervisor's end-of-day summary for production.
 *
 * Pure: builds report data from shooting progress, the day's actual times and its slates. Rendering is
 * in `src/lib/pdf/dailyProgressReport.ts`.
 *
 * Grid (UK DPR layout): Scenes, Pages, Minutes, Setups, Takes × Script, Previously, Today, To date, To do.
 * - Scenes / pages / minutes count when a scene is marked complete, on its completion day. Pages also include
 *   part-shot credits, counted on the day the scene was last shot.
 * - Minutes use timed screen time where the scene has been timed, else the schedule estimate (flagged).
 * - Setups and takes come from the slates logged on each day.
 */
import type { DayProgress } from '@/lib/db/scriptSupervisorProgressService'
import {
  SCENE_STATUS_LABEL,
  formatPageEighths,
  formatScreenTime,
  sceneScreenSeconds,
  type SceneProgressRow,
} from './progress'

export type DprDayLog = {
  call_time: string | null
  first_shot_time: string | null
  lunch_start_time: string | null
  lunch_end_time: string | null
  first_shot_after_lunch_time: string | null
  camera_wrap_time: string | null
  wrap_time: string | null
  remarks: string | null
}

export type DprInput = {
  productionName: string
  shootDayId: string
  shootDate: string
  dayNumber: number | null
  totalShootDays: number
  unitName?: string | null
  /** Planned times from the schedule, shown when no actual time was logged. */
  plannedCallTime: string | null
  plannedWrapTime: string | null
  dayLog: DprDayLog | null
  rows: SceneProgressRow[]
  days: DayProgress[]
  /** Scenes on this day's stripboard, in strip order. */
  scheduledSceneIds: string[]
  /** Wild tracks recorded today, already labelled (e.g. 'Slate 214 · Sc 23 · Room tone'). */
  wildTracks: string[]
  scriptSupervisorName?: string | null
}

export type DprGridRow = {
  label: 'Scenes' | 'Pages' | 'Minutes' | 'Setups' | 'Takes'
  script: string
  previously: string
  today: string
  toDate: string
  toDo: string
}

export type DprSceneLine = {
  sceneNumber: string
  title: string
  pages: string
  status: string
  scheduled: boolean
}

export type DprTimeLine = { label: string; value: string }

export type DailyProgressReportData = {
  productionName: string
  heading: string
  dateLabel: string
  unitName: string | null
  times: DprTimeLine[]
  grid: DprGridRow[]
  scenes: DprSceneLine[]
  completedToday: string[]
  wildTracks: string[]
  remarks: string | null
  footnotes: string[]
  scriptSupervisorName: string | null
}

function sum<T>(items: readonly T[], f: (t: T) => number): number {
  return items.reduce((acc, t) => acc + f(t), 0)
}

function time(actual: string | null | undefined, planned?: string | null): string {
  if (actual) return actual
  if (planned) return `${planned} (planned)`
  return '—'
}

export function buildDailyProgressReport(input: DprInput): DailyProgressReportData {
  const date = input.shootDate
  const dateByDayId = new Map(input.days.map((d) => [d.shootDayId, d.shootDate]))
  const live = input.rows.filter((r) => r.status !== 'omitted')

  const completedOn = (r: SceneProgressRow) => (r.completedShootDayId ? dateByDayId.get(r.completedShootDayId) ?? null : null)
  const completeToDate = live.filter((r) => r.status === 'complete' && (completedOn(r) ?? '') <= date && completedOn(r) != null)
  const completeToday = live.filter((r) => r.status === 'complete' && r.completedShootDayId === input.shootDayId)
  const partToDate = live.filter((r) => r.status === 'part_shot' && r.lastShootDate != null && r.lastShootDate <= date)

  // Scenes
  const scenesScript = live.length
  const scenesToDate = completeToDate.length
  const scenesToday = completeToday.length

  // Pages (eighths)
  const pagesScript = sum(live, (r) => r.totalEighths)
  // Part-shot credit counts on the day the scene was last shot.
  const pagesToday =
    sum(completeToday, (r) => r.totalEighths) + sum(partToDate.filter((r) => r.lastShootDate === date), (r) => r.shotEighths)
  const pagesToDate = sum(completeToDate, (r) => r.totalEighths) + sum(partToDate, (r) => r.shotEighths)

  // Minutes (seconds)
  const minutesScript = sum(live, (r) => r.estimatedSeconds)
  const minutesToday = sum(completeToday, sceneScreenSeconds)
  const minutesToDate = sum(completeToDate, sceneScreenSeconds)
  const untimed = completeToDate.filter((r) => r.timedSeconds == null)

  // Setups / takes
  const before = input.days.filter((d) => d.shootDate < date)
  const today = input.days.find((d) => d.shootDayId === input.shootDayId)
  const setupsPrev = sum(before, (d) => d.slates)
  const takesPrev = sum(before, (d) => d.takes)
  const setupsToday = today?.slates ?? 0
  const takesToday = today?.takes ?? 0

  const grid: DprGridRow[] = [
    {
      label: 'Scenes',
      script: String(scenesScript),
      previously: String(scenesToDate - scenesToday),
      today: String(scenesToday),
      toDate: String(scenesToDate),
      toDo: String(Math.max(0, scenesScript - scenesToDate)),
    },
    {
      label: 'Pages',
      script: formatPageEighths(pagesScript),
      previously: formatPageEighths(pagesToDate - pagesToday),
      today: formatPageEighths(pagesToday),
      toDate: formatPageEighths(pagesToDate),
      toDo: formatPageEighths(Math.max(0, pagesScript - pagesToDate)),
    },
    {
      label: 'Minutes',
      script: minutesScript > 0 ? formatScreenTime(minutesScript) : '—',
      previously: formatScreenTime(minutesToDate - minutesToday),
      today: formatScreenTime(minutesToday),
      toDate: formatScreenTime(minutesToDate),
      toDo: minutesScript > 0 ? formatScreenTime(Math.max(0, minutesScript - minutesToDate)) : '—',
    },
    {
      label: 'Setups',
      script: '—',
      previously: String(setupsPrev),
      today: String(setupsToday),
      toDate: String(setupsPrev + setupsToday),
      toDo: '—',
    },
    {
      label: 'Takes',
      script: '—',
      previously: String(takesPrev),
      today: String(takesToday),
      toDate: String(takesPrev + takesToday),
      toDo: '—',
    },
  ]

  const rowById = new Map(input.rows.map((r) => [r.scene.id, r]))
  const sceneIds = [...input.scheduledSceneIds]
  for (const r of completeToday) if (!sceneIds.includes(r.scene.id)) sceneIds.push(r.scene.id)
  const scenes: DprSceneLine[] = sceneIds
    .map((id) => rowById.get(id))
    .filter((r): r is SceneProgressRow => !!r)
    .map((r) => {
      let status: string = SCENE_STATUS_LABEL[r.status]
      if (r.status === 'complete') {
        status = r.completedShootDayId === input.shootDayId ? 'Completed today' : `Completed ${completedOn(r) ?? ''}`.trim()
      } else if (r.status === 'part_shot' && r.shotEighths > 0) {
        status = `Part shot (${formatPageEighths(r.shotEighths)} credited)`
      }
      return {
        sceneNumber: r.scene.scene_number,
        title: r.scene.title ?? '',
        pages: formatPageEighths(r.totalEighths),
        status,
        scheduled: input.scheduledSceneIds.includes(r.scene.id),
      }
    })

  const log = input.dayLog
  const lunch =
    log?.lunch_start_time || log?.lunch_end_time
      ? `${log?.lunch_start_time ?? '—'} – ${log?.lunch_end_time ?? '—'}`
      : '—'
  const times: DprTimeLine[] = [
    { label: 'Unit call', value: time(log?.call_time, input.plannedCallTime) },
    { label: 'First shot', value: time(log?.first_shot_time) },
    { label: 'Lunch', value: lunch },
    { label: 'First shot after lunch', value: time(log?.first_shot_after_lunch_time) },
    { label: 'Camera wrap', value: time(log?.camera_wrap_time) },
    { label: 'Unit wrap', value: time(log?.wrap_time, input.plannedWrapTime) },
  ]

  const footnotes: string[] = []
  if (untimed.length > 0) {
    footnotes.push(
      `Minutes use the schedule estimate for ${untimed.length} completed ${untimed.length === 1 ? 'scene' : 'scenes'} not yet timed.`
    )
  }
  if (partToDate.some((r) => r.shotEighths > 0)) {
    footnotes.push('Pages to date include part-shot credits.')
  }

  const dayPart = input.dayNumber != null ? `Day ${input.dayNumber} of ${input.totalShootDays}` : `Shoot day of ${input.totalShootDays}`
  return {
    productionName: input.productionName,
    heading: `Daily Progress Report · ${dayPart}`,
    dateLabel: input.shootDate,
    unitName: input.unitName ?? null,
    times,
    grid,
    scenes,
    completedToday: completeToday.map((r) => r.scene.scene_number),
    wildTracks: input.wildTracks,
    remarks: log?.remarks ?? null,
    footnotes,
    scriptSupervisorName: input.scriptSupervisorName ?? null,
  }
}

/** File name for the exported PDF, e.g. 'dpr-day-14-2026-10-07.pdf'. */
export function dailyProgressReportFileName(dayNumber: number | null, shootDate: string): string {
  return `dpr-${dayNumber != null ? `day-${dayNumber}-` : ''}${shootDate}.pdf`
}
