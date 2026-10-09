/**
 * Shared helpers for the Toothpick demo generator: deterministic ids, date maths and
 * astronomical sunrise/sunset (so call-sheet light times are computed, not invented).
 */
import { createHash } from 'node:crypto'

export type Row = Record<string, unknown>

/** Deterministic UUID (v5-shaped) from a seed string, so regenerating the file is reproducible. */
function uuidFromSeed(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16]!, 16) % 4]!
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** One namespace per generated project: re-running the generator reproduces the same ids. */
export function makeIdFactory(namespace = 'toothpick-demo/manchester'): (kind: string, key: string | number) => string {
  return (kind, key) => uuidFromSeed(`${namespace}/${kind}/${key}`)
}

// ─── Dates (YYYY-MM-DD, UTC arithmetic, no DST surprises) ────────────────────

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d! + days))
  return t.toISOString().slice(0, 10)
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000)
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Text ────────────────────────────────────────────────────────────────────

/** ASCII slug for e-mail local parts: "Tomasz Wójcik" → "tomasz.wojcik". */
export function emailLocal(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ł]/g, 'l')
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

export function fileSafe(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-')
}

// ─── Sunrise / sunset (NOAA "sunrise equation"), Europe/London local time ────

const RAD = Math.PI / 180

export function sunTimes(
  dateIso: string,
  lat = 53.4808, // Manchester
  lon = -2.2426
): { sunrise: string; sunset: string } {
  const [y, m, d] = dateIso.split('-').map(Number)
  const jdn = Date.UTC(y!, m! - 1, d!, 12) / 86_400_000 + 2440587.5 // Julian date at 12:00 UTC
  const n = Math.round(jdn - 2451545.0 + 0.0008)
  const jStar = n - lon / 360
  const M = (357.5291 + 0.98560028 * jStar) % 360
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD)
  const lambda = (M + C + 180 + 102.9372) % 360
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD)
  const sinDelta = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD)
  const cosDelta = Math.cos(Math.asin(sinDelta))
  const cosOmega = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDelta) / (Math.cos(lat * RAD) * cosDelta)
  const omega = Math.acos(Math.max(-1, Math.min(1, cosOmega))) / RAD
  const toLocal = (jd: number): string => {
    const ms = (jd - 2440587.5) * 86_400_000
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/London',
    }).format(new Date(ms))
  }
  return { sunrise: toLocal(jTransit - omega / 360), sunset: toLocal(jTransit + omega / 360) }
}
