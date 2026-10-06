/**
 * Line model for drawing script sections by highlighting script text.
 *
 * A scene's script pages are flattened into lines (one per text line, in page order). Each
 * section's ranges are resolved to the lines they cover, and a new selection is turned into a
 * plan: the selected lines go to the edited section, neighbours that overlapped the selection
 * give those lines up ("the most recent selection wins"), and lines the edited section no longer
 * covers are handed to the adjacent section. Pure functions only — no database access.
 *
 * Text offsets are the source of truth for a selection; eighths are derived from the same
 * line-snapped eighth spans used by section generation and are for display only.
 */
import { extractCharacterCues } from '@/lib/script-parser/common'
import type { ScriptSectionCharacterInput, ScriptSectionRangeInput } from './repositories/scriptSections'
import { enrichRangeWithPageOffsets, splitPageIntoEighths } from './scriptEighthSplitService'
import { parseLeadingPageNumber } from './sidesBuilderService'

export type LayoutPage = {
  id: string
  page_number: string | null
  page_index: number
  content: string | null
}

export type SceneLine = {
  /** Position in the flattened line list. */
  index: number
  pageId: string
  /** Page number as stored on ranges (falls back to the 1-based page index). */
  pageNumber: string
  /** Position of the line's page within the given pages. */
  pageOrder: number
  /** Zero-based line number within its page. */
  lineInPage: number
  text: string
  startOffset: number
  /** Exclusive; includes the trailing newline. */
  endOffset: number
  /** Eighth span (0–7) the line starts in. */
  startEighth: number
  /** Eighth boundary (1–8) the line's span ends at. */
  endEighth: number
}

export type RangeLike = {
  start_page?: string | null
  start_eighth?: number | null
  end_page?: string | null
  end_eighth?: number | null
  start_offset?: number | null
  end_offset?: number | null
}

/** Inclusive line-index run. */
export type LineRun = { from: number; to: number }

export function pageNumberOf(page: Pick<LayoutPage, 'page_number' | 'page_index'>): string {
  return page.page_number?.trim() ? page.page_number : String(page.page_index + 1)
}

/** Flattens pages (already in script order) into lines with offsets and eighth positions. */
export function buildSceneLines(pages: readonly LayoutPage[]): SceneLine[] {
  const lines: SceneLine[] = []
  pages.forEach((page, pageOrder) => {
    const content = page.content ?? ''
    const spans = splitPageIntoEighths(content)
    const rawLines = content.split(/\r?\n/)
    let offset = 0
    rawLines.forEach((text, lineInPage) => {
      const startOffset = offset
      // Matches splitPageIntoEighths' own line offsets so eighth spans line up.
      offset += text.length + (lineInPage < rawLines.length - 1 ? 1 : 0)
      const span =
        spans.find((s) => startOffset >= s.startOffset && startOffset < s.endOffset) ??
        (spans.length > 0 && startOffset < spans[0]!.startOffset ? spans[0] : spans[spans.length - 1])
      lines.push({
        index: lines.length,
        pageId: page.id,
        pageNumber: pageNumberOf(page),
        pageOrder,
        lineInPage,
        text,
        startOffset,
        endOffset: offset,
        startEighth: span?.startEighth ?? 0,
        endEighth: span?.endEighth ?? 1,
      })
    })
  })
  return lines
}

function findPageOrder(pages: readonly LayoutPage[], pageRef: string | null | undefined): number {
  if (!pageRef?.trim()) return -1
  const exact = pages.findIndex((p) => pageNumberOf(p) === pageRef)
  if (exact >= 0) return exact
  const numeric = parseLeadingPageNumber(pageRef)
  if (numeric == null) return -1
  return pages.findIndex((p) => parseLeadingPageNumber(pageNumberOf(p)) === numeric)
}

