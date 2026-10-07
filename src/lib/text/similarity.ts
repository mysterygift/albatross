/**
 * Shared name and line matching: punctuation-insensitive keys, word-overlap similarity and a best-match
 * picker. Used by script import (locations), Script Supervisor revision remapping and Script Breakdown.
 */

/** Text compared across drafts: case, spacing, quote and dash styles ignored. */
export function normaliseLine(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalised words of a line, punctuation dropped. */
export function words(text: string): string[] {
  return normaliseLine(text)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
}

/** Number of words the two lists share, counting repeats. */
export function sharedWords(wa: readonly string[], wb: readonly string[]): number {
  const counts = new Map<string, number>()
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1)
  let shared = 0
  for (const w of wb) {
    const n = counts.get(w) ?? 0
    if (n > 0) {
      shared += 1
      counts.set(w, n - 1)
    }
  }
  return shared
}

/** Dice coefficient over word multisets (0 = nothing shared, 1 = same words). */
export function lineSimilarity(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (wa.length === 0 && wb.length === 0) return 1
  if (wa.length === 0 || wb.length === 0) return 0
  return (2 * sharedWords(wa, wb)) / (wa.length + wb.length)
}

/** Normalizes screenplay punctuation variants before case-insensitive lookup. */
function normalizeNamePunctuation(name: string): string {
  return name
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
}

/** Normalizes a name (location, element, character) for case-insensitive lookup. */
export function normalizeNameKey(name: string): string {
  return normalizeNamePunctuation(name).trim().replace(/\s+/g, ' ').toUpperCase()
}

export type NameMatch<T> = { item: T; score: number; exact: boolean }

/**
 * Candidates whose name matches `name`, best first: an exact normalised key scores 1 and wins outright;
 * otherwise any candidate whose word overlap (Dice) reaches `threshold`.
 */
export function bestMatches<T>(
  name: string,
  candidates: readonly T[],
  nameOf: (item: T) => string | null | undefined,
  threshold = 0.5
): NameMatch<T>[] {
  const key = normalizeNameKey(name)
  if (!key) return []
  const exact = candidates.filter((c) => {
    const n = nameOf(c)
    return n != null && normalizeNameKey(n) === key
  })
  if (exact.length > 0) return exact.map((item) => ({ item, score: 1, exact: true }))
  const scored: NameMatch<T>[] = []
  for (const item of candidates) {
    const n = nameOf(item)
    if (!n) continue
    const score = lineSimilarity(name, n)
    if (score >= threshold) scored.push({ item, score, exact: false })
  }
  return scored.sort((a, b) => b.score - a.score)
}
