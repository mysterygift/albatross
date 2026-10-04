/**
 * Script elements for lining (SS6): splits a script page's text into the blocks a tramline is drawn
 * against — scene heading, action paragraph, dialogue speech (cue + lines, parentheticals kept inline),
 * transition.
 *
 * Works on stored `script_pages.content`, which separates element blocks with blank lines for both PDF
 * imports (`joinScriptElements`) and TXT imports, so new and previously imported scripts get the same
 * result. Uses the parser's own heading / transition / character-cue rules.
 */
import {
  SCENE_HEADING,
  TRANSITION,
  isCharacterCueLine,
  isContinuationLine,
  stripContinuation,
} from '@/lib/script-parser/common'

export type ScriptElementType = 'scene_heading' | 'action' | 'dialogue' | 'transition'

export type ScriptElementBlock = {
  element_type: ScriptElementType
  /** Speaker for dialogue blocks (continuation markers removed). */
  character_name: string | null
  text: string
}

function paragraphs(text: string): string[][] {
  const out: string[][] = []
  let current: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    // Page-break furniture ((MORE), CONTINUED:) is never something a shot covers.
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

/** Splits one page of a scene into lining blocks, in reading order. */
export function blocksFromPageText(text: string): ScriptElementBlock[] {
  const blocks: ScriptElementBlock[] = []
  for (const para of paragraphs(text)) {
    let lines = para
    // A heading may share a paragraph with the first action lines; split it off.
    if (SCENE_HEADING.test(lines[0]!)) {
      blocks.push({ element_type: 'scene_heading', character_name: null, text: lines[0]! })
      lines = lines.slice(1)
      if (lines.length === 0) continue
    }
    // PDF page text puts a transition straight after action with no blank line; split it off.
    let trailingTransition: string | null = null
    if (lines.length > 1 && TRANSITION.test(lines[lines.length - 1]!)) {
      trailingTransition = lines[lines.length - 1]!
      lines = lines.slice(0, -1)
    }
    if (lines.length === 1 && TRANSITION.test(lines[0]!)) {
      blocks.push({ element_type: 'transition', character_name: null, text: lines[0]! })
    } else if (isCharacterCueLine(lines[0]!) && lines.length > 1) {
      const cue = stripContinuation(lines[0]!.replace(/\((?:CONT'?D|CONTINUED|MORE)\)/gi, '')).trim()
      blocks.push({ element_type: 'dialogue', character_name: cue || lines[0]!, text: lines.slice(1).join('\n') })
    } else {
      blocks.push({ element_type: 'action', character_name: null, text: lines.join('\n') })
    }
    if (trailingTransition) blocks.push({ element_type: 'transition', character_name: null, text: trailingTransition })
  }
  return blocks
}
