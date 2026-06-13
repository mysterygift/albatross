/**
 * Line-snapped eighth splitting for script page content.
 *
 * Splits a page's text into up to eight contiguous spans aligned to line boundaries
 * (preferring blank lines as snap points) so dialogue blocks are not cut mid-line.
 */

import {
  isCharacterCueLine,
  isParentheticalLine,
  SCENE_HEADING,
  TRANSITION,
} from '@/lib/script-parser/common'

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

/** True when splitting at `boundaryLine` would separate a character cue from its dialogue. */
function isUnsafeDialogueSplit(boundaryLine: number, lines: LineInfo[]): boolean {
  if (boundaryLine <= 0 || boundaryLine >= lines.length) return false
  const prev = lines[boundaryLine - 1]!
  const next = lines[boundaryLine]!
  if (next.isBlank) return false
  const nextText = next.text.trim()
  if (SCENE_HEADING.test(nextText) || TRANSITION.test(nextText)) return false
  if (isCharacterCueLine(prev.text)) return true
  if (isParentheticalLine(prev.text)) return true
  if (isMidDialogueBlockSplit(boundaryLine, lines)) return true
  return false
}

/** Inclusive line range for a character's dialogue block, or null when not inside one. */
function getDialogueBlockRange(lines: LineInfo[], lineIdx: number): { start: number; end: number } | null {
  if (lineIdx < 0 || lineIdx >= lines.length || lines[lineIdx]!.isBlank) return null

  let charLine = -1
  for (let i = lineIdx; i >= 0; i--) {
    if (lines[i]!.isBlank) break
    if (isCharacterCueLine(lines[i]!.text)) {
      charLine = i
      break
    }
  }
  if (charLine < 0) return null

  let end = charLine
  for (let i = charLine + 1; i < lines.length; i++) {
    const line = lines[i]!
    const text = line.text.trim()
    if (line.isBlank) break
    if (isCharacterCueLine(text)) break
    if (SCENE_HEADING.test(text) || TRANSITION.test(text)) break
    if (!isParentheticalLine(text) && !/[a-z]/.test(text)) break
    end = i
  }

  if (end <= charLine) return null
  if (lineIdx < charLine || lineIdx > end) return null
  return { start: charLine, end }
}

function isMidDialogueBlockSplit(boundaryLine: number, lines: LineInfo[]): boolean {
  if (boundaryLine <= 0 || boundaryLine >= lines.length) return false
  const range =
    getDialogueBlockRange(lines, boundaryLine - 1) ?? getDialogueBlockRange(lines, boundaryLine)
  if (!range) return false
  return boundaryLine > range.start + 1 && boundaryLine <= range.end
}

/** Extends a section end boundary forward to the close of an in-progress dialogue block. */
function roundBoundaryToDialogueBlockEnd(boundaryLine: number, lines: LineInfo[]): number {
  if (boundaryLine <= 0 || boundaryLine >= lines.length) return boundaryLine
  const range =
    getDialogueBlockRange(lines, boundaryLine - 1) ?? getDialogueBlockRange(lines, boundaryLine)
  if (!range) return boundaryLine
  if (boundaryLine > range.start && boundaryLine <= range.end) {
    return Math.min(lines.length, range.end + 1)
  }
  return boundaryLine
}

function isSafeBoundaryLine(boundaryLine: number, lines: LineInfo[]): boolean {
  return !isUnsafeDialogueSplit(boundaryLine, lines)
}

/**
 * Snaps a target line boundary to the nearest blank line within ±tolerance lines,
 * otherwise keeps the target (always a line boundary, never mid-line).
 * Never splits between a character cue/parenthetical and the following dialogue.
 */
