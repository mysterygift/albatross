/**
 * Line-snapped eighth splitting for script page content.
 *
 * Splits a page's text into up to eight contiguous spans aligned to line boundaries
 * (preferring blank lines as snap points) so dialogue blocks are not cut mid-line.
 */

export const EIGHTHS_PER_PAGE = 8

export type EighthSpan = {
  startEighth: number
  endEighth: number
  startOffset: number
  endOffset: number
}

type LineInfo = {
  text: string
  startOffset: number
  endOffset: number
  isBlank: boolean
}

function buildLineInfos(content: string): LineInfo[] {
  const lines = content.split(/\r?\n/)
  const infos: LineInfo[] = []
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!
    const startOffset = offset
    offset += text.length + (i < lines.length - 1 ? 1 : 0)
    infos.push({
      text,
      startOffset,
      endOffset: offset,
      isBlank: text.trim().length === 0,
    })
  }
  return infos
}

/** Character offset at the start of line index `lineIdx` (clamped). */
function lineStartOffset(lines: LineInfo[], lineIdx: number): number {
  if (lines.length === 0) return 0
  const idx = Math.max(0, Math.min(lineIdx, lines.length - 1))
  return lines[idx]!.startOffset
}

/**
 * Snaps a target line boundary to the nearest blank line within ±tolerance lines,
 * otherwise keeps the target (always a line boundary, never mid-line).
 */
function snapBoundaryLine(targetLine: number, lines: LineInfo[], tolerance = 1): number {
  if (lines.length === 0) return 0
  const clamped = Math.max(1, Math.min(targetLine, lines.length))
  for (let d = 0; d <= tolerance; d++) {
    const before = clamped - d
    const after = clamped + d
    if (d > 0 && before >= 1 && before <= lines.length && lines[before - 1]!.isBlank) {
      return before
    }
    if (after >= 1 && after <= lines.length && lines[after - 1]!.isBlank) {
      return after
    }
  }
  return clamped
}

/**
 * Splits page content into 1–8 line-snapped eighth spans on a single page.
 * Empty content yields no spans.
 */
export function splitPageIntoEighths(content: string, _pageNumber?: string | number): EighthSpan[] {
  const trimmed = content.trim()
  if (!trimmed) return []

  const lines = buildLineInfos(content)
  const nonBlankCount = lines.filter((l) => !l.isBlank).length
  if (nonBlankCount === 0) return []

  const totalLines = lines.length
  const targetPerEighth = Math.max(1, Math.ceil(totalLines / EIGHTHS_PER_PAGE))
  const boundaries: number[] = [0]
  for (let i = 1; i < EIGHTHS_PER_PAGE; i++) {
    boundaries.push(snapBoundaryLine(i * targetPerEighth, lines))
  }
  boundaries.push(totalLines)

  const spans: EighthSpan[] = []
  let eighthIndex = 0
  for (let b = 0; b < boundaries.length - 1; b++) {
    const startLine = boundaries[b]!
    const endLine = boundaries[b + 1]!
    if (endLine <= startLine) continue

    const sliceLines = lines.slice(startLine, endLine)
    const hasContent = sliceLines.some((l) => !l.isBlank)
    if (!hasContent) continue

    const startOffset = lineStartOffset(lines, startLine)
    const endOffset = endLine >= lines.length ? lines[lines.length - 1]!.endOffset : lineStartOffset(lines, endLine)
    const take = Math.min(EIGHTHS_PER_PAGE - eighthIndex, 1)
    const startEighth = eighthIndex
    const endEighth = eighthIndex + take
    eighthIndex = endEighth

    spans.push({ startEighth, endEighth, startOffset, endOffset })
    if (eighthIndex >= EIGHTHS_PER_PAGE) break
  }

  if (spans.length === 0) {
    return [
      {
        startEighth: 0,
        endEighth: Math.min(EIGHTHS_PER_PAGE, Math.max(1, Math.round((totalLines / 56) * EIGHTHS_PER_PAGE))),
        startOffset: lines[0]!.startOffset,
        endOffset: lines[lines.length - 1]!.endOffset,
      },
    ]
  }

  return spans
}

/**
 * Maps a page/eighth range to character offsets within a single page's content.
 * Uses the same line-snapped eighth spans as section generation.
 */
export function offsetsForEighthRangeInContent(
  content: string,
  startEighth: number,
  endEighth: number
): { start_offset: number; end_offset: number } | null {
  if (endEighth <= startEighth) return null
  const spans = splitPageIntoEighths(content)
  if (spans.length === 0) return null

  let startOffset: number | null = null
  let endOffset: number | null = null
  for (const span of spans) {
    if (startOffset == null && span.endEighth > startEighth && span.startEighth <= startEighth) {
      startOffset = span.startOffset
    }
    if (span.startEighth < endEighth && span.endEighth >= endEighth) {
      endOffset = span.endOffset
    }
  }
  if (startOffset == null) startOffset = spans[0]!.startOffset
  if (endOffset == null) endOffset = spans[spans.length - 1]!.endOffset
  if (startOffset >= endOffset) return null
  return { start_offset: startOffset, end_offset: endOffset }
}

