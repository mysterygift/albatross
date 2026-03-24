const SCHEDULE_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Canonical schedule time parser.
 * Accepts strict 24h HH:MM and returns normalized value, otherwise null.
 */
export function normalizeScheduleTimeInput(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? ''
  if (!raw) return null
  const match = raw.match(SCHEDULE_TIME_RE)
  if (!match) return null
  return `${match[1]}:${match[2]}`
}
