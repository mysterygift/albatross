import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  filterMoneyInput,
  formatMoneyFixedForInput,
  parseMoneyInput,
} from '@/lib/budget/fieldValidation'
import { roundMoney } from '@/lib/money/roundMoney'

export type MoneyAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  mode: 'positive' | 'nonNegative'
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  onBlur?: React.FocusEventHandler<HTMLInputElement>
}

/** Emit null for empty / out-of-mode input, otherwise the amount rounded to 2dp. */
function toEmittedAmount(parsed: number | null, mode: 'positive' | 'nonNegative'): number | null {
  if (parsed == null) return null
  const rounded = roundMoney(parsed)
  if (mode === 'positive' && rounded <= 0) return null
  if (mode === 'nonNegative' && rounded < 0) return null
  return rounded
}

/**
 * Money text input. Amounts are always rounded to 2dp: emitted values are rounded, pasted text with
 * more than 2 decimals is rounded (not rejected, not truncated), and the field shows fixed 2dp on blur.
 */
export function MoneyAmountInput({
  mode,
  value,
  onValueChange,
  onBlur,
  className,
  ...props
}: MoneyAmountInputProps) {
  const [draft, setDraft] = React.useState(() => formatMoneyFixedForInput(value))

  React.useEffect(() => {
    const formatted = formatMoneyFixedForInput(value)
    const parsedDraft = parseMoneyInput(draft)
    // Only overwrite the draft when the external value truly differs from what is typed
    // (compared at 2dp so "12" vs 12 -> "12.00" does not fight the user mid-typing).
    const parsedRounded = parsedDraft == null ? null : roundMoney(parsedDraft)
    const externalRounded = value == null || !Number.isFinite(value) ? null : roundMoney(value)
    if (parsedRounded !== externalRounded && formatted !== draft) {
      setDraft(formatted)
    }
  }, [value, draft])

  const commit = (text: string) => {
    setDraft(text)
    onValueChange(toEmittedAmount(parseMoneyInput(text), mode))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    commit(filterMoneyInput(e.target.value))
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    const input = e.currentTarget
    const start = input.selectionStart ?? draft.length
    const end = input.selectionEnd ?? draft.length
    const composed = draft.slice(0, start) + pasted + draft.slice(end)
    // Strip separators / currency symbols first, then round (rather than truncate) extra decimals.
    const unbounded = filterMoneyInput(composed, { maxDecimals: Number.MAX_SAFE_INTEGER })
    const decimals = unbounded.includes('.') ? unbounded.length - unbounded.indexOf('.') - 1 : 0
    if (decimals <= 2) return // normal path: onChange filters it
    const parsed = parseMoneyInput(unbounded)
    if (parsed == null) return
    e.preventDefault()
    commit(formatMoneyFixedForInput(parsed))
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseMoneyInput(draft)
    if (parsed != null) {
      const rounded = roundMoney(parsed)
      setDraft(formatMoneyFixedForInput(rounded))
      // Normalise the emitted value too (e.g. ".5" -> 0.5 is unchanged, but keep draft and value in step).
      onValueChange(toEmittedAmount(rounded, mode))
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
      onPaste={handlePaste}
      onBlur={handleBlur}
      className={cn(className)}
    />
  )
}