/** Line indexes a range covers. Ranges without text offsets are resolved from their eighths. */
export function linesForRange(
  lines: readonly SceneLine[],
  pages: readonly LayoutPage[],
  range: RangeLike
): number[] {
  const enriched = enrichRangeWithPageOffsets(range, [...pages], parseLeadingPageNumber)
  const startOrder = findPageOrder(pages, enriched.start_page)
  if (startOrder < 0) return []
  const endOrderRaw = findPageOrder(pages, enriched.end_page ?? enriched.start_page)
  const endOrder = endOrderRaw < 0 ? startOrder : endOrderRaw
  const startOffset = enriched.start_offset ?? 0
  const endOffset = enriched.end_offset ?? Number.POSITIVE_INFINITY
  const result: number[] = []
  for (const line of lines) {
    const afterStart =
      line.pageOrder > startOrder || (line.pageOrder === startOrder && line.startOffset >= startOffset)
    const beforeEnd =
      line.pageOrder < endOrder || (line.pageOrder === endOrder && line.startOffset < endOffset)
    if (afterStart && beforeEnd) result.push(line.index)
  }
  return result
}

/** Lines owned by each section, keyed by section id. Sections with no resolvable lines map to an empty set. */
export function computeLineOwners(
  lines: readonly SceneLine[],
  pages: readonly LayoutPage[],
  sections: ReadonlyArray<{ id: string; ranges: readonly RangeLike[] }>
): Map<string, Set<number>> {
  const owners = new Map<string, Set<number>>()
  for (const section of sections) {
    const set = new Set<number>()
    for (const range of section.ranges) for (const i of linesForRange(lines, pages, range)) set.add(i)
    owners.set(section.id, set)
  }
  return owners
}

/** Groups line indexes into contiguous inclusive runs, in order. */
export function toRuns(indexes: Iterable<number>): LineRun[] {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b)
  const runs: LineRun[] = []
  for (const i of sorted) {
    const last = runs[runs.length - 1]
    if (last && i === last.to + 1) last.to = i
    else runs.push({ from: i, to: i })
  }
  return runs
}

/** Range input (pages, eighths and exact text offsets) for an inclusive run of lines. */
export function rangeForRun(lines: readonly SceneLine[], run: LineRun): ScriptSectionRangeInput {
  const a = lines[run.from]!
  const b = lines[run.to]!
  return {
    start_page: a.pageNumber,
    start_eighth: a.startEighth,
    end_page: b.pageNumber,
    end_eighth: b.endEighth,
    start_offset: a.startOffset,
    end_offset: b.endOffset,
  }
}

/** Compact label for a run, e.g. "p14 2/8–4/8" or "p14 6/8 – p15 1/8". */
export function formatRun(lines: readonly SceneLine[], run: LineRun): string {
  const a = lines[run.from]!
  const b = lines[run.to]!
  if (a.pageId === b.pageId) return `p${a.pageNumber} ${a.startEighth}/8–${b.endEighth}/8`
  return `p${a.pageNumber} ${a.startEighth}/8 – p${b.pageNumber} ${b.endEighth}/8`
}

export function formatRuns(lines: readonly SceneLine[], runs: readonly LineRun[]): string {
  return runs.length ? runs.map((r) => formatRun(lines, r)).join(' + ') : '—'
}

/** Page length in eighths for a run, counting every eighth it touches. */
export function runEighths(lines: readonly SceneLine[], run: LineRun): number {
  const a = lines[run.from]!
  const b = lines[run.to]!
  return (b.pageOrder - a.pageOrder) * 8 + b.endEighth - a.startEighth
}

/** "3/8 pg", "1 2/8 pg", "2 pg". */
export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8)
  const rest = eighths % 8
  const value = whole ? (rest ? `${whole} ${rest}/8` : `${whole}`) : `${rest}/8`
  return `${value} pg`
}

/**
 * Characters cued in a run of lines. Keeps the person link of a matching existing character so
 * re-drawing a section never drops cast links.
 */
