import { useCallback, useState } from 'react'

/** Undo steps kept per document. */
const MAX_HISTORY = 100

type HistoryState<T> = {
  past: T[]
  present: T
  future: T[]
  /** The value before a drag started; the drag becomes one undo step when it ends. */
  gestureStart: T | null
}

/**
 * Undo/redo for one document (a plan's layout, or a setup's markers). A change marked `transient`
 * is part of a drag: the drag's updates show live, and only its end is recorded, as one step.
 */
export function useEditHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [], gestureStart: null })

  const set = useCallback((next: T, transient = false) => {
    setState((s) => {
      if (transient) return { ...s, present: next, gestureStart: s.gestureStart ?? s.present }
      const before = s.gestureStart ?? s.present
      if (before === next) return { ...s, present: next, gestureStart: null }
      return { past: [...s.past, before].slice(-MAX_HISTORY), present: next, future: [], gestureStart: null }
    })
  }, [])

  const undo = useCallback(() => {
    setState((s) => {
      const previous = s.past[s.past.length - 1]
      if (previous === undefined || s.gestureStart !== null) return s
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future], gestureStart: null }
    })
  }, [])

  const redo = useCallback(() => {
    setState((s) => {
      const [next, ...rest] = s.future
      if (next === undefined || s.gestureStart !== null) return s
      return { past: [...s.past, s.present], present: next, future: rest, gestureStart: null }
    })
  }, [])

  return {
    value: state.present,
    /** True while a drag is in progress (nothing to save yet). */
    dragging: state.gestureStart !== null,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
