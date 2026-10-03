// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ProductionSwitcher } from '@/components/production-switcher'

const setCurrentProductionId = vi.fn()
const mockUseCurrentProduction = vi.fn()
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => mockUseCurrentProduction(),
}))

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname + loc.search}</div>
}

function setup() {
  mockUseCurrentProduction.mockReturnValue({
    productions: [
      { id: 'p1', name: 'Alpha', slug: 'alpha' },
      { id: 'p2', name: 'Beta', slug: 'beta' },
    ],
    currentProductionId: 'p1',
    setCurrentProductionId,
  })
  render(
    <MemoryRouter initialEntries={['/budget']}>
      <ProductionSwitcher />
      <Where />
    </MemoryRouter>
  )
  const trigger = screen.getByRole('button', { name: 'Current production' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

describe('ProductionSwitcher', () => {
  it('lists productions and shows the current one', () => {
    setup()
    expect(screen.getByRole('menuitemradio', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: 'Beta' })).toBeTruthy()
  })

  it('selecting a production calls setCurrentProductionId', () => {
    setup()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Beta' }))
    expect(setCurrentProductionId).toHaveBeenCalledWith('p2')
  })

  it('New production navigates to /productions?new=1', () => {
    setup()
    fireEvent.click(screen.getByRole('menuitem', { name: /New production/ }))
    expect(screen.getByTestId('where').textContent).toBe('/productions?new=1')
  })

  it('Manage productions navigates to /productions', () => {
    setup()
    fireEvent.click(screen.getByRole('menuitem', { name: /Manage productions/ }))
    expect(screen.getByTestId('where').textContent).toBe('/productions')
  })
})
