/**
 * Layout-aware PDF script parser.
 *
 * Standard screenplay PDFs encode structure positionally rather than with markup: scene
 * headings sit at the left (action) margin, scene numbers are printed in the far margins,
 * character cues are indented well to the right, and dialogue/action occupy their own columns.
 * This parser reconstructs lines from pdfjs text-item positions, classifies them by horizontal
 * position into screenplay elements, detects scene headings (plus their margin scene numbers and
 * the printed page number), and derives real PDF page boundaries and a viewport-based eighths
 * estimate. It emits the same `ParsedScene[]` contract as the TXT parser so downstream consumers
 * (scene creation + SB1 section generation) are unchanged; the richer `elements`/`dialogue`
 * fields are optional and non-persisted.
 *
 * This handles text-layer PDFs only; scanned/image-only PDFs (which require OCR) are detected and
 * surfaced via `PdfParseError('no-text-layer')` rather than silently yielding no scenes.
 */
import type { ParsedScene, PdfLineType, ScriptElement, ParsedDialogue } from './types'
import {
  SCENE_HEADING,
  TRANSITION,
  extractCharacterCues,
  extractLocationFromSlug,
  inferDayNight,
  inferIntExt,
  isContinuationLine,
  stripContinuation,
} from './common'

/** A reconstructed line of text with its position on the page. */
export interface PdfLine {
  /** Joined, trimmed text of the line. */
  text: string
  /** Left edge (x) of the line in PDF user-space points (smaller = closer to the left margin). */
  x: number
  /** Right edge (x + width) of the line in PDF user-space points. */
  right: number
  /** Baseline y of the line in PDF user-space points (larger = higher up the page). */
  y: number
  /** 1-based physical page index this line belongs to. */
  page: number
  /** Page width in points from the viewport (0 when unavailable, e.g. under test). */
  pageWidth: number
  /** Page height in points from the viewport (0 when unavailable, e.g. under test). */
  pageHeight: number
}

/** pdfjs text-item shape we rely on (a subset of pdfjs-dist's TextItem). */
interface PdfTextItem {
  str: string
  /** [scaleX, skewY, skewX, scaleY, x, y] — index 4 = x, index 5 = y. */
  transform: number[]
  width: number
  height: number
}

export type PdfParseErrorCode = 'no-text-layer' | 'too-many-pages' | 'parse-failed'

/** Typed error so the UI can distinguish a scanned PDF from a too-large one or a generic failure. */
export class PdfParseError extends Error {
  code: PdfParseErrorCode
  constructor(code: PdfParseErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'PdfParseError'
    this.code = code
  }
}

export interface PdfParseOptions {
  /** Maximum page count before refusing to parse. Defaults to `DEFAULT_MAX_PAGES`. */
  maxPages?: number
  /** Called after each page is read, for progress UI. */
  onProgress?: (page: number, total: number) => void
}

/** Items within this many points of vertical separation are treated as the same line. */
const LINE_Y_TOLERANCE = 3
/** Horizontal gap (points) above which adjacent items are separated by a space. */
const WORD_GAP = 1
/** A line is considered "at the left margin" when within this many points of the modal min-x. */
const LEFT_MARGIN_TOLERANCE = 6
/** Tolerance (points) for snapping a line's left edge to a detected column. */
const COLUMN_TOL = 12
/** Fallback indentation (points past the left margin) for the character-cue column. */
const CHARACTER_INDENT_MIN = 120
/** Fallback indentation (points past the left margin) for the dialogue column. */
const DIALOGUE_INDENT_MIN = 36
/** Default top/bottom page margins (points) used to derive the content area for eighths. */
const TOP_MARGIN = 72
const BOTTOM_MARGIN = 72
/** Vertical band (points) from the top of the page in which a printed page number can appear. */
const HEADER_BAND = 54
/** Refuse documents larger than this to bound parse time/memory. */
const DEFAULT_MAX_PAGES = 400

/** Matches a short scene-number token (e.g. "12", "12A", "A1") used in the page margins. */
const SCENE_NUMBER_TOKEN = /^(?:[0-9]+[A-Za-z]?|[A-Za-z][0-9]+[A-Za-z]?)$/
/** Leading scene number printed before the heading at the far-left margin. */
const LEADING_SCENE_NUMBER =
  /^([0-9]+[A-Za-z]?|[A-Za-z][0-9]+[A-Za-z]?)\s+(?=INT|EXT|EST|I\/E|E\/I)/i
