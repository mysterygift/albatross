// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

import { GlobalShortcutBridge } from '@/app/GlobalShortcutBridge'

function setup(searchOpen = false) {
  const onToggleSearch = vi.fn()
  const onOpenShortcuts = vi.fn()
  const onOpenGettingStarted = vi.fn()
  render(
    <GlobalShortcutBridge
      searchOpen={searchOpen}
      onToggleSearch={onToggleSearch}
      onOpenShortcuts={onOpenShortcuts}
      onOpenGettingStarted={onOpenGettingStarted}
    />,
  )
  return { onToggleSearch, onOpenShortcuts, onOpenGettingStarted }
}

function addOpenDialog() {
  const el = document.createElement('div')
  el.setAttribute('data-slot', 'dialog-content')
  el.setAttribute('data-state', 'open')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('GlobalShortcutBridge', () => {
  it('toggles search on Cmd/Ctrl+K', () => {
    const { onToggleSearch } = setup()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(onToggleSearch).toHaveBeenCalledTimes(2)
  })

  it('ignores the retired Space-based combo and shifted/alt variants', () => {
    const { onToggleSearch } = setup()
    fireEvent.keyDown(window, { key: ' ', code: 'Space', metaKey: true, altKey: true })
    fireEvent.keyDown(window, { key: 'k', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'k', metaKey: true, altKey: true })
    expect(onToggleSearch).not.toHaveBeenCalled()
  })

  it('works with focus inside a text field', () => {
    const { onToggleSearch } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'k', metaKey: true })
    expect(onToggleSearch).toHaveBeenCalledTimes(1)
  })

  it('is ignored while another dialog is open, but still closes the open search dialog', () => {
    addOpenDialog()
    const closed = setup(false)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(closed.onToggleSearch).not.toHaveBeenCalled()
    cleanup()

    const open = setup(true)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(open.onToggleSearch).toHaveBeenCalledTimes(1)
  })

  it('opens the cheat sheet on ? but not while typing or with an overlay open', () => {
    const { onOpenShortcuts } = setup()
    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: '?', shiftKey: true })
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)

    addOpenDialog()
    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)
  })

  it('opens the cheat sheet from the native Help > Keyboard Shortcuts event, even while typing', () => {
    const { onOpenShortcuts, onOpenGettingStarted } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    window.dispatchEvent(new Event('albatross-menu-help-keyboard-shortcuts'))
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)
    expect(onOpenGettingStarted).not.toHaveBeenCalled()
  })

  it('opens the tutorial home from the native Help > Getting Started event', () => {
    const { onOpenShortcuts, onOpenGettingStarted } = setup()
    window.dispatchEvent(new Event('albatross-menu-help-getting-started'))
    expect(onOpenGettingStarted).toHaveBeenCalledTimes(1)
    expect(onOpenShortcuts).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const { onOpenShortcuts, onOpenGettingStarted } = setup()
    cleanup()
    window.dispatchEvent(new Event('albatross-menu-help-keyboard-shortcuts'))
    window.dispatchEvent(new Event('albatross-menu-help-getting-started'))
    expect(onOpenShortcuts).not.toHaveBeenCalled()
    expect(onOpenGettingStarted).not.toHaveBeenCalled()
  })
})
