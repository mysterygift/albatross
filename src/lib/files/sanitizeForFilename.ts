/** Lowercase slug safe for filesystem paths; matches call sheet / movement order export naming. */
export function sanitizeForFilename(input: string): string {
  const trimmed = input.trim()
  const safe = trimmed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return safe || 'recipient'
}
