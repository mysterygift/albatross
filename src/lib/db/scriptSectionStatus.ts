/**
 * Script section status, derived rather than edited.
 *
 * A section moves through No coverage → Covered → Scheduled → Shot as its linked shots do. It
 * only advances to a stage once every linked shot has reached it; partial progress is reported
 * separately. Cut is the one stored state (`script_sections.status = 'omitted'`), and a scene
 * the script supervisor marks omitted counts as cut too.
 */
import { parseLeadingPageNumber } from './sidesBuilderService'

export type DerivedSectionStatus = 'no_coverage' | 'covered' | 'scheduled' | 'shot' | 'cut'

export type SectionShootDayRef = {
  id: string
  dayNumber: number | null
  shootDate: string
}

/** Where one linked shot stands. */
export type SectionShotProgress = {
  shotId: string
  shotNumber: string
  /** Shoot days the shot (or its whole scene) is scheduled on, earliest first. */
  shootDays: SectionShootDayRef[]
  /** Printed takes the script supervisor logged against the shot, e.g. "Slate 41 T3". */
  printedTakes: string[]
  /** The script supervisor marked the shot's scene complete. */
  sceneComplete: boolean
}

export function isShotConfirmed(shot: SectionShotProgress): boolean {
  return shot.printedTakes.length > 0 || shot.sceneComplete
}

export function deriveSectionStatus(input: {
  cut: boolean
  shots: readonly SectionShotProgress[]
}): DerivedSectionStatus {
  if (input.cut) return 'cut'
  const { shots } = input
  if (shots.length === 0) return 'no_coverage'
  if (shots.every(isShotConfirmed)) return 'shot'
  if (shots.every((s) => s.shootDays.length > 0 || isShotConfirmed(s))) return 'scheduled'
  return 'covered'
}

export const SECTION_STATUS_NAME: Record<DerivedSectionStatus, string> = {
  no_coverage: 'No coverage',
  covered: 'Covered',
  scheduled: 'Scheduled',
  shot: 'Shot',
  cut: 'Cut',
}

export function formatShootDay(day: SectionShootDayRef): string {
  return day.dayNumber != null ? `Day ${day.dayNumber}` : day.shootDate
}

function uniqueDays(days: SectionShootDayRef[]): SectionShootDayRef[] {
  const seen = new Map<string, SectionShootDayRef>()
  for (const d of days) if (!seen.has(d.id)) seen.set(d.id, d)
  return [...seen.values()].sort((a, b) => a.shootDate.localeCompare(b.shootDate))
}

/** Badge text, e.g. "Covered · 2 shots", "Scheduled · Day 6", "Shot · Day 4". */
export function sectionStatusLabel(status: DerivedSectionStatus, shots: readonly SectionShotProgress[]): string {
  if (status === 'covered') return `Covered · ${shots.length} shot${shots.length === 1 ? '' : 's'}`
  if (status === 'scheduled') {
    const pending = shots.filter((s) => !isShotConfirmed(s)).flatMap((s) => s.shootDays.slice(0, 1))
    const days = uniqueDays(pending)
    return days.length ? `Scheduled · ${days.map(formatShootDay).join(', ')}` : 'Scheduled'
  }
  if (status === 'shot') {
    const days = uniqueDays(shots.flatMap((s) => s.shootDays.slice(0, 1)))
    return days.length ? `Shot · ${days.map(formatShootDay).join(', ')}` : 'Shot'
  }
  return SECTION_STATUS_NAME[status]
}

export type SectionStatusStep = {
  key: 'covered' | 'scheduled' | 'shot'
  name: string
  state: 'done' | 'partial' | 'todo'
  detail: string
}

const list = (shots: readonly SectionShotProgress[]) => shots.map((s) => s.shotNumber).join(', ')

