/**
 * Shooting schedule export: stripboard strips → printable sections, one per shoot day + unit.
 * Pure: callers load the rows (the stripboard page from `useStripboard`, the day pack from the
 * repositories). Rows reuse the call sheet's strip pipeline so both documents read the same.
 */
import { enrichCallSheetStripEpisodeLabel } from '@/lib/call-sheets/callSheetEpisodic'
import {
  buildCallSheetStripFromStripboard,
  castPersonIdsForStrip,
  resolveSceneAndShotForStripboardStrip,
  type BuildScheduleStripContext,
} from '@/lib/call-sheets/scheduleStripRow'
import type {
  Episode,
  Location,
  Person,
  Scene,
  ShootDay,
  ShootDayUnit,
  Shot,
  StripboardStrip,
  Unit,
} from '@/lib/db/types'
import type { CallSheetStrip } from '@/lib/pdf/callSheet'
import { formatPageEighths } from '@/lib/script-supervisor/progress'
import { computeStripboardTotals, formatRuntime } from '@/lib/schedule/stripboardDayTotals'
import { sortStripsBySortIndex } from '@/lib/schedule/stripboardRows'
import { sortShootDayUnitsForDisplay } from '@/lib/schedule/unitKey'

export type ShootingScheduleSection = {
  shootDayId: string
  shootDayUnitId: string
  shootDate: string
  dayNumber: number | null
  unitName: string
  rows: CallSheetStrip[]
  /** e.g. `4 shots | 2 3/8 pages | est. 3h 20m`; null when the unit has no shots. */
  totalsLine: string | null
}

export type ShootingScheduleData = {
  productionName: string
  /** e.g. `Whole schedule` or `Day 3 | Main Unit`. */
  scopeLabel: string
  totalShootDays: number | null
  includeEpisodes: boolean
  sections: ShootingScheduleSection[]
}

export type ShootingScheduleInput = {
  productionName: string
  scopeLabel: string
  shootDays: ShootDay[]
  shootDayUnits: ShootDayUnit[]
  units: Unit[]
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  locations: Pick<Location, 'id' | 'name'>[]
  castPeople: Person[]
  castBySceneId: Map<string, string[]>
  castByShotId: Map<string, string[]>
  /** Episodic productions with episode labels switched on; adds the EP column. */
  includeEpisodes?: boolean
  episodes?: Pick<Episode, 'id' | 'name'>[]
  /** Limit to these shoot days (default: every day). */
  shootDayIds?: string[]
  /** Limit to one unit (default: every unit of each day). */
  shootDayUnitId?: string | null
}

/** Sections in date order, units in rank order (Main Unit first). Units with no strips are left out. */
export function buildShootingScheduleData(input: ShootingScheduleInput): ShootingScheduleData {
  const includeEpisodes = input.includeEpisodes === true
  const dayFilter = input.shootDayIds ? new Set(input.shootDayIds) : null
  const unitsById = new Map(input.units.map((u) => [u.id, u]))
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]))
  const shotById = new Map(input.shots.map((s) => [s.id, s]))
  const episodeById = new Map((input.episodes ?? []).map((e) => [e.id, e]))
  const locationNameById = new Map(input.locations.map((l) => [l.id, l.name]))
  const estimatedMinutesByShotId = new Map(
    input.shots.map((s) => [s.id, s.estimated_shoot_minutes ?? 0] as const)
  )
  const castCtx: BuildScheduleStripContext = {
    castBySceneId: input.castBySceneId,
    castByShotId: input.castByShotId,
    castPeople: input.castPeople,
  }

  const stripsByDayUnit = new Map<string, StripboardStrip[]>()
  for (const strip of input.strips) {
    if (strip.strip_status !== 'SCHEDULED' || !strip.shoot_day_id || !strip.shoot_day_unit_id) continue
    if (strip.deleted_at) continue
    const key = `${strip.shoot_day_id}:${strip.shoot_day_unit_id}`
    const list = stripsByDayUnit.get(key) ?? []
    list.push(strip)
    stripsByDayUnit.set(key, list)
  }

  const days = input.shootDays
    .filter((d) => !d.deleted_at && (!dayFilter || dayFilter.has(d.id)))
    .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))

  const sections: ShootingScheduleSection[] = []
  for (const day of days) {
    const dayUnits = sortShootDayUnitsForDisplay(
      input.shootDayUnits.filter(
        (sdu) =>
          sdu.shoot_day_id === day.id &&
          !sdu.deleted_at &&
          (!input.shootDayUnitId || sdu.id === input.shootDayUnitId)
      ),
      unitsById
    )
    for (const dayUnit of dayUnits) {
      const strips = sortStripsBySortIndex(stripsByDayUnit.get(`${day.id}:${dayUnit.id}`) ?? [])
      if (strips.length === 0) continue
      const locState = { lastLocationId: null as string | null }
      const rows = strips.map((strip) => {
        const { scene, shot } = resolveSceneAndShotForStripboardStrip(strip, input.scenes, input.shots, sceneById)
        const locationName = scene?.location_id ? (locationNameById.get(scene.location_id) ?? null) : null
        const castIds = castPersonIdsForStrip(strip, shot?.scene_id ?? scene?.id ?? null, castCtx)
        const row = buildCallSheetStripFromStripboard(
          strip,
          scene,
          shot,
          locationName,
          locState,
          castIds,
          input.castPeople,
          locationNameById
        )
        if (!includeEpisodes) return row
        return {
          ...row,
          ...enrichCallSheetStripEpisodeLabel({ strip, shotById, sceneById, episodeById, includeEpisodes }),
        }
      })
      const totals = computeStripboardTotals(strips, input.shots, input.scenes, estimatedMinutesByShotId)
      sections.push({
        shootDayId: day.id,
        shootDayUnitId: dayUnit.id,
        shootDate: day.shoot_date,
        dayNumber: day.day_number ?? null,
        unitName: unitsById.get(dayUnit.unit_id)?.name ?? 'Main Unit',
        rows,
        totalsLine:
          totals.shotCount > 0
            ? [
                `${totals.shotCount} ${totals.shotCount === 1 ? 'shot' : 'shots'}`,
                `${formatPageEighths(totals.totalEighths)} pages`,
                totals.runtimeMinutes > 0 ? `est. ${formatRuntime(totals.runtimeMinutes)}` : null,
              ]
                .filter(Boolean)
                .join(' | ')
            : null,
      })
    }
  }

  return {
    productionName: input.productionName,
    scopeLabel: input.scopeLabel,
    totalShootDays: input.shootDays.filter((d) => !d.deleted_at).length || null,
    includeEpisodes,
    sections,
  }
}

/** Shot ids scheduled on one shoot day + unit, in strip order (for shot list and storyboard exports). */
export function shotIdsInStripOrder(
  strips: StripboardStrip[],
  shootDayId: string,
  shootDayUnitId: string
): string[] {
  return sortStripsBySortIndex(
    strips.filter(
      (s) =>
        s.strip_status === 'SCHEDULED' &&
        !s.deleted_at &&
        s.shoot_day_id === shootDayId &&
        s.shoot_day_unit_id === shootDayUnitId &&
        s.strip_type === 'SHOT' &&
        !!s.shot_id
    )
  ).map((s) => s.shot_id!)
}
