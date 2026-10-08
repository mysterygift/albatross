import type { Booking, Person } from '@/lib/db/types'
import type { BookingSpan } from '@/features/people/lib/bookingSpans'
import { useContext } from 'react'
import { UnitChip } from '@/features/risk-assessments/UnitChip'
import { BookingUnitNamesContext, formatDateRange } from './bookingViewShared'

export function SpanTooltip({
  span,
  person,
  representative,
}: {
  span: BookingSpan
  person: Person | undefined
  representative: Booking | undefined
}) {
  const days = span.shootDayIds.length
  const unitNamesByBookingId = useContext(BookingUnitNamesContext)
  const unitNames = [
    ...new Set(span.bookingIds.map((id) => unitNamesByBookingId.get(id)).filter((n): n is string => !!n)),
  ]
  const meta = [
    person?.is_cast === 1 ? 'Cast' : 'Crew',
    person?.department,
    person?.role_name,
  ].filter(Boolean)
  return (
    <div className="space-y-1 text-xs">
      <p className="font-semibold text-foreground">{person?.name ?? 'Unknown'}</p>
      <p className="text-muted-foreground">{meta.join(' | ')}</p>
      <p className="text-foreground">
        {formatDateRange(span.startDate, span.endDate)}
        <span className="text-muted-foreground"> | {days} {days === 1 ? 'day' : 'days'}</span>
      </p>
      {unitNames.length > 0 && (
        <p className="flex flex-wrap items-center gap-1">
          {unitNames.map((name) => (
            <UnitChip key={name} name={name} className="px-1.5 py-0 text-[11px]" />
          ))}
        </p>
      )}
      {representative?.role && <p className="text-muted-foreground">Role: {representative.role}</p>}
      {representative?.notes && <p className="text-muted-foreground">Notes: {representative.notes}</p>}
    </div>
  )
}
