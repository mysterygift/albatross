/**
 * Turns a text selection in the script view into a tag range: per-page character offsets into
 * script_pages.content, snapped out to whole words and trimmed of surrounding whitespace.
 *
 * The script view (ScriptLines) marks each line's text cell with `data-page-id` and `data-line-start` (the
 * line's offset in its page), and the cell's text is exactly the line text, so a DOM point maps to a page
 * offset by measuring the text between the cell start and the point.
 */

export type PageTextRange = {
  startPageId: string
  startOffset: number
  endPageId: string
  /** Exclusive. */
  endOffset: number
}

export type ScenePageText = { id: string; content: string }

const WORD_CHAR = /[\p{L}\p{N}'’-]/u

/** Expands [start, end) on one string to whole words. */
function expandToWords(content: string, start: number, end: number): [number, number] {
  let s = start
  let e = end
  while (s > 0 && WORD_CHAR.test(content[s - 1]!) && WORD_CHAR.test(content[s] ?? ' ')) s -= 1
  while (e < content.length && e > 0 && WORD_CHAR.test(content[e]!) && WORD_CHAR.test(content[e - 1]!)) e += 1
  return [s, e]
}

/**
 * Snaps a range to whole words and trims whitespace (and stray punctuation) at both ends. Pages must be the
 * scene's pages in script order. Returns null when nothing but whitespace was selected.
 */
export function snapRangeToWords(pages: readonly ScenePageText[], range: PageTextRange): PageTextRange | null {
  const startIndex = pages.findIndex((p) => p.id === range.startPageId)
  const endIndex = pages.findIndex((p) => p.id === range.endPageId)
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return null

  let sPage = startIndex
  let sOff = Math.max(0, Math.min(range.startOffset, pages[startIndex]!.content.length))
  let ePage = endIndex
  let eOff = Math.max(0, Math.min(range.endOffset, pages[endIndex]!.content.length))
  if (sPage === ePage && eOff <= sOff) return null

  const isEdgeJunk = (ch: string | undefined) => ch == null || /[\s.,;:!?"“”()[\]]/u.test(ch)
  // Trim the start forwards, moving to the next page when this one runs out.
  for (;;) {
    const content = pages[sPage]!.content
    while (sOff < content.length && isEdgeJunk(content[sOff]) && !(sPage === ePage && sOff >= eOff)) sOff += 1
    if (sPage === ePage && sOff >= eOff) return null
    if (sOff < content.length) break
    sPage += 1
    sOff = 0
  }
  // Trim the end backwards, moving to the previous page when this one runs out.
  for (;;) {
    const content = pages[ePage]!.content
    while (eOff > 0 && isEdgeJunk(content[eOff - 1]) && !(sPage === ePage && eOff <= sOff)) eOff -= 1
    if (sPage === ePage && eOff <= sOff) return null
    if (eOff > 0) break
    ePage -= 1
    eOff = pages[ePage]!.content.length
  }

  sOff = expandToWords(pages[sPage]!.content, sOff, sOff)[0]
  eOff = expandToWords(pages[ePage]!.content, eOff, eOff)[1]
  return { startPageId: pages[sPage]!.id, startOffset: sOff, endPageId: pages[ePage]!.id, endOffset: eOff }
}

/** The text a range covers, pages joined with a newline. */
export function rangeText(pages: readonly ScenePageText[], range: PageTextRange): string {
  const startIndex = pages.findIndex((p) => p.id === range.startPageId)
  const endIndex = pages.findIndex((p) => p.id === range.endPageId)
  if (startIndex < 0 || endIndex < startIndex) return ''
  const parts: string[] = []
  for (let i = startIndex; i <= endIndex; i++) {
    const content = pages[i]!.content
    const from = i === startIndex ? range.startOffset : 0
    const to = i === endIndex ? range.endOffset : content.length
    parts.push(content.slice(from, to))
  }
  return parts.join('\n')
}

/** Tag text for display and element names: whitespace collapsed. */
export function tidyTagText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// ─── DOM ────────────────────────────────────────────────────────────────────

type LineCell = { el: HTMLElement; pageId: string; lineStart: number; length: number }

function cellOf(el: HTMLElement): LineCell | null {
  const pageId = el.dataset.pageId
  const lineStart = Number(el.dataset.lineStart)
  if (!pageId || !Number.isFinite(lineStart)) return null
  // An empty line renders a single no-break space; it has no text to select.
  const text = el.textContent ?? ''
  return { el, pageId, lineStart, length: text === ' ' ? 0 : text.length }
}

/** Characters between the start of `cell` and the DOM point, clamped to the line. */
function offsetInCell(cell: LineCell, node: Node, offset: number): number {
  const r = cell.el.ownerDocument.createRange()
  r.setStart(cell.el, 0)
  r.setEnd(node, offset)
  return Math.max(0, Math.min(r.toString().length, cell.length))
}

/**
 * Page offsets of a DOM range inside `container` (a ScriptLines element). Points that fall outside a line's
 * text (the gutter, a page header) clamp to the nearest line text inside the range. Null when the range
 * covers no line text.
 */
export function domRangeToPageRange(range: Range, container: HTMLElement): PageTextRange | null {
  const cells = [...container.querySelectorAll<HTMLElement>('[data-page-id][data-line-start]')]
    .filter((el) => range.intersectsNode(el))
    .map(cellOf)
    .filter((c): c is LineCell => c != null)
  if (cells.length === 0) return null
  const first = cells[0]!
  const last = cells[cells.length - 1]!
  const startIn = first.el.contains(range.startContainer) ? offsetInCell(first, range.startContainer, range.startOffset) : 0
  const endIn = last.el.contains(range.endContainer) ? offsetInCell(last, range.endContainer, range.endOffset) : last.length
  return {
    startPageId: first.pageId,
    startOffset: first.lineStart + startIn,
    endPageId: last.pageId,
    endOffset: last.lineStart + endIn,
  }
}
