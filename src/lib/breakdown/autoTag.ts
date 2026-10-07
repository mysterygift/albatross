/**
 * Tag suggestions the script already implies, using the parser's own rules: a Cast tag on the first cue of
 * each speaking character, and a Locations tag on the location in the scene heading. Suggestions already
 * covered by a tag of the same category are left out. Pure.
 */
import type { SceneLine } from '@/lib/db/scriptSectionLayout'
import type { BreakdownCategory } from '@/lib/db/types'
import { SCENE_HEADING, extractLocationFromSlug, isCharacterCueLine } from '@/lib/script-parser/common'
import { normalizeNameKey } from '@/lib/text/similarity'
import type { PageTextRange } from './selection'

export type TagSuggestion = {
  key: string
  category: BreakdownCategory
  text: string
  range: PageTextRange
}

/** Location named in a scene heading ("EXT. BEACH - DAY" → "BEACH"), or null when the text is not a heading. */
export function locationFromHeading(heading: string): string | null {
  const m = SCENE_HEADING.exec(heading.trim())
  return m ? extractLocationFromSlug(m[2]!) : null
}

function rangeOnLine(line: SceneLine, start: number, length: number): PageTextRange {
  return {
    startPageId: line.pageId,
    startOffset: line.startOffset + start,
    endPageId: line.pageId,
    endOffset: line.startOffset + start + length,
  }
}

export function suggestSceneTags(
  lines: readonly SceneLine[],
  /** Names (any case) already tagged in the scene, per category. */
  taggedNames: ReadonlyMap<BreakdownCategory, ReadonlySet<string>>
): TagSuggestion[] {
  const already = (category: BreakdownCategory, name: string) =>
    [...(taggedNames.get(category) ?? [])].some((n) => normalizeNameKey(n) === normalizeNameKey(name))
  const out: TagSuggestion[] = []
  const seen = new Set<string>()

  const heading = lines.find((l) => SCENE_HEADING.test(l.text.trim()))
  if (heading) {
    const location = locationFromHeading(heading.text)
    const at = location ? heading.text.indexOf(location) : -1
    if (location && at >= 0 && !already('locations', location)) {
      out.push({ key: `locations|${normalizeNameKey(location)}`, category: 'locations', text: location, range: rangeOnLine(heading, at, location.length) })
    }
  }

  for (const line of lines) {
    if (!isCharacterCueLine(line.text)) continue
    const name = line.text.replace(/\(.*?\)/g, '').trim()
    const key = normalizeNameKey(name)
    if (!name || seen.has(key) || already('cast', name)) continue
    seen.add(key)
    const at = line.text.indexOf(name)
    out.push({ key: `cast|${key}`, category: 'cast', text: name, range: rangeOnLine(line, at, name.length) })
  }
  return out
}
