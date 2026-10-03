// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CustomiseDashboardMenu } from './CustomiseDashboardMenu'

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
})
afterEach(cleanup)

function open(hidden: Parameters<typeof CustomiseDashboardMenu>[0]['hidden'], onChange = vi.fn()) {
  render(<CustomiseDashboardMenu hidden={hidden} onChange={onChange} />)
  fireEvent.keyDown(screen.getByRole('button', { name: /Customise/ }), { key: 'Enter' })
  return onChange
}

describe('CustomiseDashboardMenu', () => {
  it('hides a card when unchecked', () => {
    const onChange = open(['floats'])
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Budget health' }))
    expect(onChange).toHaveBeenCalledWith(['floats', 'budgetHealth'])
  })

  it('shows a hidden card when checked', () => {
    const onChange = open(['floats'])
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Petty cash floats' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('reset clears all hidden cards', () => {
    const onChange = open(['floats', 'riskWatch'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
