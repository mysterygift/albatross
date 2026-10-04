import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CURRENCY_OPTIONS } from '@/lib/money/formatMoney'

export type InvoiceCurrencySelectProps = {
  id: string
  /** Selected currency code; falls back to the production currency when empty. */
  value: string | null | undefined
  onChange: (code: string) => void
  productionCurrency: string
}

/** Invoice currency picker shared by the vendor invoice dialogs and Log Spend. */
export function InvoiceCurrencySelect({
  id,
  value,
  onChange,
  productionCurrency,
}: InvoiceCurrencySelectProps) {
  const current = value?.trim() || productionCurrency
  const options: { code: string; symbol?: string }[] = [...CURRENCY_OPTIONS]
  for (const code of [productionCurrency, current]) {
    if (code && !options.some((o) => o.code === code)) options.push({ code })
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger id={id} className="mt-1">
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
  )
}
