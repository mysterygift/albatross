import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  filterMoneyInput,
  formatMoneyForInput,
  parseMoneyInput,
} from '@/lib/budget/fieldValidation'

export type MoneyAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  mode: 'positive' | 'nonNegative'
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  onBlur?: React.FocusEventHandler<HTMLInputElement>
}

export function MoneyAmountInput({
  mode,
  value,
  onValueChange,
  onBlur,
  className,
  ...props
}: MoneyAmountInputProps) {
  const [draft, setDraft] = React.useState(() => formatMoneyForInput(value))

  React.useEffect(() => {
    const formatted = formatMoneyForInput(value)
    const parsedDraft = parseMoneyInput(draft)
    if (parsedDraft !== value && formatted !== draft) {
      setDraft(formatted)
    }
  }, [value, draft])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterMoneyInput(e.target.value)
    setDraft(filtered)
    const parsed = parseMoneyInput(filtered)
    if (parsed == null) {
      onValueChange(null)
      return
    }
    if (mode === 'positive' && parsed <= 0) {
      onValueChange(null)
      return
    }
    if (mode === 'nonNegative' && parsed < 0) {
      onValueChange(null)
      return
    }
    onValueChange(parsed)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseMoneyInput(draft)
    if (parsed != null) {
      setDraft(formatMoneyForInput(parsed))
    }
    onBlur?.(e)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(className)}
    />
  )
}
