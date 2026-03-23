const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn

function fnv1a64Hex(input: string): string {
  let h = FNV_OFFSET
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i))
    h = (h * FNV_PRIME) & MASK_64
  }
  return h.toString(16).padStart(16, '0')
}

/**
 * Deterministic stringify: sorted object keys at every level; JSON-safe values only.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
  }
  throw new Error('stableStringify: unsupported value')
}

/** Non-cryptographic fingerprint for cache scoping (e.g. ORS API key material). */
export function fingerprintApiKeyMaterial(material: string): string {
  const t = material.trim()
  if (!t) return 'no-key'
  return fnv1a64Hex(t)
}

export function buildApiCacheKey(input: object): string {
  return fnv1a64Hex(stableStringify(input))
}
