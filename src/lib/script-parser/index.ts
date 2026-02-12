/**
 * Script parser: Parser interface + TxtParser. PDF parser can be added later.
 */
export type { ScriptParser, ParsedScene, ParserInput } from './types'
export { parseTxtScript } from './txt-parser'

import type { ScriptParser, ParserInput, ParsedScene } from './types'
import { parseTxtScript } from './txt-parser'

const txtParser: ScriptParser = {
  async parse(input: ParserInput): Promise<ParsedScene[]> {
    if (input.type === 'text') return parseTxtScript(input.content)
    if (input.type === 'pdf') {
      throw new Error('PDF parsing not implemented yet. Use text paste or attach a .txt file.')
    }
    return []
  },
}

export const defaultParser: ScriptParser = txtParser
