/**
 * Pure slate/take numbering helpers for the Script Supervisor feature.
 *
 * Two slating systems, chosen per production (SS2):
 * - **UK (default)**: each new camera setup takes the next consecutive number in its series for the whole
 *   production (Slate 1 on day 1 onwards), regardless of scene. Series are kept apart by prefix
 *   ('' main unit, 'X' second unit, 'Y' unsupervised).
 * - **US**: scene number plus a setup letter: 23, 23A, 23B… Letters skip I and O (they read as 1 and 0);
 *   after Z they double (AA, BB…). Stored as a setup ordinal per scene: 1 = scene number alone, 2 = A, …
 */

export type SlatingSystem = 'uk' | 'us'

export const DEFAULT_SLATING_SYSTEM: SlatingSystem = 'uk'

/** US setup letters in order, without I and O. */
export const US_SETUP_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Normalise a series prefix: trimmed, upper case, '' for main unit. */
export function normaliseSlatePrefix(prefix: string | null | undefined): string {
  return (prefix ?? '').trim().toUpperCase()
}

/** Next number after the highest of the given live numbers (gaps are not refilled). */
export function nextConsecutiveSlateNumber(usedNumbers: readonly number[]): number {
  let max = 0
  for (const n of usedNumbers) {
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

/** Next take number on a slate given its live take numbers. */
export function nextTakeNumber(usedNumbers: readonly number[]): number {
  return nextConsecutiveSlateNumber(usedNumbers)
}

/** US setup ordinal → letter suffix: 1 → '', 2 → 'A', 9 → 'H', 10 → 'J', 25 → 'Z', 26 → 'AA'. */
export function usSetupLetterForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error('Setup ordinal must be a whole number of 1 or more')
  if (ordinal === 1) return ''
  const k = ordinal - 2
  const letter = US_SETUP_LETTERS[k % US_SETUP_LETTERS.length]!
  return letter.repeat(Math.floor(k / US_SETUP_LETTERS.length) + 1)
}

/**
 * US setup letter suffix → ordinal ('' → 1, 'A' → 2, 'AA' → 26). Returns null for anything that is not a
 * valid suffix (including I and O, or mixed letters like 'AB').
 */
export function usOrdinalForSetupLetter(letter: string | null | undefined): number | null {
  const s = (letter ?? '').trim().toUpperCase()
  if (s === '') return 1
  const ch = s[0]!
  if (![...s].every((c) => c === ch)) return null
  const index = US_SETUP_LETTERS.indexOf(ch)
  if (index < 0) return null
  return 2 + index + (s.length - 1) * US_SETUP_LETTERS.length
}

/** UK label as written on the clapperboard, e.g. '212', 'X14'. */
export function formatSlateLabel(prefix: string | null | undefined, slateNumber: number): string {
  return `${normaliseSlatePrefix(prefix)}${slateNumber}`
}

/** System-aware label: UK '212' / 'X14'; US '23A' (needs the scene number). */
export function slateDisplayLabel(
  slate: { slating_system: SlatingSystem; slate_prefix: string; slate_number: number },
  sceneNumber: string | null | undefined
): string {
  if (slate.slating_system === 'us') {
    return `${(sceneNumber ?? '').trim() || '?'}${usSetupLetterForOrdinal(slate.slate_number)}`
  }
  return formatSlateLabel(slate.slate_prefix, slate.slate_number)
}

/**
 * Tramline label: slate, printed takes and shot code, e.g. '67/4 MS Elena' or '23A/2,4 CU'.
 * No printed take shows the slate alone.
 */
export function formatTramlineLabel(args: {
  slateLabel: string
  printTakeNumbers: readonly number[]
  shotCode?: string | null
  description?: string | null
}): string {
  const prints = [...args.printTakeNumbers].sort((a, b) => a - b)
  const head = args.slateLabel + (prints.length > 0 ? `/${prints.join(',')}` : '')
  const tail = [args.shotCode, args.description].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
  return tail ? `${head} ${tail}` : head
}