/** A printed page-number line (header), e.g. "12.", "12A", "108". */
const PAGE_NUMBER = /^\d+[A-Za-z]?\.?$/

function ensureDomMatrix(): void {
  const globalScope = globalThis as unknown as { DOMMatrix?: unknown }
  if (typeof globalScope.DOMMatrix === 'undefined') {
    globalScope.DOMMatrix = class {}
  }
}

/**
 * Reconstructs ordered lines from a PDF using pdfjs text positions. Lines are returned in
 * reading order: page ascending, then top-to-bottom within each page. Throws `PdfParseError`
 * for documents over the page cap or with no extractable text layer.
 */
function isDedicatedWorkerContext(): boolean {
  return (
    typeof globalThis.document === 'undefined' &&
    typeof (globalThis as { importScripts?: unknown }).importScripts === 'function'
  )
}

/**
 * Configures pdfjs for the current execution context. In a dedicated Web Worker, pdfjs cannot
 * spawn a nested Worker (no window/document) and requires workerSrc for its fake-worker path.
 * Preloading WorkerMessageHandler onto globalThis.pdfjsWorker forces that path immediately.
 */
async function configurePdfJsForContext(
  pdfjs: typeof import('pdfjs-dist')
): Promise<void> {
  const workerOptions = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions
  if (!workerOptions) return

  workerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  if (!isDedicatedWorkerContext()) return

  const g = globalThis as { pdfjsWorker?: { WorkerMessageHandler: unknown } }
  if (g.pdfjsWorker?.WorkerMessageHandler) return

  const workerMod = (await import(
    /* @vite-ignore */
    'pdfjs-dist/build/pdf.worker.min.mjs'
  )) as { WorkerMessageHandler: unknown }
  g.pdfjsWorker = { WorkerMessageHandler: workerMod.WorkerMessageHandler }
}

export async function extractPdfLines(
  data: ArrayBuffer | Uint8Array,
  options?: PdfParseOptions
): Promise<PdfLine[]> {
  ensureDomMatrix()

  const pdfjs = await import('pdfjs-dist')
  await configurePdfJsForContext(pdfjs)

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise

  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES
  if (pdf.numPages > maxPages) {
    throw new PdfParseError(
      'too-many-pages',
      `PDF has ${pdf.numPages} pages, which exceeds the maximum of ${maxPages}.`
    )
  }

  const lines: PdfLine[] = []
  let totalItems = 0
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const viewport =
      typeof page.getViewport === 'function' ? page.getViewport({ scale: 1 }) : null
    const pageWidth = viewport?.width ?? 0
    const pageHeight = viewport?.height ?? 0
    const items = (content.items as PdfTextItem[]).filter(
      (item) => item && typeof item.str === 'string' && Array.isArray(item.transform)
    )
    totalItems += items.filter((item) => item.str.trim().length > 0).length
    lines.push(...groupItemsIntoLines(items, pageNumber, pageWidth, pageHeight))
    options?.onProgress?.(pageNumber, pdf.numPages)
  }

  if (totalItems === 0) {
    throw new PdfParseError(
      'no-text-layer',
      'This PDF has no selectable text (it may be a scan). OCR is not supported; paste the script text instead.'
    )
  }
  return lines
}

/** Groups positioned text items into lines for a single page, ordered top-to-bottom. */
function groupItemsIntoLines(
  items: PdfTextItem[],
  page: number,
  pageWidth: number,
  pageHeight: number
): PdfLine[] {
  if (items.length === 0) return []

  // Sort by y descending (top of page first), then x ascending (left to right).
  const sorted = [...items].sort((a, b) => {
    const dy = (b.transform[5] ?? 0) - (a.transform[5] ?? 0)
    if (Math.abs(dy) > LINE_Y_TOLERANCE) return dy
    return (a.transform[4] ?? 0) - (b.transform[4] ?? 0)
  })

  const lines: PdfLine[] = []
  let bucket: PdfTextItem[] = []
  let bucketY = sorted[0]!.transform[5] ?? 0

  const flush = () => {
    if (bucket.length === 0) return
    const line = buildLine(bucket, page, pageWidth, pageHeight)
    if (line) lines.push(line)
    bucket = []
  }

  for (const item of sorted) {
    const y = item.transform[5] ?? 0
    if (bucket.length > 0 && Math.abs(y - bucketY) > LINE_Y_TOLERANCE) {
      flush()
      bucketY = y
    } else if (bucket.length === 0) {
      bucketY = y
    }
    bucket.push(item)
  }
  flush()
  return lines
}

