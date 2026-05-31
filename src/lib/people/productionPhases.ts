export const PRESET_PRODUCTION_PHASES = [
  { key: 'development', label: 'Development' },
  { key: 'prep', label: 'Prep' },
  { key: 'shoot', label: 'Shoot' },
  { key: 'wrap', label: 'Wrap' },
  { key: 'post', label: 'Post' },
] as const

export type PresetPhaseKey = (typeof PRESET_PRODUCTION_PHASES)[number]['key']

const PRESET_KEY_SET = new Set<string>(PRESET_PRODUCTION_PHASES.map((p) => p.key))

const PHASE_ALIASES: Record<string, PresetPhaseKey> = {
  pre: 'prep',
  'pre-production': 'prep',
  'pre production': 'prep',
  production: 'shoot',
  principal: 'shoot',
  'principal photography': 'shoot',
  wrapup: 'wrap',
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

export function getPresetKey(phase: string): PresetPhaseKey | null {
  const normalized = normalizeKey(phase)
  if (PRESET_KEY_SET.has(normalized)) return normalized as PresetPhaseKey
  return PHASE_ALIASES[normalized] ?? null
}

export function isCustomPhase(phase: string): boolean {
  return getPresetKey(phase) === null
}

export function phaseEquals(a: string, b: string): boolean {
  const keyA = getPresetKey(a) ?? normalizeKey(a)
  const keyB = getPresetKey(b) ?? normalizeKey(b)
  return keyA === keyB
}

export function normalizePhaseInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  return getPresetKey(trimmed) ?? trimmed
}

export function parsePhases(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []

  const result: string[] = []
  const seen = new Set<string>()

  for (const part of raw.split(',')) {
    const normalized = normalizePhaseInput(part)
    if (!normalized) continue

    const dedupeKey = getPresetKey(normalized) ?? normalizeKey(normalized)
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    result.push(normalized)
  }

  return result
}

export function serializePhases(phases: string[]): string | null {
  const result: string[] = []
  const seen = new Set<string>()

  for (const phase of phases) {
    const normalized = normalizePhaseInput(phase)
    if (!normalized) continue

    const dedupeKey = getPresetKey(normalized) ?? normalizeKey(normalized)
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    result.push(normalized)
  }

  return result.length > 0 ? result.join(',') : null
}

export function formatPhaseLabel(phase: string): string {
  const presetKey = getPresetKey(phase)
  if (presetKey) {
    const preset = PRESET_PRODUCTION_PHASES.find((p) => p.key === presetKey)
    return preset?.label ?? phase
  }

  return phase
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function addPhases(current: string[], inputs: string[]): string[] {
  let next = [...current]
  for (const input of inputs) {
    for (const part of input.split(',')) {
      const normalized = normalizePhaseInput(part)
      if (!normalized) continue
      if (next.some((existing) => phaseEquals(existing, normalized))) continue
      next = [...next, normalized]
    }
  }
  return next
}

export function removePhase(current: string[], phase: string): string[] {
  return current.filter((existing) => !phaseEquals(existing, phase))
}

export function togglePresetPhase(current: string[], presetKey: PresetPhaseKey): string[] {
  const selected = current.some((phase) => phaseEquals(phase, presetKey))
  if (selected) return removePhase(current, presetKey)
  return [...current, presetKey]
}

export function isPresetSelected(current: string[], presetKey: PresetPhaseKey): boolean {
  return current.some((phase) => phaseEquals(phase, presetKey))
}

export function getCustomPhases(current: string[]): string[] {
  return current.filter(isCustomPhase)
}
