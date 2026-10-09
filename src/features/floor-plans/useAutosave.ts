import { useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/sonner'

export type AutosaveStatus = 'saved' | 'pending' | 'saving' | 'error'

/**
 * Saves `value` a short while after it last changed, and straight away when the editor closes
 * (unmount), so switching plans or setups never drops an edit. `paused` holds saving during a drag.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<unknown>, options: { paused?: boolean; delay?: number } = {}) {
  const { paused = false, delay = 700 } = options
  const [status, setStatus] = useState<AutosaveStatus>('saved')
  const saved = useRef(value)
  const latest = useRef(value)
  const saveRef = useRef(save)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    saveRef.current = save
  })

  const flushRef = useRef<() => void>(() => {})
  useEffect(() => {
    flushRef.current = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const next = latest.current
      if (next === saved.current) return
      saved.current = next
      setStatus('saving')
      saveRef.current(next).then(
        () => setStatus((s) => (latest.current === next ? 'saved' : s)),
        (e: unknown) => {
          saved.current = undefined as T
          setStatus('error')
          toast.error(e instanceof Error ? e.message : String(e))
        }
      )
    }
  })

  useEffect(() => {
    latest.current = value
    if (value === saved.current) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect the unsaved edit before the debounce fires
    setStatus('pending')
    if (paused) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), delay)
  }, [value, paused, delay])

  // Save whatever is left when the editor goes away.
  useEffect(() => () => flushRef.current(), [])

  return { status, flush: () => flushRef.current() }
}