export function charactersForRun(
  lines: readonly SceneLine[],
  run: LineRun,
  existing: ReadonlyArray<{ person_id: string | null; character_name: string | null }> = []
): ScriptSectionCharacterInput[] {
  const text = lines
    .slice(run.from, run.to + 1)
    .map((l) => l.text)
    .join('\n')
  const personByName = new Map<string, string | null>()
  for (const c of existing) {
    if (c.character_name) personByName.set(c.character_name.trim().toUpperCase(), c.person_id)
  }
  return extractCharacterCues(text).map((name) => ({
    character_name: name,
    person_id: personByName.get(name.trim().toUpperCase()) ?? null,
  }))
}

// ─── Selection plan ─────────────────────────────────────────────────────────

export type SelectionEffect =
  /** A neighbour gives up the lines the selection took. */
  | { kind: 'trimmed'; sectionId: string; taken: LineRun[]; remaining: LineRun }
  /** A neighbour sat entirely inside the selection and is removed; its shots move to the edited section. */
  | { kind: 'removed'; sectionId: string }
  /** The selection fell inside a neighbour; the part after the selection becomes a new section. */
  | { kind: 'split'; sectionId: string; kept: LineRun; newParts: LineRun[] }
  /** A neighbour picks up lines the edited section let go of. */
  | { kind: 'received'; sectionId: string; given: LineRun; result: LineRun }
  /** Released lines with no section next to them. */
  | { kind: 'unsectioned'; lines: LineRun }

export type SelectionPlan = {
  selection: LineRun
  /** Neighbours whose single range changes (trimmed, kept part of a split, or grown). */
  updates: Array<{ sectionId: string; run: LineRun }>
  /** Neighbours swallowed by the selection. */
  removals: string[]
  /** New sections carved off a split neighbour (inherit its shot links). */
  splits: Array<{ sourceSectionId: string; run: LineRun }>
  effects: SelectionEffect[]
}

/**
 * Plans the effect of giving `selection` to `currentId` (null when creating a section).
 * `owners` maps every section in the scene (including the current one) to the lines it covers.
 * Pass `lines` so released lines can reach a neighbour across uncovered blank lines.
 */
export function planSelection(
  owners: ReadonlyMap<string, ReadonlySet<number>>,
  currentId: string | null,
  selection: LineRun,
  lines?: readonly SceneLine[]
): SelectionPlan {
  const inSelection = (i: number) => i >= selection.from && i <= selection.to
  const state = new Map<string, Set<number>>()
  for (const [id, set] of owners) if (id !== currentId) state.set(id, new Set(set))

  const effects: SelectionEffect[] = []
  const removals: string[] = []
  const splits: SelectionPlan['splits'] = []
  const changed = new Set<string>()

  for (const [id, set] of [...state]) {
    const taken = [...set].filter(inSelection)
    if (taken.length === 0) continue
    const remainingRuns = toRuns([...set].filter((i) => !inSelection(i)))
    if (remainingRuns.length === 0) {
      state.delete(id)
      removals.push(id)
      effects.push({ kind: 'removed', sectionId: id })
    } else if (remainingRuns.length === 1) {
      state.set(id, runToSet(remainingRuns[0]!))
      changed.add(id)
      effects.push({ kind: 'trimmed', sectionId: id, taken: toRuns(taken), remaining: remainingRuns[0]! })
    } else {
      const [kept, ...rest] = remainingRuns
      state.set(id, runToSet(kept!))
      changed.add(id)
      for (const run of rest) splits.push({ sourceSectionId: id, run })
      effects.push({ kind: 'split', sectionId: id, kept: kept!, newParts: rest })
    }
  }

  const ownerOf = (i: number) => [...state].find(([, set]) => set.has(i))?.[0]
  const previous = currentId ? owners.get(currentId) ?? new Set<number>() : new Set<number>()
  for (const run of toRuns([...previous].filter((i) => !inSelection(i)))) {
    const step = run.to < selection.from ? -1 : 1
    let neighbourLine = step < 0 ? run.from - 1 : run.to + 1
    // Step over blank lines that no section covers (generation skips blank-only eighths).
    while (lines && lines[neighbourLine] && !lines[neighbourLine]!.text.trim() && !ownerOf(neighbourLine)) {
      neighbourLine += step
    }
    const neighbourId = ownerOf(neighbourLine)
    if (!neighbourId) {
      effects.push({ kind: 'unsectioned', lines: run })
      continue
    }
    const set = state.get(neighbourId)!
    const [lo, hi] = step < 0 ? [neighbourLine, run.to] : [run.from, neighbourLine]
    for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) set.add(i)
    changed.add(neighbourId)
    const result = toRuns(set)[0]!
    effects.push({ kind: 'received', sectionId: neighbourId, given: run, result })
  }

  const updates = [...changed]
    .filter((id) => state.has(id))
    .map((id) => {
      const runs = toRuns(state.get(id)!)
      return { sectionId: id, run: { from: runs[0]!.from, to: runs[runs.length - 1]!.to } }
    })

  return { selection, updates, removals, splits, effects }
}

