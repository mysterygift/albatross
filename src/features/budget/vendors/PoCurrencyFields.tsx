import { useEffect, useRef, useState, type ReactNode } from 'react'

import { ValidatedField } from '@/components/budget/ValidatedField'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { filterMoneyInput } from '@/lib/budget/fieldValidation'
import {
  describePoConversion,
  EXCHANGE_RATE_DECIMALS,
  formatExchangeRateForInput,
  parseExchangeRateInput,
} from '@/lib/budget/vendors/poCurrency'
import { CURRENCY_OPTIONS } from '@/lib/money/formatMoney'
import { getRate } from '@/lib/money/exchangeRates'

export type PoCurrencyFieldsProps = {
  idPrefix: string
  productionCurrency: string
  /** Selected currency code (the production currency when the PO is in production currency). */
  currency: string
  /** Exchange rate text (1 unit of PO currency in production currency). */
  rate: string
  /** PO amount in the selected currency, for the live conversion line. */
  amount: number | null
  onCurrencyChange: (code: string) => void
  onRateChange: (text: string) => void
  rateError?: string
  /** The amount field (labelled "Amount (excl. tax)"); rendered beside the currency select. */
  children: ReactNode
}

/**
 * Currency + locked exchange rate controls for a PO dialog. Picking a currency other than the production
 * currency prefills the rate from `getRate` (blank + a manual-entry hint when unavailable offline); the
 * rate stays editable and is stored on the PO.
 */
export function PoCurrencyFields({
  idPrefix,
  productionCurrency,
  currency,
  rate,
  amount,
  onCurrencyChange,
  onRateChange,
  rateError,
  children,
}: PoCurrencyFieldsProps) {
  const foreign = currency.toUpperCase() !== productionCurrency.toUpperCase()
  const [loadingRate, setLoadingRate] = useState(false)
  const [rateUnavailable, setRateUnavailable] = useState(false)
  const requestRef = useRef(0)
  const onRateChangeRef = useRef(onRateChange)
  useEffect(() => {
    onRateChangeRef.current = onRateChange
  })
  useEffect(
    () => () => {
      requestRef.current += 1 // ignore a late response after unmount
    },
    []
  )

  const options: { code: string; symbol?: string }[] = [...CURRENCY_OPTIONS]
  for (const code of [productionCurrency, currency]) {
    if (code && !options.some((o) => o.code === code)) options.push({ code })
  }

  const handleCurrencyChange = (code: string) => {
    onCurrencyChange(code)
    onRateChange('')
    setRateUnavailable(false)
    const token = ++requestRef.current
    if (code.toUpperCase() === productionCurrency.toUpperCase()) {
      setLoadingRate(false)
      return
    }
    setLoadingRate(true)
    void getRate(code, productionCurrency).then((r) => {
      if (token !== requestRef.current) return
      setLoadingRate(false)
      const text = formatExchangeRateForInput(r)
      if (text) onRateChangeRef.current(text)
      else setRateUnavailable(true)
    })
  }

  const parsedRate = parseExchangeRateInput(rate)
  const conversion = foreign
    ? describePoConversion({ amount, rate: parsedRate, poCurrency: currency, productionCurrency })
    : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        {children}
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-currency`}>Currency</Label>
          <Select value={currency} onValueChange={handleCurrencyChange}>
            <SelectTrigger id={`${idPrefix}-currency`} className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.symbol ? `${c.code} (${c.symbol})` : c.code}
                  {c.code.toUpperCase() === productionCurrency.toUpperCase() ? ' · production' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {foreign && (
        <ValidatedField
          label={`Exchange rate (1 ${currency} in ${productionCurrency})`}
          htmlFor={`${idPrefix}-rate`}
          error={rateError}
          description={
            rateUnavailable ? (
              <span data-testid={`${idPrefix}-rate-hint`}>
                Live rate unavailable. Enter the rate manually; it is locked on this PO.
              </span>
            ) : loadingRate ? (
              'Fetching today’s rate…'
            ) : (
              'Locked on this PO so the commitment does not move with the market.'
            )
          }
          required
        >
          <Input
            id={`${idPrefix}-rate`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 0.79"
            className="mt-1"
            value={rate}
            onChange={(e) => onRateChange(filterMoneyInput(e.target.value, { maxDecimals: EXCHANGE_RATE_DECIMALS }))}
          />
        </ValidatedField>
      )}
      {conversion && (
        <p className="text-xs text-muted-foreground tabular-nums" data-testid={`${idPrefix}-conversion`}>
          {conversion}
        </p>
      )}
    </div>
  )
}
