import {
  formatEighths,
  formatRuns,
  runEighths,
  toRuns,
  type LineRun,
  type SceneLayout,
} from '@/lib/db/scriptSectionLayout'
import {
  buildSectionCodes,
  deriveSectionStatus,
  sectionStatusLabel,
  type DerivedSectionStatus,
  type SectionShotProgress,
} from '@/lib/db/scriptSectionStatus'
import type { ScriptSection, ScriptSectionCharacter, ScriptSectionRange } from '@/lib/db/types'

/** Everything a list row, detail panel or picker shows for one section. */
export type SectionView = {
  section: ScriptSection
  code: string
  status: DerivedSectionStatus
  statusLabel: string
  shots: SectionShotProgress[]
  /** Lines the section covers in its scene layout (empty when the range can't be resolved). */
  runs: LineRun[]
  rangeText: string
  lengthText: string | null
  /** Generated from the import and never redrawn, so its boundaries are an estimate. */
  estimated: boolean
  characters: string[]
}

export function buildSectionViews(input: {
  sections: readonly ScriptSection[]
  rangesBySectionId: ReadonlyMap<string, ScriptSectionRange[]>
  charactersBySectionId: ReadonlyMap<string, ScriptSectionCharacter[]>
  layoutBySceneId: ReadonlyMap<string, SceneLayout>
  shotsBySectionId: ReadonlyMap<string, SectionShotProgress[]>
  omittedSceneIds: ReadonlySet<string>
  sceneNumberById: ReadonlyMap<string, string>
}): Map<string, SectionView> {
  const { sections, rangesBySectionId, charactersBySectionId, layoutBySceneId, shotsBySectionId, omittedSceneIds } = input
  const codes = buildSectionCodes(
    sections,
    new Map(sections.map((s) => [s.id, rangesBySectionId.get(s.id)?.[0]])),
    input.sceneNumberById
  )
  const views = new Map<string, SectionView>()
  for (const section of sections) {
    const shots = shotsBySectionId.get(section.id) ?? []
    const status = deriveSectionStatus({
      cut: section.status === 'omitted' || omittedSceneIds.has(section.scene_id),
      shots,
    })
    const layout = layoutBySceneId.get(section.scene_id)
    const runs = layout ? toRuns(layout.owners.get(section.id) ?? []) : []
    const eighths = layout ? runs.reduce((n, r) => n + runEighths(layout.lines, r), 0) : 0
    views.set(section.id, {
      section,
      code: codes.get(section.id) ?? '—',
      status,
      statusLabel: sectionStatusLabel(status, shots),
      shots,
      runs,
      rangeText:
        layout && runs.length
          ? formatRuns(layout.lines, runs)
          : formatScriptSectionRange(rangesBySectionId.get(section.id)?.[0]),
      lengthText: runs.length ? formatEighths(eighths) : null,
      estimated: section.is_manual === 0 && section.ranges_user_edited === 0,
      characters: (charactersBySectionId.get(section.id) ?? [])
        .map((c) => c.character_name)
        .filter((n): n is string => !!n),
    })
  }
  return views
}

/** Owner of each line in a layout (first section wins where ranges overlap). */
export function ownerByLine(layout: SceneLayout): Map<number, string> {
  const map = new Map<number, string>()
  for (const [id, set] of layout.owners) for (const i of set) if (!map.has(i)) map.set(i, id)
  return map
}

/** Compact page/eighth label for a stored range (used when its lines can't be resolved). */
export function formatScriptSectionRange(range: ScriptSectionRange | undefined): string {
  if (!range) return '—'
  const part = (page: string | null, eighth: number | null) =>
    [page ? `p${page}` : null, eighth != null ? `${eighth}/8` : null].filter(Boolean).join(' ')
  const start = part(range.start_page, range.start_eighth)
  const end = part(range.end_page, range.end_eighth)
  if (!start && !end) return '—'
  if (!end || end === start) return start || '—'
  return `${start || '?'} – ${end}`
}
