import { useCallback, useEffect, useState } from 'react'

/** Space left under the workspace when it isn't inside the app's main column (p-4). */
const DEFAULT_BOTTOM_GAP = 16
/** Below this the workspace stops shrinking and the page scrolls instead. */
const MIN_HEIGHT = 480
/** A phone on its side has well under 480px; let the workspace shrink further there so the panes still scroll on their own. */
const PHONE_LANDSCAPE_MIN_HEIGHT = 240

export type WorkspaceBox = { width: number; height: number }

function measure(el: HTMLElement): WorkspaceBox {
  const rect = el.getBoundingClientRect()
  const top = rect.top + window.scrollY
  // The main column's bottom padding, which on iOS includes the home-indicator safe area.
  const main = el.closest('main')
  const bottomGap = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : DEFAULT_BOTTOM_GAP
  return {
    width: Math.round(rect.width),
    height: Math.max(
      window.innerHeight < 500 ? PHONE_LANDSCAPE_MIN_HEIGHT : MIN_HEIGHT,
      Math.floor(window.innerHeight - top - bottomGap)
    ),
  }
}

/**
 * Size of the tablet workspace: its own width (which picks the wide or narrow arrangement, so an open
 * sidebar counts) and the height that fills the window from its top edge down, so each pane can scroll
 * on its own. The app's main column grows with its content, so the height has to be measured.
 */
export function useWorkspaceBox(): [(el: HTMLElement | null) => void, WorkspaceBox | null] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [box, setBox] = useState<WorkspaceBox | null>(null)

  // Measure as soon as the element mounts, before the first paint, so the layout doesn't flip.
  const ref = useCallback((node: HTMLElement | null) => {
    setEl(node)
    if (node) setBox(measure(node))
  }, [])

  useEffect(() => {
    if (!el) return
    const update = () => {
      const next = measure(el)
      setBox((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next))
    }
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [el])

  return [ref, box]
}
