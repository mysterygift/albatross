import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { filterMoneyInput, formatMoneyForInput, parseMoneyInput, PERCENTAGE_MESSAGE } from '@/lib/budget/fieldValidation'

export type PercentageInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  onValidationError?: (message: string | null) => void
  onBlur?: React.FocusEventHandler<HTMLInputElement>
}

function isValidPercentage(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100
}

export function PercentageInput({
  value,
  onValueChange,
  onValidationError,
  onBlur,
  className,
  ...props
}: PercentageInputProps) {
  const [draft, setDraft] = React.useState(() => formatMoneyForInput(value))

  React.useEffect(() => {
    const formatted = formatMoneyForInput(value)
    const parsedDraft = parseMoneyInput(draft)
    if (parsedDraft !== value && formatted !== draft) {
      setDraft(formatted)
    }
  }, [value, draft])

  const validate = (parsed: number | null) => {
    if (parsed == null) {
      onValidationError?.(null)
      return
    }
    if (!isValidPercentage(parsed)) {
      onValidationError?.(PERCENTAGE_MESSAGE)
      return
    }
    onValidationError?.(null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterMoneyInput(e.target.value, { maxDecimals: 1 })
    setDraft(filtered)
    const parsed = parseMoneyInput(filtered)
    validate(parsed)
    onValueChange(parsed)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseMoneyInput(draft)
    if (parsed != null && isValidPercentage(parsed)) {
      setDraft(formatMoneyForInput(parsed))
    }
    validate(parsed)
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
