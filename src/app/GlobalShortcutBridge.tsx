import { useEffect, useRef } from 'react'

const OVERLAY_SELECTOR =
  '[data-slot="dialog-content"][data-state="open"], [data-slot="sheet-content"][data-state="open"]'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Global keyboard shortcuts handled in JS (not native menu accelerators) so
 * they can be suppressed while typing:
 * - Cmd/Ctrl+K toggles the search palette (works from inside text fields). It is
 *   ignored while any other dialog or sheet is open so it never interrupts form
 *   entry, but still closes the palette itself.
 * - `?` opens the shortcut cheat sheet, unless typing or an overlay is open.
 */
export function GlobalShortcutBridge({
  searchOpen,
  onToggleSearch,
  onOpenShortcuts,
}: {
  searchOpen: boolean
  onToggleSearch: () => void
  onOpenShortcuts: () => void
}) {
  const searchOpenRef = useRef(searchOpen)
  useEffect(() => {
    searchOpenRef.current = searchOpen
  }, [searchOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        if (!searchOpenRef.current && document.querySelector(OVERLAY_SELECTOR)) return
        event.preventDefault()
        onToggleSearch()
        return
      }

      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isEditableTarget(event.target)) return
        if (document.querySelector(OVERLAY_SELECTOR)) return
        event.preventDefault()
        onOpenShortcuts()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onToggleSearch, onOpenShortcuts])

  return null
}
