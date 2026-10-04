import { describe, expect, it } from 'vitest'
import {
  describePoConversion,
  formatExchangeRateForInput,
  formatExchangeRateLabel,
  formatPoAmount,
  formatPoDerivedAmount,
  formatProductionAmount,
  getPoExchangeRate,
  isForeignPoCurrency,
  isValidExchangeRate,
  parseExchangeRateInput,
  resolvePoCurrencyPair,
  poAmountInProductionCurrency,
  poAmountInProductionCurrencyOrNull,
  productionAmountToPoCurrencyCeil,
  roundExchangeRate,
} from '@/lib/budget/vendors/poCurrency'

const GBP_FORMAT = (n: number, currency: string) => ({
  formatted: new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n),
})
const usdPo = { currency_code: 'USD', exchange_rate: 0.79 }
const opts = { productionCurrency: 'GBP', format: GBP_FORMAT }

describe('rate helpers', () => {
  it('rounds rates to 6dp', () => {
    expect(roundExchangeRate(0.7900004)).toBe(0.79)
    expect(roundExchangeRate(1.2658225)).toBe(1.265823)
  })

  it('validates / parses typed rates', () => {
    expect(isValidExchangeRate(0.79)).toBe(true)
    expect(isValidExchangeRate(0)).toBe(false)
    expect(isValidExchangeRate(-1)).toBe(false)
    expect(isValidExchangeRate(null)).toBe(false)
    expect(parseExchangeRateInput('0.79')).toBe(0.79)
    expect(parseExchangeRateInput('1,265')).toBe(1.265)
    expect(parseExchangeRateInput('0.12345678')).toBe(0.123457)
    expect(parseExchangeRateInput('')).toBeNull()
    expect(parseExchangeRateInput('abc')).toBeNull()
    expect(parseExchangeRateInput('0')).toBeNull()
    expect(parseExchangeRateInput('0.0000001')).toBeNull()
  })

  it('formats rates', () => {
    expect(formatExchangeRateForInput(0.79)).toBe('0.79')
    expect(formatExchangeRateForInput(null)).toBe('')
    expect(formatExchangeRateLabel(0.79)).toBe('0.7900')
    expect(formatExchangeRateLabel(1.265823)).toBe('1.265823')
    expect(formatExchangeRateLabel(1.26582)).toBe('1.26582')
  })
})

describe('resolvePoCurrencyPair', () => {
  it('stores the production currency as NULL / NULL', () => {
    expect(resolvePoCurrencyPair({ currency_code: 'GBP', exchange_rate: '' }, 'GBP')).toEqual({
      currency_code: null,
      exchange_rate: null,
    })
    expect(resolvePoCurrencyPair({ currency_code: 'gbp', exchange_rate: '2' }, 'GBP')).toEqual({
      currency_code: null,
      exchange_rate: null,
    })
  })

  it('requires a positive rate for a foreign currency', () => {
    expect(resolvePoCurrencyPair({ currency_code: 'USD', exchange_rate: '0.79' }, 'GBP')).toEqual({
      currency_code: 'USD',
      exchange_rate: 0.79,
    })
    expect(resolvePoCurrencyPair({ currency_code: 'USD', exchange_rate: '' }, 'GBP')).toBeNull()
    expect(resolvePoCurrencyPair({ currency_code: 'USD', exchange_rate: '0' }, 'GBP')).toBeNull()
  })
})

describe('getPoExchangeRate / isForeignPoCurrency', () => {
  it('is 1 for null-currency POs (production currency)', () => {
    expect(getPoExchangeRate({ currency_code: null, exchange_rate: null })).toBe(1)
    expect(getPoExchangeRate({})).toBe(1)
    expect(isForeignPoCurrency({ currency_code: null }, 'GBP')).toBe(false)
  })

  it('ignores a stray rate when there is no currency, and a missing rate when there is', () => {
    expect(getPoExchangeRate({ currency_code: null, exchange_rate: 2 })).toBe(1)
    expect(getPoExchangeRate({ currency_code: 'USD', exchange_rate: null })).toBe(1)
  })

  it('uses the locked rate for foreign POs', () => {
    expect(getPoExchangeRate(usdPo)).toBe(0.79)
    expect(isForeignPoCurrency(usdPo, 'GBP')).toBe(true)
    expect(isForeignPoCurrency(usdPo, 'usd')).toBe(false)
  })
})

