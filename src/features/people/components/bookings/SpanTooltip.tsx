import type { Booking, Person } from '@/lib/db/types'
import type { BookingSpan } from '@/features/people/lib/bookingSpans'
import { formatDateRange } from './bookingViewShared'

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
      {representative?.role && <p className="text-muted-foreground">Role: {representative.role}</p>}
      {representative?.notes && <p className="text-muted-foreground">Notes: {representative.notes}</p>}
    </div>
  )
}
