/**
 * Marked-up (lined) script layout (SS6). Pure: turns script elements and tramlines into lanes and rows
 * for rendering.
 *
 * - Lanes are tramlines in shot order (slate creation time), then camera — the way a script supervisor
 *   draws them left to right through the day.
 * - Each element inside a tramline's run is on camera unless a segment marks it off camera or not covered.
 * - Coverage per element counts tramlines on or off camera (a gap does not count); headings are not counted.
 * - A page break is flagged where the page number changes, so lines visibly continue onto the next page.
 */
import type { SlateShotType } from '@/lib/db/types'
import { formatTramlineLabel } from './slateNumbering'
import type { ScriptElementType } from './scriptElements'

export type LiningElement = {
  id: string
  scene_id: string | null
  sort_index: number
  element_type: ScriptElementType
  character_name: string | null
  text: string
  page_number: string | null
}

export type SegmentState = 'off' | 'not_covered'

export type LiningTramline = {
  id: string
  slateId: string
  slateLabel: string
  slateCreatedAt: string
  shotType: SlateShotType | null
  shotCode: string | null
  description: string | null
  camera: string
  printTakeNumbers: number[]
  startSortIndex: number
  endSortIndex: number
  /** Overrides by element id; elements in the run without one are on camera. */
  segments: ReadonlyMap<string, SegmentState>
}

export type CellState = 'on' | 'off' | 'not_covered'

export type LiningCell = { state: CellState | null; isStart: boolean; isEnd: boolean }

export type LiningColumn = {
  tramlineId: string
  slateId: string
  label: string
  shotType: SlateShotType | null
  camera: string
}

export type LiningRow = {
  element: LiningElement
  pageBreakBefore: boolean
  /** Tramlines covering this element (on or off camera); null for scene headings. */
  coverage: number | null
  cells: LiningCell[]
}

export type LinedScriptLayout = { columns: LiningColumn[]; rows: LiningRow[] }

export function tramlineLabel(t: Pick<LiningTramline, 'slateLabel' | 'printTakeNumbers' | 'shotCode' | 'description' | 'camera'>): string {
  const base = formatTramlineLabel({
    slateLabel: t.slateLabel,
    printTakeNumbers: t.printTakeNumbers,
    shotCode: t.shotCode,
    description: t.description,
  })
  return t.camera ? `${base} (${t.camera})` : base
}

export function layoutLinedScript(elements: readonly LiningElement[], tramlines: readonly LiningTramline[]): LinedScriptLayout {
  const ordered = [...elements].sort((a, b) => a.sort_index - b.sort_index)
  const lanes = [...tramlines].sort(
    (a, b) => a.slateCreatedAt.localeCompare(b.slateCreatedAt) || a.camera.localeCompare(b.camera) || a.id.localeCompare(b.id)
  )

  const columns: LiningColumn[] = lanes.map((t) => ({
    tramlineId: t.id,
    slateId: t.slateId,
    label: tramlineLabel(t),
    shotType: t.shotType,
    camera: t.camera,
  }))

  const rows: LiningRow[] = ordered.map((element, i) => {
    let coverage = 0
    const cells: LiningCell[] = lanes.map((t) => {
      const inRun = element.sort_index >= t.startSortIndex && element.sort_index <= t.endSortIndex
      if (!inRun) return { state: null, isStart: false, isEnd: false }
      const state: CellState = t.segments.get(element.id) ?? 'on'
      if (state !== 'not_covered') coverage += 1
      return { state, isStart: element.sort_index === t.startSortIndex, isEnd: element.sort_index === t.endSortIndex }
    })
    const prev = ordered[i - 1]
    return {
      element,
      pageBreakBefore: !!prev && (prev.page_number ?? '') !== (element.page_number ?? ''),
      coverage: element.element_type === 'scene_heading' ? null : coverage,
      cells,
    }
  })

  return { columns, rows }
}

/** Elements with fewer than two tramlines (the "at least two lines" rule); headings ignored. */
export function underCoveredElements(layout: LinedScriptLayout): LiningElement[] {
  return layout.rows.filter((r) => r.coverage != null && r.coverage < 2).map((r) => r.element)
}
