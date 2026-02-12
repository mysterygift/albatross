/**
 * Script parser types. Implementations: TxtParser (INT./EXT.), PdfParser (future).
 */

export type IntExt = 'INT' | 'EXT' | 'MIXED' | 'UNK'
export type DayNight = 'DAY' | 'NIGHT' | 'MIXED' | 'UNK'

export interface ParsedScene {
  scene_number: string
  title: string
  int_ext?: IntExt | null
  day_night?: DayNight | null
}

export type ParserInput =
  | { type: 'text'; content: string }
  | { type: 'pdf'; buffer: ArrayBuffer }

/** Parser interface: add PDF parser later without changing UI. */
export interface ScriptParser {
  /** Parse script content into scenes. PDF parser may throw "not implemented". */
  parse(input: ParserInput): Promise<ParsedScene[]>
}
