import { createContext, type CSSProperties } from 'react'
import type { Person } from '@/lib/db/types'
import type { BookingSpan } from '@/features/people/lib/bookingSpans'
import type { BookingColorConfig } from '@/features/people/lib/bookingCalendarColors'

/** Booking id → unit name, for bookings called to one unit of a multi-unit day. */
export const BookingUnitNamesContext = createContext<ReadonlyMap<string, string>>(new Map())

/** Attribute that marks a day cell/column, so a drag can find the date under the pointer. */
export const BOOKING_DATE_ATTR = 'data-booking-date'

export function spanKeyOf(span: BookingSpan): string {
  return `${span.personId}|${span.startDate}|${span.endDate}`
}

export function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('default', {
      day: 'numeric',
      month: 'short',
    })
  }
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`
}

/** Principal cast first, then supporting cast, then crew; used to decide who gets the visible lanes. */
export function personPriority(person: Person | undefined, config: BookingColorConfig): number {
  if (!person) return 2
  if (person.is_cast === 1) return person.id in config.principalCastColors ? 0 : 1
  return 2
}

/** Finds the date of the day cell or column under a screen point, looking through any pills on top. */
export function bookingDateAtPoint(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const date = el.getAttribute(BOOKING_DATE_ATTR)
    if (date) return date
  }
  return null
}

/** Sets the colour-coding variables that the theme styles (see `booking-pill` in themes/shared.css). */
export function pillColorStyle(color: string, textColor: string): CSSProperties {
  return { '--pill-color': color, '--pill-text': textColor } as CSSProperties
}
