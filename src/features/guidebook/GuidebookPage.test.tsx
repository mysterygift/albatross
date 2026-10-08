// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GuidebookPage } from '@/features/guidebook/GuidebookPage'
import { guidebookChapters } from '@/lib/guidebook/guidebook'

const openInSystem = vi.hoisted(() => vi.fn())
vi.mock('@/lib/files', () => ({ openInSystem }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guidebook/:chapter?" element={<GuidebookPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('GuidebookPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    openInSystem.mockResolvedValue(undefined)
  })

  it('renders the contents page with every chapter in the sidebar', () => {
    renderAt('/guidebook')
    const nav = screen.getByRole('navigation', { name: 'Guidebook contents' })
    for (const chapter of guidebookChapters) {
      expect(within(nav).getAllByText(chapter.title).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('heading', { level: 1, name: /Albatross Guidebook/ })).toBeTruthy()
  })

  it('renders markdown tables and opens a chapter from the sidebar, showing its sections', async () => {
    renderAt('/guidebook')
    expect(document.querySelector('table')).not.toBeNull()
    const schedule = guidebookChapters.find((c) => c.slug === '05-schedule')!
    const nav = screen.getByRole('navigation', { name: 'Guidebook contents' })
    await userEvent.click(within(nav).getByRole('button', { name: schedule.title }))
    expect(screen.getByRole('heading', { level: 1, name: schedule.title })).toBeTruthy()
    const firstSection = schedule.headings.find((h) => h.level === 2)!
    expect(within(nav).getByRole('button', { name: firstSection.text })).toBeTruthy()
    expect(document.getElementById(firstSection.id)).not.toBeNull()
  })

  it('follows links between chapters and opens external links in the system', async () => {
    renderAt('/guidebook/01-getting-started')
    const readmeLink = screen.getAllByRole('link').find((a) => a.textContent === 'README')
    expect(readmeLink).toBeTruthy()
    await userEvent.click(readmeLink!)
    expect(openInSystem).toHaveBeenCalledWith(expect.stringContaining('github.com/mysterygift/albatross/blob/main/README.md'))
  })

  it('opens every chapter at the very top, whatever the previous scroll position', async () => {
    const { container } = render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <MemoryRouter initialEntries={['/guidebook/05-schedule']}>
          <Routes>
            <Route path="/guidebook/:chapter?" element={<GuidebookPage />} />
          </Routes>
        </MemoryRouter>
      </div>
    )
    const scroller = container.querySelector<HTMLElement>('[data-testid="scroller"]')!
    Object.defineProperty(scroller, 'scrollHeight', { value: 9000, configurable: true })
    Object.defineProperty(scroller, 'clientHeight', { value: 600, configurable: true })
    scroller.scrollTop = 1800
    const nav = screen.getByRole('navigation', { name: 'Guidebook contents' })
    const budget = guidebookChapters.find((c) => c.slug === '10-budget')!
    await userEvent.click(within(nav).getByRole('button', { name: budget.title }))
    expect(scroller.scrollTop).toBe(0)
  })

  it('redirects an unknown chapter to the contents page', () => {
    renderAt('/guidebook/not-a-chapter')
    expect(screen.getByRole('heading', { level: 1, name: /Albatross Guidebook/ })).toBeTruthy()
  })
})
