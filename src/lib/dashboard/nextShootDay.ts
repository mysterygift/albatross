/**
 * Dashboard next shoot day — read-only helper for the "Next Shoot Day" card.
 * Aggregates shoot day, calendar event, strips, scenes, and shots for display.
 */
import { getNextShootDayForProduction, listScenesByProduction, listShotsByProduction } from '@/lib/db/repositories/schedule'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import { listStripsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import type { ShootDay, CalendarShootDayEvent, StripboardStrip, Scene, Shot } from '@/lib/db/types'

export type DashboardNextShootDayData = {
  shootDay: ShootDay
  /** Calendar events for that day (one per unit: Main, Second, etc.). */
  events: CalendarShootDayEvent[]
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
}

/**
 * Fetches all data needed for the Dashboard "Next Shoot Day" card.
 * Returns null if no upcoming shoot day exists.
 */
export async function getDashboardNextShootDayData(
  productionId: string
): Promise<DashboardNextShootDayData | null> {
  const shootDay = await getNextShootDayForProduction(productionId)
  if (!shootDay) return null

  const today = new Date().toISOString().slice(0, 10)
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + 180)
  const end = endDate.toISOString().slice(0, 10)

  const [events, strips, scenes, shots] = await Promise.all([
    listCalendarShootDayEvents(productionId, { start: today, end }),
    listStripsByShootDay(shootDay.id),
    listScenesByProduction(productionId),
    listShotsByProduction(productionId),
  ])

  const dayEvents = events.filter((e) => e.shootDayId === shootDay.id)

  return {
    shootDay,
    events: dayEvents,
    strips,
    scenes,
    shots,
  }
}
