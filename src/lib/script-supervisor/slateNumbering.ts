/**
 * Pure slate/take numbering helpers for the Script Supervisor feature.
 *
 * SS1 implements UK consecutive slating: each new camera setup takes the next number in its
 * series for the whole production (Slate 1 on day 1 onwards), regardless of scene. Series are
 * kept apart by prefix ('' main unit, 'X' second unit, 'Y' unsupervised). Per-scene and US
 * scene+letter modes arrive in SS2 and will reuse these helpers.
 */

/** Normalise a series prefix: trimmed, upper case, '' for main unit. */
export function normaliseSlatePrefix(prefix: string | null | undefined): string {
  return (prefix ?? '').trim().toUpperCase()
}

/** Next consecutive number given the live slate numbers already used in a series. */
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

/** Display label as written on the clapperboard and tramline, e.g. '212', 'X14'. */
export function formatSlateLabel(prefix: string | null | undefined, slateNumber: number): string {
  return `${normaliseSlatePrefix(prefix)}${slateNumber}`
}

/**
 * Tramline label: slate, printed takes and shot code, e.g. '67/4 MS Elena'.
 * Several printed takes are joined with commas ('67/2,4'); no print shows the slate alone.
 */
export function formatTramlineLabel(args: {
  prefix: string | null | undefined
  slateNumber: number
  printTakeNumbers: readonly number[]
  shotCode?: string | null
  description?: string | null
}): string {
  const prints = [...args.printTakeNumbers].sort((a, b) => a - b)
  const head = formatSlateLabel(args.prefix, args.slateNumber) + (prints.length > 0 ? `/${prints.join(',')}` : '')
  const tail = [args.shotCode, args.description].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
  return tail ? `${head} ${tail}` : head
}
