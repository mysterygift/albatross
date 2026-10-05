/** Lowercase slug safe for filesystem paths; matches call sheet / movement order export naming. */
export function sanitizeForFilename(input: string): string {
  const trimmed = input.trim()
  const safe = trimmed
    // Accented letters keep their base letter ("Kovač" → "kovac") rather than being dropped.
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/gi, 'l')
    .replace(/[đð]/gi, 'd')
    .replace(/ø/gi, 'o')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return safe || 'recipient'
}
