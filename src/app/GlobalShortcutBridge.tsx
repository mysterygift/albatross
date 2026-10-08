import { useEffect, useRef } from 'react'

import { menuCommandTargets } from '@/app/menuSchema'

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
 * - The native Help menu items arrive as window events (re-dispatched by
 *   ApfMenuEventBridge): Keyboard Shortcuts opens the cheat sheet and Getting
 *   Started opens the tutorial home. These always open, even while typing.
 */
export function GlobalShortcutBridge({
  searchOpen,
  onToggleSearch,
  onOpenShortcuts,
  onOpenGettingStarted,
}: {
  searchOpen: boolean
  onToggleSearch: () => void
  onOpenShortcuts: () => void
  onOpenGettingStarted?: () => void
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

  useEffect(() => {
    const shortcutsEvent = menuCommandTargets.help_keyboard_shortcuts.browserEvent!
    const gettingStartedEvent = menuCommandTargets.help_getting_started.browserEvent!
    const handleShortcuts = () => onOpenShortcuts()
    const handleGettingStarted = () => onOpenGettingStarted?.()
    window.addEventListener(shortcutsEvent, handleShortcuts)
    window.addEventListener(gettingStartedEvent, handleGettingStarted)
    return () => {
      window.removeEventListener(shortcutsEvent, handleShortcuts)
      window.removeEventListener(gettingStartedEvent, handleGettingStarted)
    }
  }, [onOpenShortcuts, onOpenGettingStarted])

  return null
}
