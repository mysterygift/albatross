import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type TimeFieldProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'placeholder'> & {
  /** The saved time (HH:MM), or null when it follows the default shown as the placeholder. */
  value: string | null
  /** What applies when empty, e.g. the unit's wrap. */
  placeholder?: string | null
  /** Called on blur or Enter when the text changed; blank commits null. */
  onCommit: (value: string | null) => void
}

/**
 * A 24-hour time typed on the number pad: "2115" or "21:15". A text field rather than
 * `type="time"`, so an empty field can show the time it falls back to.
 */
export function TimeField({ value, placeholder, onCommit, className, ...props }: TimeFieldProps) {
  const [draft, setDraft] = useState(value ?? '')
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value ?? '')
  }

  const commit = () => {
    const next = draft.trim()
    if (next === (value ?? '')) return
    onCommit(next === '' ? null : next)
  }

  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="done"
      maxLength={5}
      value={draft}
      placeholder={placeholder ?? '--:--'}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          setDraft(value ?? '')
        }
      }}
      className={cn('h-11 font-mono text-base tabular-nums md:text-base', value != null && 'border-primary', className)}
    />
  )
}