/** Builds a single line from same-row items, inserting spaces where there are horizontal gaps. */
function buildLine(
  items: PdfTextItem[],
  page: number,
  pageWidth: number,
  pageHeight: number
): PdfLine | null {
  const ordered = [...items].sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))
  let text = ''
  let prevRight: number | null = null
  let right = 0
  for (const item of ordered) {
    const x = item.transform[4] ?? 0
    if (prevRight !== null && x - prevRight > WORD_GAP && text.length > 0 && !text.endsWith(' ')) {
      text += ' '
    }
    text += item.str
    prevRight = x + (item.width ?? 0)
    right = Math.max(right, prevRight)
  }
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  const x = ordered[0]!.transform[4] ?? 0
  const y = ordered[0]!.transform[5] ?? 0
  return { text: trimmed, x, right, y, page, pageWidth, pageHeight }
}

interface ParsedHeading {
  sceneNumber: string | null
  /** The "INT./EXT. ..." text used for INT/EXT inference. */
  headingText: string
  /** The heading minus the prefix, margin scene numbers and continuation tags — the scene title. */
  title: string
}

/**
 * Parses a line as a scene heading, stripping margin scene numbers and continuation tags. Returns
 * null if the line is not a scene heading.
 */
function parseHeadingLine(rawText: string): ParsedHeading | null {
  let working = rawText.trim()

  let leadingNumber: string | null = null
  const leadMatch = working.match(LEADING_SCENE_NUMBER)
  if (leadMatch) {
    leadingNumber = leadMatch[1]!
    working = working.slice(leadMatch[0]!.length).trim()
  }

  const headingMatch = working.match(SCENE_HEADING)
  if (!headingMatch) return null

  let rest = stripContinuation((headingMatch[2] ?? '').trim())
  let trailingNumber: string | null = null
  const trailMatch = rest.match(/\s+([0-9]+[A-Za-z]?)$/)
  if (trailMatch) {
    const candidate = trailMatch[1]!
    // A trailing margin number is either a duplicate of the leading one or the sole numbering.
    if (leadingNumber === null || candidate === leadingNumber) {
      trailingNumber = candidate
      rest = rest.slice(0, rest.length - trailMatch[0]!.length).trim()
    }
  }

  const sceneNumber = leadingNumber ?? trailingNumber
  return {
    sceneNumber: sceneNumber && SCENE_NUMBER_TOKEN.test(sceneNumber) ? sceneNumber : null,
    headingText: working,
    title: rest || working,
  }
}

// ─── Page numbers (printed header) ──────────────────────────────────────────

interface PageLabels {
  /** physical page index -> printed page label (e.g. "12A"). */
  labels: Map<number, string>
  /** Lines that are page-number headers, to be excluded from scene content. */
  headerLines: Set<PdfLine>
}

/**
 * Detects the printed page number in each page's top margin and returns both a physical-index ->
 * label map and the set of header lines to strip. The header is the top-most short line that is
 * purely a page-number token and sits within the top band of the page.
 */
function detectPageLabels(lines: PdfLine[]): PageLabels {
  const labels = new Map<number, string>()
  const headerLines = new Set<PdfLine>()

  const byPage = new Map<number, PdfLine[]>()
  for (const line of lines) {
    const arr = byPage.get(line.page)
    if (arr) arr.push(line)
    else byPage.set(line.page, [line])
  }

  for (const [page, pageLines] of byPage) {
    // Top-most line on the page (largest y).
    let top: PdfLine | null = null
    for (const line of pageLines) {
      if (!top || line.y > top.y) top = line
    }
    if (!top) continue
    // When viewport height is known, require the header to be within the top band.
    if (top.pageHeight > 0 && top.y < top.pageHeight - HEADER_BAND) continue
    if (!PAGE_NUMBER.test(top.text)) continue
    labels.set(page, top.text.replace(/\.$/, ''))
    headerLines.add(top)
  }
  return { labels, headerLines }
}

