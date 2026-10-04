/**
 * Round to 2 decimal places (currency), half away from zero.
 * Use for all money arithmetic, comparisons and persistence so float artifacts
 * (0.1 + 0.2, 1.005 * 100) never reach the UI or a stored value.
 *
 * The scaled value is normalised to 15 significant digits before rounding, which drops the
 * representation error (1.005 * 100 = 100.49999999999999) without changing real values.
 * Non-finite input is returned unchanged.
 */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return amount
  const sign = amount < 0 ? -1 : 1
  const scaled = Number((Math.abs(amount) * 100).toPrecision(15))
  const rounded = sign * (Math.round(scaled) / 100)
  return rounded === 0 ? 0 : rounded
}

/** True when rounded `a` exceeds rounded `b`. */
export function moneyExceeds(a: number, b: number): boolean {
  return roundMoney(a) > roundMoney(b)
}

/** Rounding-safe equality: both sides compared as 2dp amounts. */
export function moneyEquals(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b)
}

/** Round to 2dp but keep null/undefined as null (for nullable money columns). */
export function roundMoneyOrNull(amount: number | null | undefined): number | null {
  return amount == null ? null : roundMoney(amount)
}

/** Sum amounts and round the total (avoids 0.1 + 0.2 = 0.30000000000000004). */
export function sumMoney(amounts: Iterable<number>): number {
  let total = 0
  for (const a of amounts) total += a
  return roundMoney(total)
}
