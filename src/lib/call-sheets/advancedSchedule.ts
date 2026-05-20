import type { Episode, Location, Person, Scene, ShootDay, ShootDayUnit, Shot, StripboardStrip } from '@/lib/db/types'
import { resolveSceneIdForStrip } from '@/lib/schedule/episodicScheduleDisplay'
import type { CallSheetAdvancedDay, CallSheetStrip } from '@/lib/pdf/callSheet'
import { enrichCallSheetStripEpisodeLabel } from '@/lib/call-sheets/callSheetEpisodic'
import {
  buildCallSheetStripFromStripboard,
  castPersonIdsForStrip,
  resolveSceneAndShotForStripboardStrip,
  type BuildScheduleStripContext,
} from '@/lib/call-sheets/scheduleStripRow'

export type BuildAdvancedScheduleInput = {
  currentShootDate: string
  shootDays: ShootDay[]
  currentUnitId: string | null
  allStrips: StripboardStrip[]
  allShootDayUnits: ShootDayUnit[]
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
  castBySceneId: Map<string, string[]>
  castByShotId: Map<string, string[]>
  castPeople: Person[]
  maxDays?: number
  /** When set with `episodeById`, SCENE/SHOT rows get `episodeLabel` for the EP column. */
  includeEpisodesInSchedule?: boolean
  episodeById?: Map<string, Pick<Episode, 'name'>>
}

function locationSummaryForStrips(
  strips: StripboardStrip[],
  scenes: Scene[],
  shots: Shot[],
  locations: Location[],
): string | null {
  const shotById = new Map(shots.map((h) => [h.id, h]))
  const locIds = new Set<string>()
  for (const s of strips) {
    const sceneId = resolveSceneIdForStrip(s, shotById)
    if (!sceneId) continue
    const sc = scenes.find((c) => c.id === sceneId)
    if (sc?.location_id) locIds.add(sc.location_id)
  }
  if (locIds.size === 0) return null
  const names = [...locIds]
    .map((id) => locations.find((l) => l.id === id)?.name?.trim())
    .filter((n): n is string => !!n)
  const uniq = [...new Set(names)]
  if (uniq.length === 0) return null
  const joined = uniq.join(', ')
  return joined.length > 72 ? `${joined.slice(0, 69)}…` : joined
}

/**
 * Next 1–2 shoot days after `currentShootDate`, same stripboard unit when possible.
 */
export function buildAdvancedScheduleForCallSheet(input: BuildAdvancedScheduleInput): CallSheetAdvancedDay[] {
  const maxDays = input.maxDays ?? 2
  const future = input.shootDays
    .filter((d) => d.shoot_date.localeCompare(input.currentShootDate) > 0)
    .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
    .slice(0, maxDays)

  if (future.length === 0) return []

  const shotById = new Map(input.shots.map((h) => [h.id, h]))
  const sceneById = new Map(input.scenes.map((sc) => [sc.id, sc]))
  const episodeById = input.episodeById
  const includeEp = input.includeEpisodesInSchedule === true && episodeById != null

  const ctx: BuildScheduleStripContext = {
    castBySceneId: input.castBySceneId,
    castByShotId: input.castByShotId,
    castPeople: input.castPeople,
  }

  const out: CallSheetAdvancedDay[] = []

  for (const day of future) {
    const unitsOnDay = input.allShootDayUnits.filter((u) => u.shoot_day_id === day.id)
    if (unitsOnDay.length === 0) continue

    const matchUnit =
      input.currentUnitId != null
        ? unitsOnDay.find((u) => u.unit_id === input.currentUnitId)
        : undefined
    const pick = matchUnit ?? unitsOnDay[0]!

    const unitStrips = input.allStrips
      .filter(
        (s) =>
          s.shoot_day_id === day.id &&
          s.shoot_day_unit_id === pick.id &&
          s.strip_status === 'SCHEDULED',
      )
      .sort((a, b) => a.sort_index - b.sort_index)

    if (unitStrips.length === 0) continue

    const locState = { lastLocationId: null as string | null }
    const strips: CallSheetStrip[] = unitStrips.map((s) => {
      const { scene, shot } = resolveSceneAndShotForStripboardStrip(
        s,
        input.scenes,
        input.shots,
        sceneById,
      )
      const locName =
        scene?.location_id != null
          ? (input.locations.find((l) => l.id === scene.location_id)?.name ?? null)
          : null
      const castIds = castPersonIdsForStrip(s, shot?.scene_id ?? scene?.id ?? null, ctx)
      const row = buildCallSheetStripFromStripboard(s, scene, shot, locName, locState, castIds, input.castPeople)
      if (!includeEp || !episodeById) return row
      const ep = enrichCallSheetStripEpisodeLabel({
        strip: s,
        shotById,
        sceneById,
        episodeById,
        includeEpisodes: true,
      })
      return { ...row, ...ep }
    })

    out.push({
      shootDate: day.shoot_date,
      dayNumber: day.day_number ?? null,
      callTime: day.call_time ?? null,
      parkingBaseAddress: day.parking_base_address ?? null,
      locationSummary: locationSummaryForStrips(unitStrips, input.scenes, input.shots, input.locations),
      strips,
    })
  }

  return out
}