function runToSet(run: LineRun): Set<number> {
  const set = new Set<number>()
  for (let i = run.from; i <= run.to; i++) set.add(i)
  return set
}

/** First line of each eighth span (the boundaries the start can snap to). */
export function isEighthStart(lines: readonly SceneLine[], i: number): boolean {
  if (i <= 0) return true
  const prev = lines[i - 1]!
  const line = lines[i]!
  return prev.pageId !== line.pageId || prev.startEighth !== line.startEighth
}

/** Moves a selection edge to the previous/next eighth boundary, clamped to the line list. */
export function nudgeSelection(
  lines: readonly SceneLine[],
  selection: LineRun,
  edge: 'start' | 'end',
  direction: -1 | 1
): LineRun {
  const last = lines.length - 1
  if (edge === 'start') {
    let i = selection.from + direction
    while (i > 0 && i < last && !isEighthStart(lines, i)) i += direction
    const from = Math.max(0, Math.min(i, selection.to))
    return { from, to: selection.to }
  }
  // An end boundary is the line before an eighth start.
  let i = selection.to + direction
  while (i >= 0 && i < last && !isEighthStart(lines, i + 1)) i += direction
  const to = Math.min(last, Math.max(i, selection.from))
  return { from: selection.from, to }
}

// ─── Per-scene layouts ──────────────────────────────────────────────────────

export type SceneLayout<P extends LayoutPage = LayoutPage> = {
  /** The scene's pages in script order. */
  pages: P[]
  lines: SceneLine[]
  /** Lines covered by each section of the scene. */
  owners: Map<string, Set<number>>
}

/** Line layout and section ownership for every scene that has pages in the given set. */
export function buildSceneLayouts<P extends LayoutPage & { scene_id: string | null }>(
  pages: readonly P[],
  sections: ReadonlyArray<{ id: string; scene_id: string }>,
  rangesBySectionId: ReadonlyMap<string, readonly RangeLike[]>
): Map<string, SceneLayout<P>> {
  const pagesByScene = new Map<string, P[]>()
  for (const page of pages) {
    if (!page.scene_id) continue
    const list = pagesByScene.get(page.scene_id) ?? []
    list.push(page)
    pagesByScene.set(page.scene_id, list)
  }
  const layouts = new Map<string, SceneLayout<P>>()
  for (const [sceneId, scenePages] of pagesByScene) {
    scenePages.sort((a, b) => a.page_index - b.page_index)
    const lines = buildSceneLines(scenePages)
    const owners = computeLineOwners(
      lines,
      scenePages,
      sections
        .filter((s) => s.scene_id === sceneId)
        .map((s) => ({ id: s.id, ranges: rangesBySectionId.get(s.id) ?? [] }))
    )
    layouts.set(sceneId, { pages: scenePages, lines, owners })
  }
  return layouts
}
