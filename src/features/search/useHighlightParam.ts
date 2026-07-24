import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/** How long a highlighted target stays visually emphasized before auto-clearing. */
const HIGHLIGHT_DURATION_MS = 2500

/**
 * Reads the `highlight` query param (e.g. from a Spotlight Search navigation)
 * so a destination page can scroll to / emphasize the matching row. The value
 * is derived directly from the URL so re-navigating to the same page updates
 * it, and it is stripped from the URL after {@link HIGHLIGHT_DURATION_MS} so it
 * doesn't persist across later reloads or back-navigation.
 */
export function useHighlightParam(): string | null {
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightedId = searchParams.get('highlight')

  useEffect(() => {
    if (!highlightedId) return
    const timer = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('highlight')
          return next
        },
        { replace: true }
      )
    }, HIGHLIGHT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [highlightedId, setSearchParams])

  return highlightedId
}
