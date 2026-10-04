/**
 * PO currency helpers (pure, no DB / UI).
 *
 * A PO may be raised in a foreign currency. `currency_code` (NULL = production currency) and the
 * `exchange_rate` locked on the PO (1 unit of PO currency = `exchange_rate` production currency)
 * live on the PO row. PO amounts and amendments are stored in the PO currency; everything that
 * is compared with spend (expenses / allocations are in PRODUCTION currency) goes through the
 * ONE conversion below. Use these helpers everywhere instead of ad hoc maths.
 */
import { formatMoney } from '@/lib/money/formatMoney'
import { roundMoney } from '@/lib/money/roundMoney'

/** Exchange rates are stored / entered with at most this many decimals. */
export const EXCHANGE_RATE_DECIMALS = 6

/** The fields of a PO that decide its currency. Both NULL => production currency. */
export type PoCurrencyFields = {
  currency_code?: string | null
  exchange_rate?: number | null
}

/** Round a rate to {@link EXCHANGE_RATE_DECIMALS} decimals (half away from zero, float-safe). */
export function roundExchangeRate(rate: number): number {
  if (!Number.isFinite(rate)) return rate
  const factor = 10 ** EXCHANGE_RATE_DECIMALS
  const scaled = Number((Math.abs(rate) * factor).toPrecision(15))
  const rounded = Math.sign(rate) * (Math.round(scaled) / factor)
  return rounded === 0 ? 0 : rounded
}

/** A usable rate is finite and strictly positive. */
export function isValidExchangeRate(rate: number | null | undefined): rate is number {
  return rate != null && Number.isFinite(rate) && rate > 0
}

/** Parse a typed rate ("0.79", "1,2650"); empty / invalid / non-positive -> null. Rounded to 6dp. */
export function parseExchangeRateInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '.')
  if (cleaned === '' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!isValidExchangeRate(n)) return null
  const rounded = roundExchangeRate(n)
  return rounded > 0 ? rounded : null
}

/** Text for a rate input: up to 6dp, no trailing zeros ("0.79", "1.265823"). */
export function formatExchangeRateForInput(rate: number | null | undefined): string {
  if (!isValidExchangeRate(rate)) return ''
  return String(roundExchangeRate(rate))
}

/** Label form of a rate, at least 4dp: "0.7900", "1.265823". */
export function formatExchangeRateLabel(rate: number): string {
  const full = roundExchangeRate(rate).toFixed(EXCHANGE_RATE_DECIMALS)
  let end = full.length
  const minLength = full.indexOf('.') + 1 + 4
  while (end > minLength && full[end - 1] === '0') end--
  return full.slice(0, end)
}

export const EXCHANGE_RATE_REQUIRED_MESSAGE = 'Enter the exchange rate (a positive number)'

/**
 * Turn the dialog's currency selection + rate text into the stored pair: the production currency (or none)
 * is stored as NULL / NULL; a foreign currency needs a positive rate. Returns null when the rate is missing
 * or invalid for a foreign currency.
 */
export function resolvePoCurrencyPair(
  input: { currency_code: string; exchange_rate?: string | null },
  productionCurrency: string
): { currency_code: string | null; exchange_rate: number | null } | null {
  const code = input.currency_code.trim().toUpperCase()
  if (!code || code === (productionCurrency || '').trim().toUpperCase()) {
    return { currency_code: null, exchange_rate: null }
  }
  const rate = parseExchangeRateInput(input.exchange_rate ?? '')
  return rate == null ? null : { currency_code: code, exchange_rate: rate }
}

/** True when the PO is in a currency other than the production's. */
export function isForeignPoCurrency(
  po: PoCurrencyFields,
  productionCurrency: string
): boolean {
  const code = po.currency_code?.trim()
  if (!code) return false
  return code.toUpperCase() !== (productionCurrency || '').trim().toUpperCase()
}

/**
 * Locked rate (PO currency -> production currency). 1 when the PO has no currency or no usable
 * rate (older rows and production-currency POs).
 */
