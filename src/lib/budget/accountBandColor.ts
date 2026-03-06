import type { BudgetAccount } from '@/lib/db/types'

/** Neutral slate when code is missing or unparseable. */
const DEFAULT_NEUTRAL_SLATE = '#A0A8B0'

/**
 * Palette derived from account code prefix (e.g. 1xxx, 25xx).
 * Mint-complementary, soft; no amber/red.
 */
const CODE_PALETTE: string[] = [
  '#8EA7D6', // soft periwinkle
  '#B8A1D9', // muted lavender
  '#9DBBAA', // sage
  '#9FB6C7', // blue-grey
  '#C6A0B6', // dusty rose
  '#A5B4C6', // cool slate
  '#A0A8B0', // neutral slate
  '#8BA898', // muted mint (distinct from accent)
  '#A89FC6', // soft violet
]

/**
 * Resolve band colour for an account row (UI only).
 * 1) Custom color_hex if set
 * 2) Else department/range palette from code
 * 3) Else neutral slate
 */
export function getAccountBandColor(account: BudgetAccount): string {
  if (account.color_hex && /^#[0-9A-Fa-f]{6}$/.test(account.color_hex)) {
    return account.color_hex
  }
  const code = account.code?.trim()
  if (!code) return DEFAULT_NEUTRAL_SLATE
  const num = parseInt(code, 10)
  if (Number.isNaN(num)) return DEFAULT_NEUTRAL_SLATE
  const index = Math.abs(num) % CODE_PALETTE.length
  return CODE_PALETTE[index] ?? DEFAULT_NEUTRAL_SLATE
}

/** Preset swatches for rollup account colour picker (mint-complementary; no amber/red). */
export const ACCOUNT_COLOR_PRESETS = [
  '#8EA7D6',
  '#B8A1D9',
  '#9DBBAA',
  '#9FB6C7',
  '#C6A0B6',
  '#A5B4C6',
  '#A0A8B0',
] as const

export { DEFAULT_NEUTRAL_SLATE }
