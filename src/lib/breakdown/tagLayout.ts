/**
 * Places breakdown tags on a scene's flattened script lines (see buildSceneLines): which part of each line
 * every tag covers, the highlight segments that result (overlapping tags share a segment) and the colours
 * for each segment and the line's gutter band. Pure; no database access.
 */
import type { SceneLine } from '@/lib/db/scriptSectionLayout'
import type { BreakdownCategory } from '@/lib/db/types'
import { segmentByCoverage, type CoverageSlice } from '@/lib/text/segments'
import { breakdownCategory, breakdownCategoryOrder } from './categories'

export type PlacedTag = {
  id: string
  category: BreakdownCategory
  start_page_id: string
  start_offset: number
  end_page_id: string
  end_offset: number
}

export type LineTagSegment = {
  /** Line-relative character offsets. */
  start: number
  end: number
  tagIds: string[]
  /** One colour per category covering the run, in sheet order. */
  colours: string[]
  categories: BreakdownCategory[]
}

export type LineTagLayout = {
  segments: LineTagSegment[]
  /** Categories with any tag on the line, in sheet order (drives the gutter band). */
  categories: BreakdownCategory[]
  bandColours: string[]
}

function sortCategories(categories: Iterable<BreakdownCategory>): BreakdownCategory[] {
  return [...new Set(categories)].sort((a, b) => breakdownCategoryOrder(a) - breakdownCategoryOrder(b))
}

/** Line-relative [start, end) a tag covers on the line, or null. Tags whose pages are not in `lines` are ignored. */
export function tagSliceOnLine(
  tag: PlacedTag,
  line: SceneLine,
  pageOrderById: ReadonlyMap<string, number>
): { start: number; end: number } | null {
  const startOrder = pageOrderById.get(tag.start_page_id)
  const endOrder = pageOrderById.get(tag.end_page_id)
  if (startOrder == null || endOrder == null) return null
  if (line.pageOrder < startOrder || line.pageOrder > endOrder) return null
  const from = line.pageOrder === startOrder ? tag.start_offset : 0
  const to = line.pageOrder === endOrder ? tag.end_offset : Number.POSITIVE_INFINITY
  const lineEnd = line.startOffset + line.text.length
  const start = Math.max(from, line.startOffset)
  const end = Math.min(to, lineEnd)
  if (end <= start) return null
  return { start: start - line.startOffset, end: end - line.startOffset }
}

/** Tag layout per line index. Lines with no tags are absent. */
export function layoutTagsOnLines(lines: readonly SceneLine[], tags: readonly PlacedTag[]): Map<number, LineTagLayout> {
  const pageOrderById = new Map<string, number>()
  for (const line of lines) if (!pageOrderById.has(line.pageId)) pageOrderById.set(line.pageId, line.pageOrder)
  const categoryOf = new Map(tags.map((t) => [t.id, t.category]))

  const out = new Map<number, LineTagLayout>()
  for (const line of lines) {
    const slices: CoverageSlice[] = []
    for (const tag of tags) {
      const slice = tagSliceOnLine(tag, line, pageOrderById)
      if (slice) slices.push({ ...slice, id: tag.id })
    }
    if (slices.length === 0) continue
    const segments = segmentByCoverage(slices).map((seg) => {
      const categories = sortCategories(seg.ids.map((id) => categoryOf.get(id)!))
      return {
        start: seg.start,
        end: seg.end,
        tagIds: seg.ids,
        categories,
        colours: categories.map((c) => breakdownCategory(c).colour),
      }
    })
    const categories = sortCategories(slices.map((s) => categoryOf.get(s.id)!))
    out.set(line.index, { segments, categories, bandColours: categories.map((c) => breakdownCategory(c).colour) })
  }
  return out
}