export type PageContentRef = {
  page_number: string | null
  page_index: number
  content: string | null
}

export type EighthRangeInput = {
  start_page?: string | null
  start_eighth?: number | null
  end_page?: string | null
  end_eighth?: number | null
  start_offset?: number | null
  end_offset?: number | null
}

/** Recomputes text offsets for a range from script page content when offsets are missing. */
export function enrichRangeWithPageOffsets(
  range: EighthRangeInput,
  pages: PageContentRef[],
  parsePageNumber: (page: string | null) => number | null
): EighthRangeInput {
  if (range.start_offset != null && range.end_offset != null) return range

  const findPage = (pageRef: string | null | undefined): PageContentRef | null => {
    if (!pageRef?.trim()) return null
    const numeric = parsePageNumber(pageRef)
    return (
      pages.find((p) => p.page_number === pageRef) ??
      pages.find((p) => String(p.page_index + 1) === pageRef) ??
      (numeric != null
        ? pages.find((p) => parsePageNumber(p.page_number) === numeric)
        : null) ??
      null
    )
  }

  const startPage = findPage(range.start_page)
  const endPage = findPage(range.end_page ?? range.start_page)
  const startEighth = range.start_eighth ?? 0
  const endEighth = range.end_eighth ?? EIGHTHS_PER_PAGE
  if (!startPage?.content?.trim()) return range

  if (!endPage?.content?.trim() || startPage === endPage) {
    const offsets = offsetsForEighthRangeInContent(startPage.content, startEighth, endEighth)
    return offsets ? { ...range, ...offsets } : range
  }

  const startOffsets = offsetsForEighthRangeInContent(startPage.content, startEighth, EIGHTHS_PER_PAGE)
  const endOffsets = offsetsForEighthRangeInContent(endPage.content, 0, endEighth)
  if (!startOffsets || !endOffsets) return range
  return {
    ...range,
    start_offset: startOffsets.start_offset,
    end_offset: endOffsets.end_offset,
  }
}

export type PageContentSlice = {
  pageNumber: string
  content: string
  /** Eighths of page content (line-based estimate, capped at 8). */
  eighths: number
}

/**
 * Splits scene content across a page range proportionally by line count (TXT / fallback).
 */
export function splitSceneContentAcrossPages(
  content: string,
  startPage: string | null,
  endPage: string | null
): PageContentSlice[] {
  const trimmed = content.trim()
  if (!trimmed) return []

  const start = startPage != null && startPage !== '' ? Number(startPage) : 1
  const end = endPage != null && endPage !== '' ? Number(endPage) : start
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [{ pageNumber: startPage ?? '1', content: trimmed, eighths: splitPageIntoEighths(trimmed).length }]
  }

  const pageStart = Math.min(start, end)
  const pageEnd = Math.max(start, end)
  const pageCount = pageEnd - pageStart + 1
  const lines = trimmed.split(/\r?\n/)
  if (lines.length === 0) {
    return [{ pageNumber: String(pageStart), content: trimmed, eighths: 1 }]
  }

  const linesPerPage = Math.max(1, Math.ceil(lines.length / pageCount))
  const slices: PageContentSlice[] = []
  for (let p = 0; p < pageCount; p++) {
    const pageNum = pageStart + p
    const chunk = lines.slice(p * linesPerPage, (p + 1) * linesPerPage).join('\n').trim()
    if (!chunk) continue
    const eighthSpans = splitPageIntoEighths(chunk)
    slices.push({
      pageNumber: String(pageNum),
      content: chunk,
      eighths: eighthSpans.length > 0 ? eighthSpans[eighthSpans.length - 1]!.endEighth : 1,
    })
  }
  return slices.length > 0 ? slices : [{ pageNumber: String(pageStart), content: trimmed, eighths: 8 }]
}

/**
 * Groups PDF parser elements by physical page into page content slices.
 */
export function splitSceneContentFromPdfElements(
  elements: Array<{ type: string; text: string; page: number }> | undefined,
  content: string,
  startPage: string | null,
  endPage: string | null
): PageContentSlice[] {
  if (!elements?.length) {
    return splitSceneContentAcrossPages(content, startPage, endPage)
  }

  const byPage = new Map<number, string[]>()
  for (const el of elements) {
    if (el.type === 'page_header') continue
    const arr = byPage.get(el.page) ?? []
    arr.push(el.text)
    byPage.set(el.page, arr)
  }

  const slices: PageContentSlice[] = []
  for (const [page, texts] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const pageContent = texts.join('\n').trim()
    if (!pageContent) continue
    const eighthSpans = splitPageIntoEighths(pageContent)
    slices.push({
      pageNumber: String(page),
      content: pageContent,
      eighths: eighthSpans.length > 0 ? eighthSpans[eighthSpans.length - 1]!.endEighth : 1,
    })
  }
  return slices.length > 0 ? slices : splitSceneContentAcrossPages(content, startPage, endPage)
}
