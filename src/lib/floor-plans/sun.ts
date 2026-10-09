/**
 * Where the sun is, worked out on this computer (NOAA solar position equations, good to well under
 * a degree), so the sun path works offline once a plan knows its coordinates. Times are wall-clock
 * minutes in the location's time zone.
 */

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export type SunPosition = {
  /** Compass bearing of the sun, degrees clockwise from north. */
  azimuth: number
  /** Degrees above the horizon (negative: below). */
  elevation: number
}

/** The sun's position at an instant, seen from `lat`/`lon`. */
export function solarPosition(instant: Date, lat: number, lon: number): SunPosition {
  const jd = instant.getTime() / 86400000 + 2440587.5
  const t = (jd - 2451545) / 36525
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const c =
    Math.sin(rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * m)) * 0.000289
  const omega = 125.04 - 1934.136 * t
  const appLong = l0 + c - 0.00569 - 0.00478 * Math.sin(rad(omega))
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega))
  const decl = Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong)))
  const y = Math.tan(rad(obliq / 2)) ** 2
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(l0)) -
        2 * e * Math.sin(rad(m)) +
        4 * e * y * Math.sin(rad(m)) * Math.cos(2 * rad(l0)) -
        0.5 * y * y * Math.sin(4 * rad(l0)) -
        1.25 * e * e * Math.sin(2 * rad(m))
    )
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() + instant.getUTCSeconds() / 60
  const trueSolar = (((utcMinutes + eqTime + 4 * lon) % 1440) + 1440) % 1440
  const hourAngle = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180
  const latR = rad(lat)
  const cosZenith = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(rad(hourAngle))
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)))
  const denom = Math.cos(latR) * Math.sin(zenith)
  let azimuth: number
  if (Math.abs(denom) < 1e-9) {
    azimuth = lat > 0 ? 180 : 0
  } else {
    const a = deg(Math.acos(Math.min(1, Math.max(-1, (Math.sin(latR) * Math.cos(zenith) - Math.sin(decl)) / denom))))
    azimuth = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360
  }
  return { azimuth, elevation: 90 - deg(zenith) }
}

/** Minutes the zone is ahead of UTC at `instant` (e.g. 60 for London in summer). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000)
}

/** The instant of `minutes` past midnight on `date` (`YYYY-MM-DD`) in `timeZone`. */
export function zonedTime(date: string, minutes: number, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number)
  const guess = Date.UTC(y!, mo! - 1, d!, 0, minutes)
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000
  // Recheck at the result so a clock change that day lands on the right side.
  return new Date(guess - zoneOffsetMinutes(new Date(first), timeZone) * 60000)
}

/** This computer's time zone, used when a plan's location has none. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export type SunDay = {
  /** Wall-clock minutes; null when the sun does not rise or set that day (polar day or night). */
  sunrise: number | null
  sunset: number | null
  at: (minutes: number) => SunPosition
}

const HORIZON = -0.833

/** Sunrise, sunset and the sun's position through the day at a place. */
export function sunDay(date: string, lat: number, lon: number, timeZone: string): SunDay {
  const at = (minutes: number) => solarPosition(zonedTime(date, minutes, timeZone), lat, lon)
  const crossing = (from: number, to: number, rising: boolean): number => {
    let lo = from
    let hi = to
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2
      const up = at(mid).elevation > HORIZON
      if (up === rising) hi = mid
      else lo = mid
    }
    return Math.round((lo + hi) / 2)
  }
  let sunrise: number | null = null
  let sunset: number | null = null
  let prev = at(0).elevation > HORIZON
  for (let m = 10; m <= 1440; m += 10) {
    const up = at(m).elevation > HORIZON
    if (up && !prev && sunrise == null) sunrise = crossing(m - 10, m, true)
    if (!up && prev && sunrise != null) sunset = crossing(m - 10, m, false)
    prev = up
  }
  return { sunrise, sunset, at }
}

/** `07:05` from minutes past midnight. */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** The sun for one day and time, as drawn round the edge of a plan. */
export type SunOverlay = {
  now: SunPosition & { label: string }
  /** From sunrise to sunset on the hour, labelled every three hours. */
  path: Array<SunPosition & { label: string | null }>
}

export function sunOverlay(day: SunDay, minutes: number): SunOverlay {
  const start = day.sunrise ?? 0
  const end = day.sunset ?? 1440
  const path: SunOverlay['path'] = []
  if (day.sunrise != null) path.push({ ...day.at(day.sunrise), label: null })
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
    path.push({ ...day.at(m), label: (m / 60) % 3 === 0 ? formatClock(m).slice(0, 2) : null })
  }
  if (day.sunset != null) path.push({ ...day.at(day.sunset), label: null })
  const now = day.at(minutes)
  return { now: { ...now, label: `${formatClock(minutes)} | ${Math.round(now.elevation)}°` }, path }
}
