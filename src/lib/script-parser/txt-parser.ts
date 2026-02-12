/**
 * Naive script parser: new scene when a line starts with INT. or EXT. (case-insensitive).
 * Extracts int_ext and scene heading as title. Scene number is incremental if not found.
 */
import type { ParsedScene, IntExt, DayNight } from './types'

const SCENE_HEADING = /^(INT\.|EXT\.|I\/E\.|INT\/EXT\.)\s*(.+)/i

function inferIntExt(heading: string): IntExt | null {
  const u = heading.toUpperCase()
  if (u.startsWith('INT.') || u.startsWith('INT ')) return 'INT'
  if (u.startsWith('EXT.') || u.startsWith('EXT ')) return 'EXT'
  if (u.startsWith('I/E') || u.startsWith('INT/EXT')) return 'MIXED'
  return null
}

function inferDayNight(title: string): DayNight | null {
  const u = title.toUpperCase()
  if (/\bDAY\b/.test(u) && !/\bNIGHT\b/.test(u)) return 'DAY'
  if (/\bNIGHT\b/.test(u)) return 'NIGHT'
  if (/\bDAY\b/.test(u) && /\bNIGHT\b/.test(u)) return 'MIXED'
  return null
}

export function parseTxtScript(content: string): ParsedScene[] {
  const lines = content.split(/\r?\n/)
  const scenes: ParsedScene[] = []
  let sceneNum = 1
  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(SCENE_HEADING)
    if (match) {
      const fullHeading = trimmed
      const title = (match[2] ?? trimmed).trim() || fullHeading
      scenes.push({
        scene_number: String(sceneNum++),
        title,
        int_ext: inferIntExt(fullHeading),
        day_night: inferDayNight(title),
      })
    }
  }
  return scenes
}
