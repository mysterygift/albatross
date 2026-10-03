// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RequireProduction } from '@/components/require-production'

const mockUseCurrentProduction = vi.fn()
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => mockUseCurrentProduction(),
}))

afterEach(cleanup)

describe('RequireProduction', () => {
  it('renders children when a production is selected', () => {
    mockUseCurrentProduction.mockReturnValue({ currentProductionId: 'p1' })
    render(<MemoryRouter><RequireProduction title="Budget"><div>content</div></RequireProduction></MemoryRouter>)
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.queryByText('No production selected')).toBeNull()
  })

  it('renders heading and empty state when none selected', () => {
    mockUseCurrentProduction.mockReturnValue({ currentProductionId: null })
    render(<MemoryRouter><RequireProduction title="Budget"><div>content</div></RequireProduction></MemoryRouter>)
    expect(screen.queryByText('content')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Budget')
    expect(screen.getByText('No production selected')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Manage productions' }).getAttribute('href')).toBe('/productions')
  })

  it('omits heading without title', () => {
    mockUseCurrentProduction.mockReturnValue({ currentProductionId: null })
    render(<MemoryRouter><RequireProduction><div>content</div></RequireProduction></MemoryRouter>)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})
