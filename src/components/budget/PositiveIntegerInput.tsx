import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  filterPositiveIntegerInput,
  formatIntegerForInput,
  parsePositiveIntegerInput,
} from '@/lib/budget/fieldValidation'

export type PositiveIntegerInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  onBlur?: React.FocusEventHandler<HTMLInputElement>
}

export function PositiveIntegerInput({
  value,
  onValueChange,
  onBlur,
  className,
  ...props
}: PositiveIntegerInputProps) {
  const [draft, setDraft] = React.useState(() => formatIntegerForInput(value))

  React.useEffect(() => {
    const formatted = formatIntegerForInput(value)
    const parsedDraft = parsePositiveIntegerInput(draft)
    if (parsedDraft !== value && formatted !== draft) {
      setDraft(formatted)
    }
  }, [value, draft])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterPositiveIntegerInput(e.target.value)
    setDraft(filtered)
    const parsed = parsePositiveIntegerInput(filtered)
    if (parsed == null || parsed <= 0) {
      onValueChange(null)
      return
    }
    onValueChange(parsed)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parsePositiveIntegerInput(draft)
    if (parsed != null && parsed > 0) {
      setDraft(formatIntegerForInput(parsed))
    } else if (draft !== '') {
      setDraft('')
    }
    onBlur?.(e)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(className)}
    />
  )
}
