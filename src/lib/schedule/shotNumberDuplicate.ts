/** Industry-style shot numbers: digits + optional letter suffix (e.g. 9, 3A, 10B). */
const INDUSTRY_SHOT_NUMBER = /^(\d+)([A-Za-z]*)$/

const MAX_SUFFIX_ATTEMPTS = 702 // A..Z, AA..ZZ

function parseIndustryShotNumber(trimmed: string): { base: string; suffix: string } | null {
  const m = INDUSTRY_SHOT_NUMBER.exec(trimmed)
  if (!m) return null
  return { base: m[1]!, suffix: m[2] ?? '' }
}

/** Excel-style column increment: '' -> 'A', 'A' -> 'B', 'Z' -> 'AA'. */
function incrementLetterSuffix(suffix: string): string {
  if (suffix === '') return 'A'
  const upper = suffix.toUpperCase()
  const chars = upper.split('')
  let carry = 1
  for (let i = chars.length - 1; i >= 0 && carry; i--) {
    const code = chars[i]!.charCodeAt(0) - 65 + carry
    if (code < 26) {
      chars[i] = String.fromCharCode(65 + code)
      carry = 0
    } else {
      chars[i] = 'A'
      carry = 1
    }
  }
  if (carry) chars.unshift('A')
  const next = chars.join('')
  if (suffix === suffix.toUpperCase()) return next
  if (suffix === suffix.toLowerCase()) return next.toLowerCase()
  return next
}

function applySuffixCase(template: string, nextSuffix: string): string {
  if (template === '') return nextSuffix
  if (template === template.toUpperCase()) return nextSuffix.toUpperCase()
  if (template === template.toLowerCase()) return nextSuffix.toLowerCase()
  return nextSuffix
}

function candidateFromIndustry(base: string, suffix: string, nextSuffix: string): string {
  return base + applySuffixCase(suffix, nextSuffix)
}

function* industryCandidates(base: string, suffix: string): Generator<string> {
  let next = suffix === '' ? 'A' : incrementLetterSuffix(suffix)
  for (let i = 0; i < MAX_SUFFIX_ATTEMPTS; i++) {
    yield candidateFromIndustry(base, suffix, next)
    next = incrementLetterSuffix(next)
  }
}

/** Non-standard numbers (no leading digits): append A, B, … */
function* fallbackCandidates(source: string): Generator<string> {
  let next = 'A'
  for (let i = 0; i < MAX_SUFFIX_ATTEMPTS; i++) {
    yield source + next
    next = incrementLetterSuffix(next)
  }
}

function normalizeExisting(existing: Iterable<string>): Set<string> {
  const set = new Set<string>()
  for (const n of existing) {
    const t = n.trim()
    if (t) set.add(t)
  }
  return set
}

/**
 * Next shot number when duplicating: 9 -> 9A, 3A -> 3B, skips collisions in the scene.
 * Non-industry numbers (e.g. "Pickup") get "A", "B", … appended.
 */
export function nextShotNumberForDuplicate(
  sourceShotNumber: string,
  existingShotNumbers: Iterable<string>
): string {
  const trimmed = sourceShotNumber.trim()
  if (!trimmed) {
    throw new Error('Cannot derive duplicate shot number from an empty shot number')
  }

  const existing = normalizeExisting(existingShotNumbers)
  const parsed = parseIndustryShotNumber(trimmed)

  const candidates = parsed
    ? industryCandidates(parsed.base, parsed.suffix)
    : fallbackCandidates(trimmed)

  for (const candidate of candidates) {
    if (!existing.has(candidate)) return candidate
  }

  throw new Error('Could not find an available shot number for this duplicate')
}