function snapBoundaryLine(targetLine: number, lines: LineInfo[], tolerance = 1): number {
  if (lines.length === 0) return 0
  const clamped = Math.max(1, Math.min(targetLine, lines.length))
  const candidates: number[] = [clamped]
  for (let d = 0; d <= tolerance; d++) {
    const before = clamped - d
    const after = clamped + d
    if (d > 0 && before >= 1 && before <= lines.length && lines[before - 1]!.isBlank) {
      candidates.push(before)
    }
    if (after >= 1 && after <= lines.length && lines[after - 1]!.isBlank) {
      candidates.push(after)
    }
  }
  for (let d = 1; d <= 4; d++) {
    candidates.push(clamped - d, clamped + d)
  }

  const unique = [...new Set(candidates)].filter((c) => c >= 1 && c <= lines.length)
  unique.sort((a, b) => Math.abs(a - clamped) - Math.abs(b - clamped))
  for (const candidate of unique) {
    if (isSafeBoundaryLine(candidate, lines)) return candidate
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

  for (let i = 1; i < boundaries.length - 1; i++) {
    const rounded = roundBoundaryToDialogueBlockEnd(boundaries[i]!, lines)
    boundaries[i] = snapBoundaryLine(rounded, lines, 0)
  }
  for (let i = 1; i < boundaries.length; i++) {
    boundaries[i] = Math.max(boundaries[i]!, boundaries[i - 1]!)
  }

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

type ScriptElementLike = { type: string; text: string }

const PUNCTUATION_END = /[.!?]["')\]]*\s*$/

function isActionFollowLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isCharacterCueLine(trimmed)) return false
  if (SCENE_HEADING.test(trimmed)) return false
  if (TRANSITION.test(trimmed)) return false
  if (isParentheticalLine(trimmed)) return false
  return true
}

/**
 * After a dialogue block has started, insert a blank line before action that follows a
 * punctuated speech line. Skips pairs recorded as consecutive dialogue elements.
 */
export function formatDialogueToActionSpacing(
  content: string,
  skipPairs: ReadonlySet<string> = new Set()
): string {
  const lines = content.split(/\r?\n/)
  const result: string[] = []
  let dialogueBlockActive = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (i > 0 && dialogueBlockActive && trimmed) {
      let prevIdx = result.length - 1
      while (prevIdx >= 0 && result[prevIdx]!.trim() === '') prevIdx--
      const prevTrimmed = prevIdx >= 0 ? result[prevIdx]!.trim() : ''
      const pairKey = `${prevTrimmed}\n${trimmed}`

      if (
        prevTrimmed &&
        PUNCTUATION_END.test(prevTrimmed) &&
        isActionFollowLine(trimmed) &&
        !skipPairs.has(pairKey) &&
        result[result.length - 1] !== ''
      ) {
        result.push('')
        dialogueBlockActive = false
      }
    }

    result.push(line)

    if (!trimmed) {
      dialogueBlockActive = false
    } else if (isCharacterCueLine(trimmed)) {
      dialogueBlockActive = true
    } else if (SCENE_HEADING.test(trimmed) || TRANSITION.test(trimmed)) {
      dialogueBlockActive = false
    }
  }

  return result.join('\n').trim()
}

/** Applies all plain-text spacing normalizations used before eighth splitting. */
export function formatPageContentSpacing(
  content: string,
  skipPairs: ReadonlySet<string> = new Set()
): string {
  return formatDialogueToActionSpacing(content, skipPairs)
}

/** Whether to insert a blank line between two classified screenplay elements. */
function shouldInsertBlankLineBetween(prevType: string, nextType: string): boolean {
  if (nextType === 'page_header') return false
  if (prevType === 'scene_heading') return true
  if (prevType === 'dialogue') {
    return (
      nextType === 'character' ||
      nextType === 'scene_heading' ||
      nextType === 'action' ||
      nextType === 'unknown' ||
      nextType === 'transition'
    )
  }
  if (prevType === 'parenthetical') {
    return (
      nextType === 'character' ||
      nextType === 'scene_heading' ||
      nextType === 'action' ||
      nextType === 'unknown' ||
      nextType === 'transition'
    )
  }
  if (prevType === 'action' || prevType === 'transition') {
    return nextType === 'character' || nextType === 'scene_heading'
  }
  return false
}

/**
 * Joins classified script elements into page text with screenplay spacing:
 * blank line after scene headings and after dialogue blocks; character cues stay
 * adjacent to their dialogue/parentheticals.
 */
export function joinScriptElements(elements: readonly ScriptElementLike[]): string {
  const parts: string[] = []
  const dialogueToDialoguePairs = new Set<string>()
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!
    if (i > 0) {
      const prev = elements[i - 1]!
      if (prev.type === 'dialogue' && el.type === 'dialogue') {
        dialogueToDialoguePairs.add(`${prev.text}\n${el.text}`)
      }
      if (shouldInsertBlankLineBetween(prev.type, el.type)) {
        parts.push('')
      }
    }
    parts.push(el.text)
  }
  return formatPageContentSpacing(parts.join('\n').trim(), dialogueToDialoguePairs)
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
    const formatted = formatPageContentSpacing(trimmed)
    return [{ pageNumber: startPage ?? '1', content: formatted, eighths: splitPageIntoEighths(formatted).length }]
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
    const chunk = formatPageContentSpacing(
      lines.slice(p * linesPerPage, (p + 1) * linesPerPage).join('\n').trim()
    )
    if (!chunk) continue
    const eighthSpans = splitPageIntoEighths(chunk)
    slices.push({
      pageNumber: String(pageNum),
      content: chunk,
      eighths: eighthSpans.length > 0 ? eighthSpans[eighthSpans.length - 1]!.endEighth : 1,
    })
  }
  return slices.length > 0 ? slices : [{ pageNumber: String(pageStart), content: formatPageContentSpacing(trimmed), eighths: 8 }]
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

  const byPage = new Map<number, ScriptElementLike[]>()
  for (const el of elements) {
    if (el.type === 'page_header') continue
    const arr = byPage.get(el.page) ?? []
    arr.push(el)
    byPage.set(el.page, arr)
  }

  const slices: PageContentSlice[] = []
  for (const [page, pageElements] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const pageContent = joinScriptElements(pageElements)
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
