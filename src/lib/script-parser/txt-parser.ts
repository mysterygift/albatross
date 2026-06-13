/**
 * Naive script parser: new scene when a line starts with INT. or EXT. (case-insensitive).
 * Extracts int_ext and scene heading as title. Scene number is incremental if not found.
 *
 * Beyond scene headings the parser also makes a best-effort attempt at richer metadata used
 * by SB1 section generation: per-scene body text, estimated length in eighths, best-effort
 * page spans/offsets, and uppercase character cues. None of this is exact pagination — it is
 * derived heuristically from the plain text and is intended only as a starting point that the
 * user can refine. See `estimateSceneEighths` for the line-count heuristic.
 *
 * Format-agnostic heuristics shared with the PDF parser live in `./common`.
 */
import type { ParsedScene } from './types'
import {
  EIGHTHS_PER_PAGE,
  SCENE_HEADING,
  estimateSceneEighths,
  extractCharacterCues,
  extractLocationFromSlug,
  inferDayNight,
  inferIntExt,
  stripContinuation,
} from './common'

// Re-exported for backwards compatibility with existing import paths.
export { estimateSceneEighths, extractCharacterCues } from './common'

export function parseTxtScript(content: string): ParsedScene[] {
  const lines = content.split(/\r?\n/)

  // Best-effort character offsets of each line within the original content. Uses a single
  // '\n' per split which is approximate for CRLF sources, but adequate for section ranges.
  const lineOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineOffsets.push(offset)
    offset += line.length + 1
  }

  const headingLineIdx: number[] = []
  lines.forEach((line, i) => {
    if (SCENE_HEADING.test(line.trim())) headingLineIdx.push(i)
  })

  const scenes: ParsedScene[] = []
  let sceneNum = 1
  let cumulativeEighths = 0

  for (let h = 0; h < headingLineIdx.length; h++) {
    const startLine = headingLineIdx[h]!
    const endLine = h + 1 < headingLineIdx.length ? headingLineIdx[h + 1]! : lines.length

    const headingText = lines[startLine]!.trim()
    const match = headingText.match(SCENE_HEADING)
    const title = stripContinuation((match?.[2] ?? headingText).trim()) || headingText

    const bodyLines = lines.slice(startLine + 1, endLine)
    const sceneText = lines.slice(startLine, endLine).join('\n').trim() || null
    const pageEighths = estimateSceneEighths(bodyLines.length)

    const startPage = Math.floor(cumulativeEighths / EIGHTHS_PER_PAGE) + 1
    cumulativeEighths += pageEighths
    const endPage = Math.max(startPage, Math.ceil(cumulativeEighths / EIGHTHS_PER_PAGE))

    const startOffset = lineOffsets[startLine] ?? null
    const endOffset = endLine < lines.length ? (lineOffsets[endLine] ?? null) : content.length

    scenes.push({
      scene_number: String(sceneNum++),
      title,
      location: extractLocationFromSlug(title),
      int_ext: inferIntExt(headingText),
      day_night: inferDayNight(title),
      content: sceneText,
      page_eighths: pageEighths,
      start_page: String(startPage),
      end_page: String(endPage),
      start_offset: startOffset,
      end_offset: endOffset,
      characters: extractCharacterCues(bodyLines.join('\n')),
    })
  }
  return scenes
}
