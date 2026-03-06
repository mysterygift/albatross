import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'

export type PersonBookingsSummary = {
  booked_days_count: number
  start_date: string | null
  end_date: string | null
}

export async function getPersonBookingsSummary(
  productionId: string,
  personId: string
): Promise<PersonBookingsSummary> {
  const [bookings, shootDays] = await Promise.all([
    listBookingsByProduction(productionId),
    listShootDaysByProduction(productionId),
  ])
  const shootDayIdToDate = new Map<string, string>()
  for (const d of shootDays) shootDayIdToDate.set(d.id, d.shoot_date)

  const dates = new Set<string>()
  for (const b of bookings) {
    if (b.person_id !== personId) continue
    if (!b.shoot_day_id) continue
    const date = shootDayIdToDate.get(b.shoot_day_id)
    if (date) dates.add(date)
  }
  const list = Array.from(dates).sort()
  return {
    booked_days_count: list.length,
    start_date: list[0] ?? null,
    end_date: list[list.length - 1] ?? null,
  }
}

