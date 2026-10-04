/**
 * 5x5 risk matrix: factor = severity x probability (each 1-5).
 * Banding is by factor value: 1-6 tolerable, 8-10 moderate, 12-25 severe.
 */

export type RiskBand = 'tolerable' | 'moderate' | 'severe'

export const RISK_SCALE = [1, 2, 3, 4, 5] as const

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  tolerable: 'Tolerable',
  moderate: 'Moderate',
  severe: 'Severe',
}

/**
 * Fixed (non-themed) colours so a band reads the same in every theme and in the exported PDF.
 * `rgb` is 0-255 for pdf-lib; `bg`/`fg` are CSS hex.
 */
export const RISK_BAND_COLORS: Record<
  RiskBand,
  { bg: string; fg: string; rgb: { bg: [number, number, number]; fg: [number, number, number] } }
> = {
  tolerable: {
    bg: '#1FA34A',
    fg: '#FFFFFF',
    rgb: { bg: [0x1f, 0xa3, 0x4a], fg: [0xff, 0xff, 0xff] },
  },
  moderate: {
    bg: '#FFB400',
    fg: '#2B1B00',
    rgb: { bg: [0xff, 0xb4, 0x00], fg: [0x2b, 0x1b, 0x00] },
  },
  severe: {
    bg: '#E02B20',
    fg: '#FFFFFF',
    rgb: { bg: [0xe0, 0x2b, 0x20], fg: [0xff, 0xff, 0xff] },
  },
}

export function riskFactor(severity: number, probability: number): number {
  return severity * probability
}

export function riskBand(factor: number): RiskBand {
  if (factor <= 6) return 'tolerable'
  if (factor <= 10) return 'moderate'
  return 'severe'
}

export function riskBandForRating(severity: number, probability: number): RiskBand {
  return riskBand(riskFactor(severity, probability))
}

/** Display format for a factor, e.g. `12 | Severe`. */
export function formatRiskFactor(factor: number): string {
  return `${factor} | ${RISK_BAND_LABELS[riskBand(factor)]}`
}

export function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

/** Clamp an arbitrary value into the 1-5 scale (non-numeric falls back to `fallback`). */
export function clampRating(value: unknown, fallback = 1): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(5, Math.max(1, Math.round(n)))
}
