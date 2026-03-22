/**
 * Derive compact call-sheet timing text from booking.start_date / end_date only when
 * the stored value implies a specific time (ISO datetime). Date-only values (YYYY-MM-DD)
 * are ignored so we do not fabricate call times.
 */

function isDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

function formatTimeLocal(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  if (m === 0) return `${h}`
  return `${h}:${m.toString().padStart(2, '0')}`
}

/**
 * Returns a short window like "7–18" or "7:30" when inputs are ISO datetimes; otherwise null.
 */
export function formatBookingTimeWindow(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = start?.trim() ?? ''
  const e = end?.trim() ?? ''
  if (!s && !e) return null
  if (s && isDateOnly(s) && (!e || isDateOnly(e))) return null
  const parts: string[] = []
  if (s && !isDateOnly(s)) {
    const ms = Date.parse(s)
    if (!Number.isNaN(ms)) parts.push(formatTimeLocal(new Date(ms)))
  }
  if (e && !isDateOnly(e)) {
    const ms = Date.parse(e)
    if (!Number.isNaN(ms)) parts.push(formatTimeLocal(new Date(ms)))
  }
  if (parts.length === 0) return null
  if (parts.length === 2) return `${parts[0]}–${parts[1]}`
  return parts[0] ?? null
}

/** Numeric sort key for ordering cast rows (earlier booking start first); Infinity when unknown. */
export function bookingStartSortKey(start: string | null | undefined): number {
  const s = start?.trim()
  if (!s || isDateOnly(s)) return Number.POSITIVE_INFINITY
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
}
