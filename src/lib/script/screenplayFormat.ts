/**
 * Standard screenplay formatting for script text (used by the sides PDF and its on-screen preview).
 *
 * Stored `script_pages.content` keeps element blocks separated by blank lines (see
 * `joinScriptElements`) but not their types or indentation. This module re-classifies that text
 * into screenplay elements using the parser's own heading / transition / character-cue rules, wraps
 * each element to the standard US Letter widths (Courier 12pt, 10 characters per inch), and pages
 * the result with the usual script conventions: no orphaned headings or character cues, and
 * dialogue split across pages with (MORE) / (CONT'D).
 *
 * Pure and measure-free: Courier is monospaced, so every width is a character count.
 */
import {
  SCENE_HEADING,
  TRANSITION,
  isCharacterCueLine,
  isContinuationLine,
  stripContinuation,
} from '@/lib/script-parser/common'

export type ScreenplayElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'

export type ScreenplayRowType = ScreenplayElementType | 'more' | 'note' | 'blank'

export interface ScreenplayRow {
  type: ScreenplayRowType
  text: string
  /** Scene number printed in both margins of a scene-heading row. */
  sceneNumber?: string | null
}

export interface ScreenplayBlock {
  kind: 'scene_heading' | 'action' | 'speech' | 'transition' | 'note'
  rows: ScreenplayRow[]
  /** Blank lines before this block (dropped at the top of a page). */
  spaceBefore: number
  /** Running-header context (e.g. episode name) for the page this block starts on. */
  group?: string | null
}

export interface ScreenplayPage {
  rows: ScreenplayRow[]
  group: string | null
}

/** Points per inch; Courier 12pt is 10 characters per inch, one line per 12pt. */
const INCH = 72

/**
 * Standard US Letter screenplay geometry (Final Draft defaults). `left` is measured from the page's
 * left edge in points; `width` is in characters.
 */
export const SCREENPLAY_LAYOUT = {
  pageWidth: 8.5 * INCH,
  pageHeight: 11 * INCH,
  fontSize: 12,
  lineHeight: 12,
  charWidth: 7.2,
  marginTop: 1 * INCH,
  marginBottom: 1 * INCH,
  /** Lines in the body area between the 1" top and bottom margins. */
  linesPerPage: 54,
  /** Left edge of the action column; every other column is measured from here. */
  bodyLeft: 1.5 * INCH,
  /** Right edge of the action column; transitions right-align to it. */
  bodyRight: 7.5 * INCH,
  sceneNumberLeft: 0.75 * INCH,
  sceneNumberRight: 7.75 * INCH,
  columns: {
    scene_heading: { left: 1.5 * INCH, width: 60 },
    action: { left: 1.5 * INCH, width: 60 },
    character: { left: 3.5 * INCH, width: 38 },
    parenthetical: { left: 3.0 * INCH, width: 25 },
    dialogue: { left: 2.5 * INCH, width: 35 },
    transition: { left: 1.5 * INCH, width: 60 },
    more: { left: 3.5 * INCH, width: 38 },
    note: { left: 1.5 * INCH, width: 60 },
    blank: { left: 1.5 * INCH, width: 60 },
  } satisfies Record<ScreenplayRowType, { left: number; width: number }>,
} as const

/** Indent of a row type from the action column, in characters (for the on-screen preview). */
export function screenplayIndentChars(type: ScreenplayRowType): number {
  return Math.round((SCREENPLAY_LAYOUT.columns[type].left - SCREENPLAY_LAYOUT.bodyLeft) / SCREENPLAY_LAYOUT.charWidth)
}

// ─── Classification ─────────────────────────────────────────────────────────

interface ScreenplayElement {
  type: ScreenplayElementType
  /** Source lines, trimmed (kept so already-formatted scripts keep their own line breaks). */
  lines: string[]
}

