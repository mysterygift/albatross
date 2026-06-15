import { formatSceneHeading } from '@/lib/script-parser/common'
import { enrichRangeWithPageOffsets } from './scriptEighthSplitService'
import type { Scene, ScriptPage, ScriptSectionRange } from './types'

const EIGHTHS_PER_PAGE = 8

function parseLeadingPageNumber(page: string | null): number | null {
  if (page == null) return null
  const match = /^\s*(\d+)/.exec(page)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

type GlobalEighthInterval = { start: number; end: number }

type RangeWithPages = {
  range: ScriptSectionRange
  pages: ScriptPage[]
}

export function pageSortKey(page: ScriptPage): number {
  return parseLeadingPageNumber(page.page_number) ?? page.page_index + 1
}

export function sortScenePages(pages: readonly ScriptPage[]): ScriptPage[] {
  return [...pages].sort((a, b) => pageSortKey(a) - pageSortKey(b))
}

export function scenePagesForVersion(
  scriptPagesByVersionId: Record<string, ScriptPage[]>,
  scriptVersionId: string,
  sceneId: string
): ScriptPage[] {
  return sortScenePages(
    (scriptPagesByVersionId[scriptVersionId] ?? []).filter((p) => p.scene_id === sceneId)
  )
}

export function joinScenePagesFullText(pages: readonly ScriptPage[]): string | null {
  const parts = pages.map((p) => p.content?.trim()).filter((c): c is string => !!c)
  return parts.length > 0 ? parts.join('\n\n') : null
}

/** Screenplay scene slug for sides output. */
export function sceneHeadingForSides(scene: Scene): string | null {
  const heading = scene.heading?.trim()
  if (heading) return heading
  const title = scene.title?.trim()
  if (title) return formatSceneHeading(scene.int_ext, title)
  return null
}

function globalEighthInterval(range: ScriptSectionRange): GlobalEighthInterval | null {
  const start = parseLeadingPageNumber(range.start_page)
  const endPage = parseLeadingPageNumber(range.end_page ?? range.start_page)
  if (start == null || endPage == null) return null
  const startGlobal = (start - 1) * EIGHTHS_PER_PAGE + (range.start_eighth ?? 0)
  const endGlobal = (endPage - 1) * EIGHTHS_PER_PAGE + (range.end_eighth ?? 0)
  if (endGlobal <= startGlobal) return null
  return { start: startGlobal, end: endGlobal }
}

function mergeGlobalEighthIntervals(intervals: GlobalEighthInterval[]): GlobalEighthInterval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: GlobalEighthInterval[] = [{ ...sorted[0]! }]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!
    const last = merged[merged.length - 1]!
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

function intervalToRange(interval: GlobalEighthInterval): ScriptSectionRange {
  const startPage = Math.floor(interval.start / EIGHTHS_PER_PAGE) + 1
  const startEighth = interval.start % EIGHTHS_PER_PAGE
  const endPage = Math.floor(interval.end / EIGHTHS_PER_PAGE) + 1
  const endEighth = interval.end % EIGHTHS_PER_PAGE
  return {
    id: '',
    section_id: '',
    start_page: String(startPage),
    start_eighth: startEighth,
    end_page: String(endPage),
    end_eighth: endEighth,
    start_offset: null,
    end_offset: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  }
}

/** Extract best-effort script text for a single page/eighth range from scene pages. */
export function extractScriptTextForRange(
  pages: readonly ScriptPage[],
  range: ScriptSectionRange
): string | null {
  const sorted = sortScenePages(pages)
  if (sorted.length === 0) return null

  const enriched = enrichRangeWithPageOffsets(range, sorted, parseLeadingPageNumber)
  const startPageNum = parseLeadingPageNumber(enriched.start_page ?? null)
  const endPageNum = parseLeadingPageNumber(enriched.end_page ?? enriched.start_page ?? null)
  if (startPageNum == null || endPageNum == null) return null

  const parts: string[] = []
  for (const page of sorted) {
    const pageNum = pageSortKey(page)
    if (pageNum < startPageNum || pageNum > endPageNum) continue
    const content = page.content ?? ''
    if (!content) continue

    let start = 0
    let end = content.length
    if (pageNum === startPageNum && enriched.start_offset != null) {
      start = Math.max(0, Math.min(enriched.start_offset, content.length))
    }
    if (pageNum === endPageNum && enriched.end_offset != null) {
      end = Math.max(start, Math.min(enriched.end_offset, content.length))
    }
    if (start >= end) continue
    const slice = content.slice(start, end).trim()
    if (slice) parts.push(slice)
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}

function ensureSceneHeading(text: string, scene: Scene): string {
  const heading = sceneHeadingForSides(scene)
  if (!heading) return text
  const normalizedHeading = heading.replace(/\s+/g, ' ').trim().toUpperCase()
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.replace(/\s+/g, ' ').trim().toUpperCase()
  if (firstLine && (firstLine.includes(normalizedHeading) || normalizedHeading.includes(firstLine))) {
    return text
  }
  return `${heading}\n\n${text}`
}

function collateFromRangeSlices(
  scene: Scene,
  rangeWithPages: RangeWithPages[]
): string | null {
  const intervals = rangeWithPages
    .map(({ range }) => globalEighthInterval(range))
    .filter((iv): iv is GlobalEighthInterval => iv != null)
  if (intervals.length === 0) return null

  const merged = mergeGlobalEighthIntervals(intervals)
  const parts: string[] = []
  for (const interval of merged) {
    const syntheticRange = intervalToRange(interval)
    const pages =
      rangeWithPages.find(({ range }) => {
        const iv = globalEighthInterval(range)
        return iv != null && iv.start <= interval.start && iv.end >= interval.end
      })?.pages ?? rangeWithPages[0]!.pages
    const text = extractScriptTextForRange(pages, syntheticRange)
    if (text) parts.push(text)
  }

  if (parts.length === 0) return null
  return ensureSceneHeading(parts.join('\n\n'), scene)
}

function collateFromEntrySlices(
  scene: Scene,
  entries: ReadonlyArray<{ scriptText: string | null }>
): string | null {
  const parts: string[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const text = entry.scriptText?.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    parts.push(text)
  }
  if (parts.length === 0) return null
  return ensureSceneHeading(parts.join('\n\n'), scene)
}

/**
 * Collate script text for a scene's selected sections: merge page/eighth ranges and emit each
 * script portion at most once, prefixed with a scene heading when missing from the body.
 */
export function collateSceneScriptText(
  scene: Scene,
  entries: ReadonlyArray<{
    section: { script_version_id: string }
    ranges: ScriptSectionRange[]
    scriptText: string | null
    origin: 'included' | 'fallback'
  }>,
  scriptPagesByVersionId: Record<string, ScriptPage[]>
): string | null {
  if (entries.length === 0) return null

  const hasFallbackOnly =
    entries.every((e) => e.origin === 'fallback') &&
    entries.some((e) => e.origin === 'fallback')

  if (hasFallbackOnly) {
    const versionId = entries[0]!.section.script_version_id
    const pages = scenePagesForVersion(scriptPagesByVersionId, versionId, scene.id)
    const fullText = joinScenePagesFullText(pages)
    return fullText ? ensureSceneHeading(fullText, scene) : collateFromEntrySlices(scene, entries)
  }

  const rangeWithPages: RangeWithPages[] = []
  for (const entry of entries) {
    const pages = scenePagesForVersion(
      scriptPagesByVersionId,
      entry.section.script_version_id,
      scene.id
    )
    for (const range of entry.ranges) {
      rangeWithPages.push({ range, pages })
    }
  }

  const collated = collateFromRangeSlices(scene, rangeWithPages)
  if (collated) return collated
  return collateFromEntrySlices(scene, entries)
}
