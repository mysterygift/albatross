/**
 * Script parser: Parser interface + TxtParser + PdfParser.
 */
export type {
  ScriptParser,
  ParsedScene,
  ParserInput,
  IntExt,
  DayNight,
  PdfLineType,
  ScriptElement,
  ParsedDialogue,
} from './types'
export { parseTxtScript, estimateSceneEighths, extractCharacterCues } from './txt-parser'
export { extractLocationFromSlug, formatSceneHeading } from './common'
export { parsePdfScript, extractPdfLines, PdfParseError } from './pdf-parser'
export type { PdfParseErrorCode, PdfParseOptions, PdfLine } from './pdf-parser'
export { parsePdfScriptInWorker } from './pdf-parse-worker-client'
export type { ParsePdfInWorkerOptions } from './pdf-parse-worker-client'

import type { ScriptParser, ParserInput, ParsedScene } from './types'
import { parseTxtScript } from './txt-parser'
import { parsePdfScript } from './pdf-parser'

const scriptParser: ScriptParser = {
  async parse(input: ParserInput): Promise<ParsedScene[]> {
    if (input.type === 'text') return parseTxtScript(input.content)
    if (input.type === 'pdf') return parsePdfScript(input.buffer)
    return []
  },
}

export const defaultParser: ScriptParser = scriptParser
