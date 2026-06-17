/**
 * Script parser types. Implementations: TxtParser (INT./EXT.), PdfParser (future).
 */

export type IntExt = 'INT' | 'EXT' | 'MIXED'
export type DayNight = 'DAY' | 'NIGHT' | 'MIXED' | 'DAWN' | 'DUSK' | 'TIMELESS'

/** Screenplay element type produced by the layout-aware PDF classifier. */
export type PdfLineType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'page_header'
  | 'unknown'

/** A classified line of a parsed scene (in-memory only; not persisted). */
export interface ScriptElement {
  type: PdfLineType
  text: string
  /** 1-based physical page index the element appears on. */
  page: number
}

/** A contiguous block of dialogue attributed to a character (in-memory only; not persisted). */
export interface ParsedDialogue {
  character: string
  text: string
}

export interface ParsedScene {
  scene_number: string
  title: string
  /** Location/set name extracted from the slugline (before time-of-day modifiers). */
  location?: string | null
  int_ext?: IntExt | null
  day_night?: DayNight | null
  /** Raw scene body text (lines between this heading and the next), when captured. */
  content?: string | null
  /** Estimated scene length in eighths of a page (8 = one full page). */
  page_eighths?: number | null
  /** Best-effort 1-based page number where the scene begins. */
  start_page?: string | null
  /** Best-effort 1-based page number where the scene ends. */
  end_page?: string | null
  /** Character offset of the scene heading within the source text. */
  start_offset?: number | null
  /** Character offset of the end of the scene within the source text. */
  end_offset?: number | null
  /** Uppercase character cues detected within the scene body, de-duplicated. */
  characters?: string[]
  /**
   * Classified screenplay elements for the scene (PDF parser only). In-memory only — these are
   * not persisted by the SB1 section generator and are intended for preview/inspection.
   */
  elements?: ScriptElement[]
  /** Dialogue blocks attributed to characters (PDF parser only). In-memory only; not persisted. */
  dialogue?: ParsedDialogue[]
}

export type ParserInput =
  | { type: 'text'; content: string }
  | { type: 'pdf'; buffer: ArrayBuffer }

/** Parser interface: dispatches to the TXT or PDF parser by input type. */
export interface ScriptParser {
  /** Parse script content into scenes (text paste or PDF buffer). */
  parse(input: ParserInput): Promise<ParsedScene[]>
}
