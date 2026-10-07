/** A character span of some text, tagged with the id of what covers it. */
export type CoverageSlice<Id extends string = string> = { start: number; end: number; id: Id }

/** A run of text covered by the same set of slices. */
export type CoverageSegment<Id extends string = string> = { start: number; end: number; ids: Id[] }

/**
 * Splits overlapping slices into non-overlapping segments, each listing every slice id covering it (in
 * the order the slices were given). Uncovered text yields no segment. Used to draw several highlights
 * over the same text: overlaps become one segment with more than one id.
 */
export function segmentByCoverage<Id extends string>(slices: ReadonlyArray<CoverageSlice<Id>>): CoverageSegment<Id>[] {
  const live = slices.filter((s) => s.end > s.start)
  if (live.length === 0) return []
  const points = [...new Set(live.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b)
  const segments: CoverageSegment<Id>[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!
    const end = points[i + 1]!
    const ids = live.filter((s) => s.start <= start && s.end >= end).map((s) => s.id)
    if (ids.length === 0) continue
    const unique = [...new Set(ids)]
    const prev = segments[segments.length - 1]
    // Adjacent runs with the same covering set merge into one segment.
    if (prev && prev.end === start && prev.ids.length === unique.length && prev.ids.every((id, k) => id === unique[k])) {
      prev.end = end
    } else {
      segments.push({ start, end, ids: unique })
    }
  }
  return segments
}
