// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ShortcutCheatSheet } from '@/components/shortcut-cheat-sheet'
import { buildShortcutSections } from '@/components/shortcutSections'

afterEach(cleanup)

describe('ShortcutCheatSheet', () => {
  it('builds Navigation, Create, View and General sections from the schema', () => {
    const sections = buildShortcutSections(false)
    expect(sections.map((s) => s.title)).toEqual(['Navigation', 'Create', 'View', 'General'])
    expect(sections[0].rows).toContainEqual({ label: 'Go to Equipment', keys: 'Ctrl+Alt+3' })
    expect(sections[3].rows).toContainEqual({ label: 'Search', keys: 'Ctrl+K' })
    expect(sections[2].rows).toEqual([{ label: 'Toggle sidebar', keys: 'Ctrl+B' }])
  })

  it('renders the dialog when open', () => {
    render(<ShortcutCheatSheet open onOpenChange={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeTruthy()
  })
})
