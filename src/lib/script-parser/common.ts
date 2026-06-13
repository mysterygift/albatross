/**
 * Shared script-parsing heuristics used by both the TXT and PDF parsers.
 *
 * These are deliberately format-agnostic: scene-heading detection, INT/EXT and DAY/NIGHT
 * inference, the eighths length estimate, and uppercase character-cue extraction. None of this
 * is exact pagination — it is derived heuristically and is intended as a starting point that the
 * user can refine.
 */
import type { IntExt, DayNight } from './types'

/**
 * Matches a scene-heading prefix and captures the remaining heading.
 *
 * Accepts the common standard-format variants with or without a trailing period:
 * `INT`, `EXT`, `EST`, `INT./EXT.`, `EXT./INT.`, `INT/EXT`, `EXT/INT`, `I/E`, `E/I`. The
 * `(?=[\s.])` lookahead requires a separator after the prefix so `INTERIOR`/`EXTRA` are not
 * misread as sluglines. Group 2 is the rest of the heading (location + time-of-day).
 */
export const SCENE_HEADING =
  /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E|E\/I|INT|EXT|EST)(?=[\s.])\.?\s*(.+)/i

/** Common transition cues that should not be mistaken for character cues. */
export const TRANSITION = /^(CUT TO|FADE (IN|OUT|TO)|DISSOLVE TO|SMASH CUT|MATCH CUT|BACK TO)\b/i

/**
 * Matches a "continuation" marker used around page breaks: `(MORE)`, `(CONT'D)`, `(CONTINUED)`,
 * or a bare `CONTINUED:` line. Case-insensitive.
 */
export const CONTINUATION = /\(?\s*(?:MORE|CONT(?:INUED|'D|D)?)\s*\)?\s*:?/i
/** A standalone continuation line (whole line is just the marker). */
const STANDALONE_CONTINUATION = /^\(?\s*(?:MORE|CONT(?:INUED|'D|D)?)\s*\)?\s*:?$/i
/** A continuation marker appended to the end of a line (e.g. a heading "... - DAY (CONTINUED)"). */
const TRAILING_CONTINUATION = /\s*\(?\s*(?:CONTINUED|CONT(?:'D|D)?)\s*\)?\s*:?\s*$/i

/** Heuristic: a standard screenplay page is ~56 lines and counts as 8 eighths. */
export const LINES_PER_PAGE = 56
export const EIGHTHS_PER_PAGE = 8

export function inferIntExt(heading: string): IntExt | null {
  const u = heading.toUpperCase()
  // Combined interior/exterior forms must be checked before the plain INT/EXT prefixes.
  if (
    u.startsWith('INT/EXT') ||
    u.startsWith('INT./EXT') ||
    u.startsWith('EXT/INT') ||
    u.startsWith('EXT./INT') ||
    u.startsWith('I/E') ||
    u.startsWith('E/I')
  ) {
    return 'MIXED'
  }
  if (u.startsWith('INT')) return 'INT'
  // EST (establishing) shots are exterior by convention.
  if (u.startsWith('EXT') || u.startsWith('EST')) return 'EXT'
  return null
}

/** Removes a trailing continuation marker (e.g. "(CONTINUED)", "(CONT'D)") from a heading/title. */
export function stripContinuation(text: string): string {
  return text.replace(TRAILING_CONTINUATION, '').trim()
}

/** True when the whole line is just a continuation marker. */
export function isContinuationLine(text: string): boolean {
  return STANDALONE_CONTINUATION.test(text.trim())
}

export function inferDayNight(title: string): DayNight | null {
  const u = title.toUpperCase()
  if (/\bDAY\b/.test(u) && !/\bNIGHT\b/.test(u)) return 'DAY'
  if (/\bNIGHT\b/.test(u)) return 'NIGHT'
  if (/\bDAY\b/.test(u) && /\bNIGHT\b/.test(u)) return 'MIXED'
  return null
}

/** Time-of-day segment tokens peeled from the end of a slugline when extracting location. */
const TIME_SEGMENT =
  /^(DAY|NIGHT|DAWN|DUSK|MORNING|AFTERNOON|EVENING|SUNRISE|SUNSET|CONTINUOUS|LATER|SAME|MOMENTS LATER)$/i

function isTimeSegment(segment: string): boolean {
  return TIME_SEGMENT.test(segment.trim())
}

/**
 * Extracts the location/set name from a slugline remainder (after INT./EXT. prefix).
 * Splits on " - ", peels trailing time-of-day segments, and joins the rest.
 */
export function extractLocationFromSlug(slug: string): string | null {
  const cleaned = stripContinuation(slug.trim())
  if (!cleaned) return null

  const parts = cleaned.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null

  while (parts.length > 1 && isTimeSegment(parts[parts.length - 1]!)) {
    parts.pop()
  }

  if (parts.length === 1 && isTimeSegment(parts[0]!)) return null

  const location = parts.join(' - ').trim()
  return location || null
}

/** Reconstructs a full scene heading (e.g. "INT. KITCHEN - DAY") from INT/EXT and slug title. */
export function formatSceneHeading(intExt: IntExt | null | undefined, slugTitle: string): string {
  const slug = slugTitle.trim()
  let prefix: string
  switch (intExt) {
    case 'EXT':
      prefix = 'EXT.'
      break
    case 'MIXED':
      prefix = 'INT/EXT'
      break
    case 'INT':
    default:
      prefix = 'INT.'
      break
  }
  return slug ? `${prefix} ${slug}` : prefix
}

/**
 * Estimates a scene's length in eighths of a page from its body line count.
 * Deterministic and always at least 1/8 so every scene has a measurable extent.
 */
export function estimateSceneEighths(bodyLineCount: number): number {
  if (bodyLineCount <= 0) return 1
  const raw = Math.round((bodyLineCount / LINES_PER_PAGE) * EIGHTHS_PER_PAGE)
  return Math.max(1, raw)
}

/** True when a trimmed line reads as an uppercase character cue. */
export function isCharacterCueLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
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

/** True when a line is a parenthetical (e.g. "(O.S.)", "(beat)"). */
export function isParentheticalLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('(') && trimmed.endsWith(')')
}

/**
 * Extracts uppercase character cues from a scene body. A cue is a short, all-uppercase line
 * that is not a scene heading or transition. Parentheticals (e.g. "(CONT'D)", "(O.S.)") are
 * stripped. Order-preserving and de-duplicated (case-insensitive).
 */
export function extractCharacterCues(body: string): string[] {
  const cues: string[] = []
  const seen = new Set<string>()
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (!isCharacterCueLine(line)) continue
    const name = line.replace(/\(.*?\)/g, '').trim()
    const key = name.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    cues.push(name)
  }
  return cues
}
