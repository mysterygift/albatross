/**
 * Format a number as currency using Intl.NumberFormat.
 * Always use this for budget display; conversion (if enabled) is applied before calling.
 */
export function formatMoney(
  amount: number,
  currency: string,
  options?: { locale?: string }
): string {
  const locale = options?.locale ?? undefined
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export const CURRENCY_OPTIONS = [
  { code: 'GBP', symbol: '£', label: 'British Pound Sterling' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', label: 'New Zealand Dollar' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc' },
] as const
