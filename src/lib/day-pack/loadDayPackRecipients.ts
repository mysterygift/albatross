/**
 * Who receives a day pack: the cast and crew the unit's call sheet lists. Cast come from the
 * unit's scheduled scenes and shots (and must be booked on the day); crew are those booked to this
 * unit or to the whole day.
 */
import { getCallSheetCastRequirements } from '@/lib/call-sheets/castRequirements'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import { buildDayRecipients, type DayRecipient } from '@/lib/call-sheets/recipients'
import { listBookingsByShootDay } from '@/lib/db/repositories/booking'
import { listCrew } from '@/lib/db/repositories/person'
import { getEffectiveCrewHierarchyOrDefault } from '@/lib/people/crewHierarchyResolver'
import type { ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'

export type DayPackRecipient = DayRecipient & {
  /** `all`: booked for the whole day rather than to this unit (worth checking on multi-unit days). */
  bookedFor: 'unit' | 'all'
}

export async function loadDayPackRecipients(args: {
  sched: ScheduleExportSources
  shootDayId: string
  shootDayUnitId: string
}): Promise<DayPackRecipient[]> {
  const { sched, shootDayId, shootDayUnitId } = args
  const [bookings, crew, hierarchy] = await Promise.all([
    listBookingsByShootDay(shootDayId),
    listCrew(sched.productionId),
    getEffectiveCrewHierarchyOrDefault(sched.productionId),
  ])
  const unitStrips = sched.strips.filter(
    (s) => s.shoot_day_id === shootDayId && s.shoot_day_unit_id === shootDayUnitId
  )
  const castResult = getCallSheetCastRequirements({
    sceneIdsScheduled: unitStrips.filter((s) => s.scene_id).map((s) => s.scene_id!),
    shotIdsScheduled: unitStrips.filter((s) => s.shot_id).map((s) => s.shot_id!),
    castBySceneId: sched.castBySceneId,
    castByShotId: sched.castByShotId,
    bookedPersonIds: new Set(bookings.map((b) => b.person_id)),
    cast: sched.cast,
  })
  const crewGroups = getCallSheetCrewRequirements(hierarchy, bookings, crew, shootDayUnitId)
  const bookedToUnit = new Set(
    bookings.filter((b) => b.shoot_day_unit_id === shootDayUnitId).map((b) => b.person_id)
  )
  return buildDayRecipients(castResult.castRows, crewGroups).map((r) => ({
    ...r,
    bookedFor: bookedToUnit.has(r.personId) ? 'unit' : 'all',
  }))
}