/** Margin scene number printed before a heading, e.g. "12 INT. KITCHEN - DAY 12". */
const LEADING_SCENE_NUMBER = /^([0-9]+[A-Za-z]?|[A-Za-z][0-9]+[A-Za-z]?)\s+(?=INT|EXT|EST|I\/E|E\/I)/i
const TRAILING_SCENE_NUMBER = /\s+[0-9]+[A-Za-z]?$/
/** Any upper-case "... TO:" transition the parser's list doesn't name (e.g. "JUMP CUT TO:"). */
const GENERIC_TRANSITION = /^[A-Z][A-Z\s.'-]*\bTO:$/
const CONT_D = /\(\s*CONT(?:'D|D|INUED)\s*\)/i

function isSceneHeadingLine(line: string): boolean {
  return SCENE_HEADING.test(line.replace(LEADING_SCENE_NUMBER, ''))
}

/** Heading text without margin scene numbers or continuation tags, upper-cased. */
export function cleanSceneHeading(line: string): string {
  let text = line.trim().replace(LEADING_SCENE_NUMBER, '')
  text = stripContinuation(text).replace(TRAILING_SCENE_NUMBER, '')
  return stripContinuation(text).toUpperCase()
}

/** Transitions are upper case in a script; "Back to work." is action. */
function isTransitionLine(line: string): boolean {
  if (/[a-z]/.test(line)) return false
  return TRANSITION.test(line) || GENERIC_TRANSITION.test(line)
}

function paragraphs(text: string): string[][] {
  const out: string[][] = []
  let current: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    // Page-break furniture ((MORE), CONTINUED:) from the source pages is re-created when paging.
    if (line && isContinuationLine(line)) continue
    if (!line) {
      if (current.length) out.push(current)
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) out.push(current)
  return out
}

/** Splits a speech's body into parenthetical and dialogue runs, in order. */
function speechElements(lines: readonly string[]): ScreenplayElement[] {
  const out: ScreenplayElement[] = []
  let inParen = false
  for (const line of lines) {
    const type: ScreenplayElementType = inParen || line.startsWith('(') ? 'parenthetical' : 'dialogue'
    if (type === 'parenthetical') inParen = !line.endsWith(')')
    const last = out[out.length - 1]
    // A new "(" starts a new parenthetical even straight after another one.
    if (last && last.type === type && !(type === 'parenthetical' && line.startsWith('('))) {
      last.lines.push(line)
    } else {
      out.push({ type, lines: [line] })
    }
  }
  return out
}

/** Classifies script text into screenplay elements, in reading order. */
export function screenplayElementsFromText(text: string): ScreenplayElement[] {
  const elements: ScreenplayElement[] = []
  for (const para of paragraphs(text)) {
    let lines = para
    // A heading may share a paragraph with the first action lines; split it off.
    while (lines.length > 0 && isSceneHeadingLine(lines[0]!)) {
      elements.push({ type: 'scene_heading', lines: [lines[0]!] })
      lines = lines.slice(1)
    }
    if (lines.length === 0) continue
    // PDF page text can put a transition straight after action with no blank line.
    let trailingTransition: string | null = null
    if (lines.length > 1 && isTransitionLine(lines[lines.length - 1]!)) {
      trailingTransition = lines[lines.length - 1]!
      lines = lines.slice(0, -1)
    }
    if (lines.length === 1 && isTransitionLine(lines[0]!)) {
      elements.push({ type: 'transition', lines })
    } else if (lines.length > 1 && isCharacterCueLine(lines[0]!)) {
      elements.push({ type: 'character', lines: [lines[0]!] })
      elements.push(...speechElements(lines.slice(1)))
    } else {
      elements.push({ type: 'action', lines })
    }
    if (trailingTransition) elements.push({ type: 'transition', lines: [trailingTransition] })
  }
  return elements
}

// ─── Wrapping ───────────────────────────────────────────────────────────────

/** Word-wraps to `width` characters, hard-breaking words longer than a line. */
export function wrapToWidth(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let word of words) {
    while (word.length > width) {
      if (line) {
        lines.push(line)
        line = ''
      }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!line) line = word
    else if (line.length + 1 + word.length <= width) line = `${line} ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Keeps the source's own line breaks when every line already fits (a properly formatted script);
 * otherwise reflows the element, which happens for TXT imports with one paragraph per line.
 */
function fitLines(lines: readonly string[], width: number): string[] {
  if (lines.every((l) => l.length <= width)) return [...lines]
  return wrapToWidth(lines.join(' '), width)
}

/** Parentheticals hang their wrapped lines one character in, under the text after "(". */
function fitParenthetical(lines: readonly string[]): string[] {
  const width = SCREENPLAY_LAYOUT.columns.parenthetical.width
  const text = lines.join(' ')
  if (text.length <= width) return [text]
  const [first, ...rest] = wrapToWidth(text, width)
  return [first!, ...wrapToWidth(rest.join(' '), width - 1).map((l) => ` ${l}`)]
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

function rowsFor(type: ScreenplayElementType, lines: readonly string[]): ScreenplayRow[] {
  const width = SCREENPLAY_LAYOUT.columns[type].width
  switch (type) {
    case 'parenthetical':
      return fitParenthetical(lines).map((text) => ({ type, text }))
    case 'character':
    case 'transition':
      return wrapToWidth(lines.join(' ').toUpperCase(), width).map((text) => ({ type, text }))
    case 'scene_heading':
      return wrapToWidth(cleanSceneHeading(lines.join(' ')), width).map((text) => ({ type, text }))
    default:
      return fitLines(lines, width).map((text) => ({ type, text }))
  }
}

/**
 * Formats one scene for sides: its heading (with the scene number in both margins), any notes,
 * then the script body as screenplay blocks. The script's own heading wording wins over the
 * computed slugline that collation prepends when it can't find one in the body.
 */
export function formatSceneForScreenplay(scene: {
  sceneNumber: string | null
  /** Fallback slugline when the text has no heading of its own. */
  heading: string | null
  text: string | null
  notes?: string[]
  group?: string | null
}): ScreenplayBlock[] {
  const elements = scene.text ? screenplayElementsFromText(scene.text) : []
  let headingLine = scene.heading ?? (scene.sceneNumber ? `SCENE ${scene.sceneNumber}` : 'SCENE')
  while (elements[0]?.type === 'scene_heading') headingLine = elements.shift()!.lines[0]!

  const headingRows = rowsFor('scene_heading', [headingLine])
  headingRows[0]!.sceneNumber = scene.sceneNumber
  const blocks: ScreenplayBlock[] = [{ kind: 'scene_heading', rows: headingRows, spaceBefore: 1, group: scene.group }]
  for (const note of scene.notes ?? []) {
    blocks.push({ kind: 'note', rows: [{ type: 'note', text: note }], spaceBefore: 1, group: scene.group })
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!
    if (el.type === 'character') {
      const rows = rowsFor('character', el.lines)
      while (elements[i + 1] && (elements[i + 1]!.type === 'parenthetical' || elements[i + 1]!.type === 'dialogue')) {
        i += 1
        rows.push(...rowsFor(elements[i]!.type, elements[i]!.lines))
      }
      blocks.push({ kind: 'speech', rows, spaceBefore: 1, group: scene.group })
      continue
    }
    // A stray parenthetical or dialogue run (no cue) still sits in its own column.
    const kind = el.type === 'scene_heading' || el.type === 'transition' ? el.type : 'action'
    blocks.push({ kind, rows: rowsFor(el.type, el.lines), spaceBefore: 1, group: scene.group })
  }
  return blocks
}

// ─── Pagination ─────────────────────────────────────────────────────────────

const BLANK: ScreenplayRow = { type: 'blank', text: '' }
/** Fewest lines of a split action paragraph or speech left on either side of a page break. */
const MIN_SPLIT_LINES = 2

function continuedCue(cue: string): string {
  return CONT_D.test(cue) ? cue : `${cue} (CONT'D)`
}

/** Lines a block needs on the current page so a heading or cue isn't left alone at the bottom. */
function keepTogetherLines(blocks: readonly ScreenplayBlock[], index: number, space: number): number {
  const block = blocks[index]!
  let need = space + block.rows.length
  if (block.kind === 'speech') return space + Math.min(block.rows.length, 1 + MIN_SPLIT_LINES + 1)
  if (block.kind !== 'scene_heading') return need
  for (let j = index + 1; j < blocks.length; j++) {
    const next = blocks[j]!
    if (next.kind === 'scene_heading') break
    if (next.kind === 'note') {
      need += next.spaceBefore + next.rows.length
      continue
    }
    need += next.spaceBefore + Math.min(next.rows.length, MIN_SPLIT_LINES)
    break
  }
  return need
}

/**
 * Where to break a speech that doesn't fit in `room` lines (one of which is taken by (MORE)), or
 * null when it can't be split well there. Never ends a page on a parenthetical.
 */
function speechSplitIndex(rows: readonly ScreenplayRow[], room: number, force: boolean): number | null {
  let k = Math.min(room - 1, rows.length - 1)
  while (k > 1 && rows[k - 1]!.type === 'parenthetical') k -= 1
  if (force) return Math.max(k, 2)
  if (k - 1 < MIN_SPLIT_LINES || rows.length - k < MIN_SPLIT_LINES) return null
  return k
}

/**
 * Lays blocks out onto script pages. `firstPageLines` leaves room on page one for a cover block.
 */
export function paginateScreenplay(
  blocks: readonly ScreenplayBlock[],
  options: { linesPerPage?: number; firstPageLines?: number } = {}
): ScreenplayPage[] {
  const linesPerPage = options.linesPerPage ?? SCREENPLAY_LAYOUT.linesPerPage
  const pages: ScreenplayPage[] = []
  let rows: ScreenplayRow[] = []
  let group: string | null = null
  let capacity = Math.max(1, Math.min(options.firstPageLines ?? linesPerPage, linesPerPage))

  const breakPage = (): void => {
    pages.push({ rows, group })
    rows = []
    group = null
    capacity = linesPerPage
  }
  const place = (block: ScreenplayBlock, blockRows: readonly ScreenplayRow[], space: number): void => {
    if (rows.length === 0) group = block.group ?? null
    for (let s = 0; s < space; s++) rows.push(BLANK)
    rows.push(...blockRows)
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    let pending: ScreenplayRow[] = block.rows
    let first = true
    while (pending.length > 0) {
      const space = rows.length === 0 ? 0 : first ? block.spaceBefore : 0
      const room = capacity - rows.length - space
      const fits = pending.length <= room
      const keep = first ? keepTogetherLines(blocks, i, space) : space + pending.length
      if (fits && (keep <= capacity - rows.length || rows.length === 0)) {
        place(block, pending, space)
        break
      }
      const pageEmpty = rows.length === 0
      if (block.kind === 'action' && !fits) {
        const take = pageEmpty ? room : room >= MIN_SPLIT_LINES && pending.length - room >= MIN_SPLIT_LINES ? room : 0
        if (take > 0) {
          place(block, pending.slice(0, take), space)
          pending = pending.slice(take)
          first = false
          breakPage()
          continue
        }
      } else if (block.kind === 'speech' && !fits) {
        const k = speechSplitIndex(pending, room, pageEmpty)
        if (k != null) {
          place(block, [...pending.slice(0, k), { type: 'more', text: '(MORE)' }], space)
          pending = [{ type: 'character', text: continuedCue(pending[0]!.text) }, ...pending.slice(k)]
          first = false
          breakPage()
          continue
        }
      }
      if (pageEmpty) {
        // Taller than a page and not splittable (a very long heading): let it run on.
        place(block, pending, space)
        break
      }
      breakPage()
    }
  }
  if (rows.length > 0 || pages.length === 0) pages.push({ rows, group })
  return pages
}