describe('poAmountInProductionCurrency', () => {
  it('converts via the locked rate and rounds to 2dp', () => {
    expect(poAmountInProductionCurrency(usdPo, 1000)).toBe(790)
    expect(poAmountInProductionCurrency({ currency_code: 'USD', exchange_rate: 0.7933 }, 100.5)).toBe(79.73)
  })

  it('leaves null-currency amounts alone', () => {
    expect(poAmountInProductionCurrency({ currency_code: null, exchange_rate: null }, 1234.56)).toBe(1234.56)
  })

  it('handles null amounts', () => {
    expect(poAmountInProductionCurrencyOrNull(usdPo, null)).toBeNull()
    expect(poAmountInProductionCurrencyOrNull(usdPo, 100)).toBe(79)
  })
})

describe('productionAmountToPoCurrencyCeil', () => {
  it('rounds UP to 2dp so the PO always covers the shortfall', () => {
    // 100 GBP at 1 USD = 0.79 GBP -> 126.582278... USD -> 126.59
    expect(productionAmountToPoCurrencyCeil(usdPo, 100)).toBe(126.59)
    // Exact conversions are not bumped by float noise.
    expect(productionAmountToPoCurrencyCeil({ currency_code: 'USD', exchange_rate: 0.5 }, 10)).toBe(20)
    expect(productionAmountToPoCurrencyCeil({ currency_code: 'USD', exchange_rate: 0.1 }, 0.3)).toBe(3)
  })

  it('is a plain 2dp round for null-currency POs', () => {
    expect(productionAmountToPoCurrencyCeil({ currency_code: null }, 12.345)).toBe(12.35)
  })
})

describe('formatPoAmount', () => {
  it('shows the production-currency value with the original in brackets for foreign POs', () => {
    expect(formatPoAmount(usdPo, 1000, opts)).toBe('£790.00 ($1,000.00)')
    expect(formatPoAmount({ currency_code: 'EUR', exchange_rate: 0.85 }, 1000, opts)).toBe('£850.00 (€1,000.00)')
  })

  it('shows just the production amount for null-currency or same-currency POs', () => {
    expect(formatPoAmount({ currency_code: null, exchange_rate: null }, 1000, opts)).toBe('£1,000.00')
    expect(formatPoAmount({ currency_code: 'GBP', exchange_rate: 1 }, 1000, opts)).toBe('£1,000.00')
  })

  it('routes through the display-currency formatter', () => {
    const display = (n: number) => ({ formatted: `EUR ${n.toFixed(2)}` })
    expect(formatPoAmount(usdPo, 1000, { productionCurrency: 'GBP', format: display })).toBe(
      'EUR 790.00 ($1,000.00)'
    )
  })

  it('always prints 2dp, never a float artifact', () => {
    expect(formatPoAmount({ currency_code: 'USD', exchange_rate: 0.1 }, 3, opts)).toBe('£0.30 ($3.00)')
  })

  it('formatProductionAmount prints a production-currency figure', () => {
    expect(formatProductionAmount(0.1 + 0.2, opts)).toBe('£0.30')
  })
})

describe('formatPoDerivedAmount', () => {
  it('shows committed / remaining with the PO-currency equivalent in brackets', () => {
    expect(formatPoDerivedAmount(usdPo, 395, opts)).toBe('£395.00 ($500.00)')
    expect(formatPoDerivedAmount(usdPo, -79, opts)).toBe('-£79.00 (-$100.00)')
  })

  it('is plain for production-currency POs', () => {
    expect(formatPoDerivedAmount({ currency_code: null }, 395, opts)).toBe('£395.00')
  })
})

describe('describePoConversion', () => {
  it('describes the live conversion', () => {
    const text = describePoConversion({ amount: 1000, rate: 0.79, poCurrency: 'USD', productionCurrency: 'GBP' })
    expect(text).toContain('790.00')
    expect(text).toContain('1 USD = 0.7900 GBP')
    expect(text?.startsWith('≈ ')).toBe(true)
  })

  it('is null without an amount / rate or for the same currency', () => {
    expect(describePoConversion({ amount: null, rate: 0.79, poCurrency: 'USD', productionCurrency: 'GBP' })).toBeNull()
    expect(describePoConversion({ amount: 10, rate: null, poCurrency: 'USD', productionCurrency: 'GBP' })).toBeNull()
    expect(describePoConversion({ amount: 10, rate: 1, poCurrency: 'GBP', productionCurrency: 'GBP' })).toBeNull()
  })
})