export function getPoExchangeRate(po: PoCurrencyFields): number {
  if (!po.currency_code?.trim()) return 1
  return isValidExchangeRate(po.exchange_rate) ? po.exchange_rate : 1
}

/** A PO amount (in the PO's currency) expressed in the PRODUCTION currency, rounded to 2dp. */
export function poAmountInProductionCurrency(po: PoCurrencyFields, amount: number): number {
  return roundMoney(amount * getPoExchangeRate(po))
}

/** Nullable variant for POs without a value. */
export function poAmountInProductionCurrencyOrNull(
  po: PoCurrencyFields,
  amount: number | null | undefined
): number | null {
  return amount == null ? null : poAmountInProductionCurrency(po, amount)
}

/**
 * A production-currency amount expressed in the PO's currency, ROUNDED UP to 2dp so a PO raised by
 * this much always covers the production-currency shortfall (used by "Increase PO to cover").
 */
export function productionAmountToPoCurrencyCeil(po: PoCurrencyFields, amount: number): number {
  const rate = getPoExchangeRate(po)
  if (rate === 1) return roundMoney(amount)
  const cents = Number(((amount / rate) * 100).toPrecision(12))
  return Math.ceil(cents) / 100
}

/** Formatter shape of `useCurrency().format` (production-currency amount -> display string). */
export type PoDisplayFormatter = (amount: number, productionCurrency: string) => { formatted: string }

/**
 * The ONE way to print a PO amount. `amount` is in the PO's own currency. Shows the amount converted
 * to the production currency (through the display-currency formatter, as everywhere else) and, when
 * the PO is in another currency, the original in brackets: `£1,000.00 ($1,265.82)`.
 */
export function formatPoAmount(
  po: PoCurrencyFields,
  amount: number,
  options: { productionCurrency: string; format: PoDisplayFormatter }
): string {
  const { productionCurrency, format } = options
  const converted = poAmountInProductionCurrency(po, amount)
  const main = format(converted, productionCurrency).formatted
  if (!isForeignPoCurrency(po, productionCurrency)) return main
  return `${main} (${formatMoney(roundMoney(amount), po.currency_code!.trim().toUpperCase())})`
}

/**
 * Print a PRODUCTION-currency figure that belongs to a PO (committed / remaining). Foreign-currency POs
 * show the PO-currency equivalent (at the locked rate) in brackets, like {@link formatPoAmount}.
 */
export function formatPoDerivedAmount(
  po: PoCurrencyFields,
  productionAmount: number,
  options: { productionCurrency: string; format: PoDisplayFormatter }
): string {
  const { productionCurrency, format } = options
  const main = format(roundMoney(productionAmount), productionCurrency).formatted
  if (!isForeignPoCurrency(po, productionCurrency)) return main
  const original = roundMoney(productionAmount / getPoExchangeRate(po))
  return `${main} (${formatMoney(original, po.currency_code!.trim().toUpperCase())})`
}

/** Same for a plain production-currency amount (spend): converted already, no original. */
export function formatProductionAmount(
  amount: number,
  options: { productionCurrency: string; format: PoDisplayFormatter }
): string {
  return options.format(roundMoney(amount), options.productionCurrency).formatted
}

/**
 * Live line under the amount field: "≈ £1,000.00 at 1 USD = 0.7900 GBP".
 * Null when there is nothing to convert (no amount / no rate / same currency).
 */
export function describePoConversion(input: {
  amount: number | null | undefined
  rate: number | null | undefined
  poCurrency: string
  productionCurrency: string
}): string | null {
  const { amount, rate, poCurrency, productionCurrency } = input
  if (amount == null || !Number.isFinite(amount) || !isValidExchangeRate(rate)) return null
  if (poCurrency.toUpperCase() === productionCurrency.toUpperCase()) return null
  const converted = roundMoney(amount * rate)
  return `≈ ${formatMoney(converted, productionCurrency)} at 1 ${poCurrency.toUpperCase()} = ${formatExchangeRateLabel(rate)} ${productionCurrency.toUpperCase()}`
}