// ─── Column detection + line classification ─────────────────────────────────

interface Columns {
  leftMargin: number
  /** Absolute x of the dialogue column, or null when not detected. */
  dialogueX: number | null
  /** Absolute x of the character-cue column, or null when not detected. */
  characterX: number | null
}

/**
 * Builds a histogram of line left-edges to locate the action margin and the (more indented)
 * dialogue and character-cue columns. Headings are excluded by the caller so a leading margin
 * scene number does not skew the action margin.
 */
/**
 * Builds an x-left-edge histogram to locate dialogue and character-cue columns. The action margin
 * is anchored from scene-heading x positions when available (headings always sit at the action
 * margin even when the scene body has no action lines).
 */
function detectColumns(bodyLines: PdfLine[], headingMargin: number | null): Columns {
  const counts = new Map<number, number>()
  for (const line of bodyLines) {
    if (line.pageWidth > 0 && line.x > line.pageWidth * 0.75) continue
    const key = Math.round(line.x)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const leftHalf = bodyLines.filter((line) => !line.pageWidth || line.x < line.pageWidth * 0.45)
  const inferredLeft = leftHalf.length
    ? Math.min(...leftHalf.map((line) => Math.round(line.x)))
    : bodyLines.length
      ? Math.min(...bodyLines.map((line) => Math.round(line.x)))
      : 0
  const leftMargin = headingMargin ?? inferredLeft

  const rightPeaks = [...counts.entries()]
    .filter(([x, count]) => count >= 2 && x > leftMargin + DIALOGUE_INDENT_MIN / 2)
    .map(([x]) => x)
    .sort((a, b) => a - b)

  const characterX = rightPeaks.length ? rightPeaks[rightPeaks.length - 1]! : null
  const dialogueX = rightPeaks.length > 1 ? rightPeaks[0]! : null
  return { leftMargin, dialogueX, characterX }
}

/** True when a line reads as a character cue (short, ALL-CAPS, not a heading/transition/continuation). */
function isCharacterName(text: string): boolean {
  const trimmed = text.trim()
  if (SCENE_HEADING.test(trimmed)) return false
  if (TRANSITION.test(trimmed)) return false
  if (isContinuationLine(trimmed)) return false
  if (trimmed.endsWith(':')) return false
  const name = trimmed.replace(/\(.*?\)/g, '').trim()
  if (!name || name.length > 40) return false
  if (!/[A-Z]/.test(name)) return false
  if (/[a-z]/.test(name)) return false
  return true
}

/** True when a line reads as a transition (e.g. "CUT TO:", "FADE OUT."). */
function isTransition(text: string): boolean {
  const trimmed = text.trim()
  if (TRANSITION.test(trimmed)) return true
  // Right-set, ALL-CAPS line ending in "TO:" (e.g. "MATCH CUT TO:").
  return /[A-Z]/.test(trimmed) && !/[a-z]/.test(trimmed) && /TO:$/.test(trimmed)
}

/** Cleans a character cue to a bare role name (strips parentheticals/extensions). */
function cleanCueName(text: string): string {
  return text.replace(/\(.*?\)/g, '').trim()
}

/** Classifies a non-heading, non-header line into a screenplay element type. */
function classifyLine(line: PdfLine, columns: Columns): PdfLineType {
  const { leftMargin, dialogueX, characterX } = columns
  const indent = line.x - leftMargin
  const text = line.text.trim()

  if (indent <= LEFT_MARGIN_TOLERANCE) {
    if (isTransition(text)) return 'transition'
    return 'action'
  }
  if (text.startsWith('(')) return 'parenthetical'
  if (isTransition(text)) return 'transition'

  const characterColX = characterX ?? leftMargin + CHARACTER_INDENT_MIN
  const dialogueColX = dialogueX ?? leftMargin + DIALOGUE_INDENT_MIN
  if (line.x >= characterColX - COLUMN_TOL && isCharacterName(text)) return 'character'
  if (line.x >= dialogueColX - COLUMN_TOL) return 'dialogue'
  return 'unknown'
}

// ─── Eighths from viewport geometry ─────────────────────────────────────────

interface ContentArea {
  top: number
  bottom: number
  height: number
}

/** Per physical page content area: from the viewport when known, else from the text extent. */
function buildContentAreas(lines: PdfLine[]): Map<number, ContentArea> {
  const areas = new Map<number, ContentArea>()
  const textBounds = new Map<number, { top: number; bottom: number; height: number }>()

  for (const line of lines) {
    const tb = textBounds.get(line.page)
    if (!tb) {
      textBounds.set(line.page, { top: line.y, bottom: line.y, height: line.pageHeight })
    } else {
      if (line.y > tb.top) tb.top = line.y
      if (line.y < tb.bottom) tb.bottom = line.y
      if (line.pageHeight > tb.height) tb.height = line.pageHeight
    }
  }

  for (const [page, tb] of textBounds) {
    if (tb.height > 0) {
      const top = tb.height - TOP_MARGIN
      const bottom = BOTTOM_MARGIN
      const height = top - bottom
      if (height > 0) {
        areas.set(page, { top, bottom, height })
        continue
      }
    }
    // Fallback: derive the content area from the text extent on the page.
    areas.set(page, { top: tb.top, bottom: tb.bottom, height: Math.max(0, tb.top - tb.bottom) })
  }
  return areas
}

/**
 * Raw (fractional) eighths a scene occupies across the real pages it spans, prorated by vertical
 * position within each page's content area. Full intermediate pages count as 8.
 */
function rawEighthsByPosition(
  startPage: number,
  startY: number,
  endPage: number,
  endY: number,
  areas: Map<number, ContentArea>
): number {
  let raw = 0
  for (let page = startPage; page <= endPage; page++) {
    const area = areas.get(page)
    if (!area || area.height <= 0) {
      raw += 1
      continue
    }
    const top = page === startPage ? startY : area.top
    const bottom = page === endPage ? endY : area.bottom
    const fraction = Math.min(1, Math.max(0, (top - bottom) / area.height))
    raw += fraction * 8
  }
  return raw
}

// ─── Scene assembly ─────────────────────────────────────────────────────────

interface SceneDraft {
  parsed: ParsedHeading
  startPage: number
  startY: number
  endPage: number
  endY: number
  elements: ScriptElement[]
  characters: string[]
  dialogue: ParsedDialogue[]
  content: string
  rawEighths: number
}

/** Collects ordered, de-duplicated character cues and dialogue from classified scene lines. */
function collectDialogue(
  bodyLines: PdfLine[],
  types: PdfLineType[]
): { characters: string[]; dialogue: ParsedDialogue[] } {
  const characters: string[] = []
  const seen = new Set<string>()
  const dialogue: ParsedDialogue[] = []

  let current: { character: string; parts: string[] } | null = null
  const flush = () => {
    if (current) {
      const text = current.parts.join(' ').trim()
      if (text) dialogue.push({ character: current.character, text })
      current = null
    }
  }

  bodyLines.forEach((line, i) => {
    const type = types[i]
    if (type === 'character') {
      const name = cleanCueName(line.text)
      const key = name.toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        characters.push(name)
      }
      // Stitch (MORE)/(CONT'D): a repeated cue for the current speaker continues the same speech.
      if (current && current.character.toUpperCase() === key) return
      flush()
      current = { character: name, parts: [] }
    } else if (type === 'dialogue') {
      if (current) current.parts.push(line.text)
    } else if (type === 'action' || type === 'scene_heading' || type === 'transition') {
      flush()
    }
    // 'parenthetical' and 'unknown' lines neither extend dialogue text nor reset the speaker.
  })
  flush()

  return { characters, dialogue }
}

