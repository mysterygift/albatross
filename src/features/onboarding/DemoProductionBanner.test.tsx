// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import { DemoProductionBanner } from './DemoProductionBanner'

const listProductions = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/repositories/production', () => ({ listProductions }))

function renderBanner(slug: string, setId = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <DemoProductionBanner
                isDemo={slug === DEMO_SLUG}
                currentProduction={{ slug }}
                setCurrentProductionId={setId}
              />
            }
          />
          <Route path="/productions" element={<div>Productions page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return setId
}

describe('DemoProductionBanner', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders nothing outside the demo production', () => {
    listProductions.mockResolvedValue([])
    renderBanner('my-film')
    expect(screen.queryByText(/Demo production/)).toBeNull()
    expect(listProductions).not.toHaveBeenCalled()
  })

  it('switches to the first non-demo production', async () => {
    listProductions.mockResolvedValue([
      { id: 'demo', slug: DEMO_SLUG, archived_at: null },
      { id: 'mine', slug: 'mine', archived_at: null },
    ])
    const setId = renderBanner(DEMO_SLUG)
    const btn = await screen.findByRole('button', { name: 'Switch to my production' })
    await waitFor(() => expect(listProductions).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    await userEvent.click(btn)
    expect(setId).toHaveBeenCalledWith('mine')
  })

  it('navigates to /productions when none exists', async () => {
    listProductions.mockResolvedValue([{ id: 'demo', slug: DEMO_SLUG, archived_at: null }])
    const setId = renderBanner(DEMO_SLUG)
    await waitFor(() => expect(listProductions).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to my production' }))
    expect(await screen.findByText('Productions page')).toBeTruthy()
    expect(setId).not.toHaveBeenCalled()
  })
})
