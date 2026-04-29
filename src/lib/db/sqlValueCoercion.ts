export function coerceBoolean(value: unknown, fallback: boolean = false): boolean {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 't' || normalized === '1') return true
    if (normalized === 'false' || normalized === 'f' || normalized === '0') return false
  }
  return fallback
}

export function coerceNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function coerceIsoString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return String(value ?? '')
}