/**
 * Parses a standard-format screenplay PDF into scenes.
 *
 * `start_page`/`end_page` use the printed page numbers when present (falling back to the physical
 * index); `page_eighths` is estimated from real viewport geometry with cumulative rounding to
 * avoid drift across long scripts. `start_offset`/`end_offset` are null (PDF text has no single
 * linear source offset). The optional `elements`/`dialogue` fields carry the richer structure.
 */
export async function parsePdfScript(
  data: ArrayBuffer | Uint8Array,
  options?: PdfParseOptions
): Promise<ParsedScene[]> {
  const allLines = await extractPdfLines(data, options)
  if (allLines.length === 0) return []

  const { labels, headerLines } = detectPageLabels(allLines)
  const lines = allLines.filter((line) => !headerLines.has(line))
  if (lines.length === 0) return []

  // Headings first (independent of margin), then columns from the non-heading lines so a leading
  // margin scene number cannot skew the detected action margin.
  const headingParsedByLine = new Map<PdfLine, ParsedHeading>()
  for (const line of lines) {
    const parsed = parseHeadingLine(line.text)
    if (parsed) headingParsedByLine.set(line, parsed)
  }
  const nonHeadingLines = lines.filter((line) => !headingParsedByLine.has(line))
  const headingMargin =
    headingParsedByLine.size > 0
      ? Math.min(...[...headingParsedByLine.keys()].map((line) => Math.round(line.x)))
      : null
  const columns = detectColumns(nonHeadingLines, headingMargin)

  // Final heading indices: those near the left margin (allowing the margin scene number to sit
  // further left than the action margin).
  const headingIndices: number[] = []
  lines.forEach((line, index) => {
    if (!headingParsedByLine.has(line)) return
    if (line.x > columns.leftMargin + LEFT_MARGIN_TOLERANCE) return
    headingIndices.push(index)
  })

  const areas = buildContentAreas(lines)
  const pageLabel = (page: number): string => labels.get(page) ?? String(page)

  const drafts: SceneDraft[] = []
  for (let h = 0; h < headingIndices.length; h++) {
    const startIndex = headingIndices[h]!
    const endIndex = h + 1 < headingIndices.length ? headingIndices[h + 1]! : lines.length

    const headingLine = lines[startIndex]!
    const parsed = headingParsedByLine.get(headingLine)!
    const sceneLines = lines.slice(startIndex, endIndex)
    const bodyLines = sceneLines.slice(1)

    const bodyTypes = bodyLines.map((line) => classifyLine(line, columns))
    const { characters, dialogue } = collectDialogue(bodyLines, bodyTypes)

    const elements: ScriptElement[] = [
      { type: 'scene_heading', text: headingLine.text, page: headingLine.page },
      ...bodyLines.map((line, i) => ({ type: bodyTypes[i]!, text: line.text, page: line.page })),
    ]

    const startPage = headingLine.page
    const lastLine = sceneLines[sceneLines.length - 1]!
    const endPage = lastLine.page
    const nextHeadingLine = h + 1 < headingIndices.length ? lines[headingIndices[h + 1]!]! : null
    const endY =
      nextHeadingLine && nextHeadingLine.page === endPage
        ? nextHeadingLine.y
        : lastLine.y

    drafts.push({
      parsed,
      startPage,
      startY: headingLine.y,
      endPage,
      endY,
      elements,
      characters: characters.length > 0 ? characters : extractCharacterCues(bodyLines.map((l) => l.text).join('\n')),
      dialogue,
      content: sceneLines.map((line) => line.text).join('\n'),
      rawEighths: rawEighthsByPosition(startPage, headingLine.y, endPage, endY, areas),
    })
  }

  // Cumulative rounding: distribute fractional eighths so totals do not drift across the script.
  const scenes: ParsedScene[] = []
  let cumulative = 0
  drafts.forEach((draft, index) => {
    const before = Math.round(cumulative)
    cumulative += draft.rawEighths
    const eighths = Math.max(1, Math.round(cumulative) - before)

    scenes.push({
      scene_number: draft.parsed.sceneNumber ?? String(index + 1),
      title: draft.parsed.title,
      location: extractLocationFromSlug(draft.parsed.title),
      int_ext: inferIntExt(draft.parsed.headingText),
      day_night: inferDayNight(draft.parsed.title),
      content: draft.content || null,
      page_eighths: eighths,
      start_page: pageLabel(draft.startPage),
      end_page: pageLabel(draft.endPage),
      start_offset: null,
      end_offset: null,
      characters: draft.characters,
      elements: draft.elements,
      dialogue: draft.dialogue,
    })
  })
  return scenes
}
