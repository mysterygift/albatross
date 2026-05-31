/** Round to 2 decimal places (currency). Use for all money arithmetic and comparisons. */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return amount
  return Math.round(amount * 100) / 100
}

/** True when rounded `a` exceeds rounded `b`. */
export function moneyExceeds(a: number, b: number): boolean {
  return roundMoney(a) > roundMoney(b)
}
