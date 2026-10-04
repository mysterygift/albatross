/**
 * Pure helpers for the Script Supervisor slate panel (SS3).
 */
import type { ShootDay, Slate, Take, TakeNgReason, TakeStatus } from '@/lib/db/types'

/**
 * Fields a new slate inherits from the previous one on the same day: camera setup and rolls usually
 * stay put between setups, while what the shot is (type, code, description) is new each time.
 */
export const CARRY_OVER_KEYS = [
  'unit_id',
  'camera',
  'lens',
  'stop',
  'filter',
  'sound_mode',
  'int_ext',
  'day_night',
  'camera_roll',
  'sound_roll',
] as const

export type CarriedOverFields = Partial<Pick<Slate, (typeof CARRY_OVER_KEYS)[number]>>

export function carryOverFields(previous: Slate | null | undefined): CarriedOverFields {
  if (!previous) return {}
  const out: Record<string, unknown> = {}
  for (const key of CARRY_OVER_KEYS) {
    const value = previous[key]
    if (value != null && value !== '') out[key] = value
  }
  return out as CarriedOverFields
}

/** Most recently created live slate, or null. */
export function latestSlate(slates: readonly Slate[]): Slate | null {
  let latest: Slate | null = null
  for (const s of slates) {
    if (!latest || s.created_at > latest.created_at) latest = s
  }
  return latest
}

/** Day to open by default: today's shoot day if there is one, else the latest past day, else the first. */
export function pickDefaultShootDay(days: readonly ShootDay[], todayIso: string): ShootDay | null {
  if (days.length === 0) return null
  const sorted = [...days].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
  const today = sorted.find((d) => d.shoot_date === todayIso)
  if (today) return today
  const past = sorted.filter((d) => d.shoot_date < todayIso)
  return past.length > 0 ? past[past.length - 1]! : sorted[0]!
}

/** Stopwatch / take duration as m:ss (or h:mm:ss past an hour). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export const TAKE_STATUS_LABEL: Record<TakeStatus, string> = {
  pending: 'Unmarked',
  print: 'Print',
  hold: 'Hold',
  ng: 'NG',
  incomplete: 'Incomplete',
}

export const NG_REASON_LABEL: Record<TakeNgReason, string> = {
  performance: 'Performance',
  focus: 'Focus',
  sound: 'Sound',
  camera: 'Camera',
  continuity: 'Continuity',
  other: 'Other',
}

/** The take a Print / Hold / NG button acts on: the selected one, else the latest take on the slate. */
export function takeToMark(takes: readonly Take[], selectedTakeId: string | null): Take | null {
  if (selectedTakeId) {
    const selected = takes.find((t) => t.id === selectedTakeId)
    if (selected) return selected
  }
  let latest: Take | null = null
  for (const t of takes) {
    if (!latest || t.take_number > latest.take_number) latest = t
  }
  return latest
}

/** Printed take numbers for a slate, ascending (feeds tramline labels later). */
export function printedTakeNumbers(takes: readonly Take[]): number[] {
  return takes.filter((t) => t.status === 'print').map((t) => t.take_number).sort((a, b) => a - b)
}

/** True when a key event came from a text field, so single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
  const el = target as HTMLElement
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}
