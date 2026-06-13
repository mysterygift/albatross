import type { ScriptSectionRange } from './types'
import type { ScriptSectionRangeInput } from './repositories/scriptSections'
import { parseLeadingPageNumber } from './sidesBuilderService'

const EIGHTHS_PER_PAGE = 8

/** Converts a (numeric) page + eighth-in-page to a single cumulative-eighth coordinate. */
function toGlobalEighth(page: string | null, eighth: number | null): number | null {
  const p = parseLeadingPageNumber(page)
  if (p == null) return null
  return (p - 1) * EIGHTHS_PER_PAGE + (eighth ?? 0)
}

/** True when two page/eighth ranges overlap on the global-eighth axis. Null bounds never match. */
export function rangesOverlap(
  a: ScriptSectionRange | undefined,
  b: ScriptSectionRangeInput | ScriptSectionRange | undefined
): boolean {
  if (!a || !b) return false
  const aStart = toGlobalEighth(a.start_page, a.start_eighth)
  const aEnd = toGlobalEighth(a.end_page, a.end_eighth)
  const bStart = toGlobalEighth(b.start_page ?? null, b.start_eighth ?? null)
  const bEnd = toGlobalEighth(b.end_page ?? null, b.end_eighth ?? null)
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false
  return aStart < bEnd && bStart < aEnd
}

type RangeLike = {
  start_page?: string | null
  start_eighth?: number | null
  end_page?: string | null
  end_eighth?: number | null
}

/** Deterministic signature for a section's first page/eighth range. */
export function rangeSignature(range: RangeLike | undefined | null): string {
  if (!range) return ''
  return `${range.start_page ?? ''}/${range.start_eighth ?? ''}–${range.end_page ?? ''}/${range.end_eighth ?? ''}`
}

/** Normalize script text and produce a deterministic fingerprint (djb2-style hash). */
export function contentFingerprint(text: string | null | undefined): string | null {
  if (text == null || text.trim() === '') return null
  const normalized = text.replace(/\s+/g, ' ').trim()
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

export type CrossVersionSectionKeyInput = {
  sceneNumber: string
  sectionType: string
  label: string | null
  rangeSignature: string
}

/** Stable identity for cross-version section comparison (scene number, not scene id). */
export function crossVersionSectionKey(input: CrossVersionSectionKeyInput): string {
  return `${input.sceneNumber}|${input.sectionType}|${input.label ?? ''}|${input.rangeSignature}`
}

export type SectionPairClassification = 'exact' | 'changed' | 'no_match'

/** Classify an old/new pair that share a structural cross-version key. */
export function classifySectionPair(
  oldFingerprint: string | null,
  newFingerprint: string | null
): SectionPairClassification {
  if (oldFingerprint == null && newFingerprint == null) return 'exact'
  if (oldFingerprint === newFingerprint) return 'exact'
  return 'changed'
}

/** Within-version signature (scene id + type + label) used by regeneration. */
export function sectionSignature(sceneId: string, sectionType: string, label: string | null): string {
  return `${sceneId}|${sectionType}|${label ?? ''}`
}

export type SectionRangeConflictPair = {
  sectionAId: string
  sectionBId: string
  sceneId: string
}

type SectionWithScene = { id: string; scene_id: string }

/** Pairs of sections in the same scene whose page/eighth ranges overlap. */
export function findOverlappingSectionPairs(
  sections: SectionWithScene[],
  rangeBySectionId: ReadonlyMap<string, ScriptSectionRange | undefined>
): SectionRangeConflictPair[] {
  const pairs: SectionRangeConflictPair[] = []
  for (let i = 0; i < sections.length; i++) {
    const a = sections[i]!
    const rangeA = rangeBySectionId.get(a.id)
    if (!rangeA) continue
    for (let j = i + 1; j < sections.length; j++) {
      const b = sections[j]!
      if (a.scene_id !== b.scene_id) continue
      const rangeB = rangeBySectionId.get(b.id)
      if (rangesOverlap(rangeA, rangeB)) {
        pairs.push({ sectionAId: a.id, sectionBId: b.id, sceneId: a.scene_id })
      }
    }
  }
  return pairs
}

/** Section ids that participate in at least one range overlap within a scene. */
export function conflictingSectionIds(pairs: SectionRangeConflictPair[]): Set<string> {
  const ids = new Set<string>()
  for (const pair of pairs) {
    ids.add(pair.sectionAId)
    ids.add(pair.sectionBId)
  }
  return ids
}

export type TextOffsetSlice = { start: number; end: number }

/** Character offset span a range occupies on a single script page, when applicable. */
export function rangeSliceOnPage(
  range: ScriptSectionRange | ScriptSectionRangeInput,
  pageNum: number,
  contentLength: number
): TextOffsetSlice | null {
  const startPage = parseLeadingPageNumber(range.start_page ?? null)
  const endPage = parseLeadingPageNumber(range.end_page ?? range.start_page ?? null)
  if (startPage == null || endPage == null || pageNum < startPage || pageNum > endPage) {
    return null
  }

  let start = 0
  let end = contentLength
  if (pageNum === startPage && range.start_offset != null) {
    start = Math.max(0, Math.min(range.start_offset, contentLength))
  }
  if (pageNum === endPage && range.end_offset != null) {
    end = Math.max(start, Math.min(range.end_offset, contentLength))
  }
  if (start >= end) return null
  return { start, end }
}

export function intersectTextSlices(a: TextOffsetSlice, b: TextOffsetSlice): TextOffsetSlice | null {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  if (start >= end) return null
  return { start, end }
}

export type PageHighlightSegment = {
  start: number
  end: number
  kind: 'selected' | 'conflict' | 'overlap'
}

/**
 * Builds non-overlapping highlight segments for a page: selected-only, conflict-only (other
 * sections), and overlap (intersection between selected and a conflicting section).
 */
export function buildPageHighlightSegments(
  contentLength: number,
  selectedSlice: TextOffsetSlice | null,
  conflictSlices: TextOffsetSlice[]
): PageHighlightSegment[] {
  const boundaries = new Set<number>([0, contentLength])
  if (selectedSlice) {
    boundaries.add(selectedSlice.start)
    boundaries.add(selectedSlice.end)
  }
  for (const slice of conflictSlices) {
    boundaries.add(slice.start)
    boundaries.add(slice.end)
  }

  const points = [...boundaries].sort((a, b) => a - b)
  const segments: PageHighlightSegment[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!
    const end = points[i + 1]!
    if (start >= end) continue
    const mid = start + (end - start) / 2
    const inSelected = selectedSlice != null && mid >= selectedSlice.start && mid < selectedSlice.end
    const inConflict = conflictSlices.some((s) => mid >= s.start && mid < s.end)
    if (!inSelected && !inConflict) continue
    let kind: PageHighlightSegment['kind'] = 'selected'
    if (inSelected && inConflict) kind = 'overlap'
    else if (inConflict) kind = 'conflict'
    segments.push({ start, end, kind })
  }

  return segments
}