/** The three progress steps with a plain-language reason for each. */
export function sectionStatusSteps(shots: readonly SectionShotProgress[]): SectionStatusStep[] {
  const n = shots.length
  const scheduled = shots.filter((s) => s.shootDays.length > 0 || isShotConfirmed(s))
  const confirmed = shots.filter(isShotConfirmed)
  const unscheduled = shots.filter((s) => !scheduled.includes(s))
  const unconfirmed = shots.filter((s) => !isShotConfirmed(s))
  const progress = (done: number): SectionStatusStep['state'] =>
    n > 0 && done === n ? 'done' : done > 0 ? 'partial' : 'todo'

  const days = uniqueDays(scheduled.flatMap((s) => s.shootDays))
  return [
    {
      key: 'covered',
      name: 'Covered',
      state: n > 0 ? 'done' : 'todo',
      detail: n > 0 ? `${n} shot${n === 1 ? '' : 's'} linked: ${list(shots)}` : 'No shots linked yet. Link them from the Shot List.',
    },
    {
      key: 'scheduled',
      name: 'Scheduled',
      state: progress(scheduled.length),
      detail:
        n === 0
          ? 'Needs a linked shot first.'
          : scheduled.length === n
            ? days.length
              ? `On ${days.map((d) => `${formatShootDay(d)} · ${d.shootDate}`).join(', ')}`
              : 'Every linked shot is scheduled.'
            : scheduled.length > 0
              ? `${scheduled.length} of ${n} on a shoot day. ${list(unscheduled)} not scheduled.`
              : 'No linked shot is on a shoot day yet.',
    },
    {
      key: 'shot',
      name: 'Shot',
      state: progress(confirmed.length),
      detail:
        n === 0
          ? 'Confirmed on the Script Supervisor page.'
          : confirmed.length === n
            ? `Confirmed by the script supervisor: ${confirmed
                .map((s) => (s.printedTakes.length ? `${s.shotNumber} (${s.printedTakes[0]})` : `${s.shotNumber} (scene complete)`))
                .join(', ')}`
            : confirmed.length > 0
              ? `${confirmed.length} of ${n} confirmed. Waiting on ${list(unconfirmed)}.`
              : 'Not confirmed by the script supervisor yet.',
    },
  ]
}

// ─── Section codes ──────────────────────────────────────────────────────────

type CodeRange = {
  start_page: string | null
  start_eighth: number | null
  start_offset: number | null
}

/**
 * Short per-scene codes ("12.1", "12.2", …) numbered in script order. Sections are ordered by
 * their first range (page, then eighth, then text offset); sections without a range go last in
 * creation order. Codes are computed, so they follow the script rather than being stored.
 */
export function buildSectionCodes(
  sections: ReadonlyArray<{ id: string; scene_id: string; script_version_id: string; created_at: string }>,
  firstRangeBySectionId: ReadonlyMap<string, CodeRange | undefined>,
  sceneNumberById: ReadonlyMap<string, string>
): Map<string, string> {
  const groups = new Map<string, typeof sections[number][]>()
  for (const s of sections) {
    const key = `${s.script_version_id}|${s.scene_id}`
    const group = groups.get(key) ?? []
    group.push(s)
    groups.set(key, group)
  }
  const sortKey = (id: string): [number, number, number] => {
    const r = firstRangeBySectionId.get(id)
    const page = parseLeadingPageNumber(r?.start_page ?? null)
    if (!r || page == null) return [Number.POSITIVE_INFINITY, 0, 0]
    return [page, r.start_eighth ?? 0, r.start_offset ?? 0]
  }
  const codes = new Map<string, string>()
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const ka = sortKey(a.id)
      const kb = sortKey(b.id)
      for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!
      return a.created_at.localeCompare(b.created_at)
    })
    sorted.forEach((s, i) => {
      const scene = sceneNumberById.get(s.scene_id) ?? '?'
      codes.set(s.id, `${scene}.${i + 1}`)
    })
  }
  return codes
}
