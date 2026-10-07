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
        <Route path="/settings" element={<div>Settings home</div>} />
        <Route path="/settings/guidebook/:chapter?" element={<GuidebookPage />} />
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
    renderAt('/settings/guidebook')
    const nav = screen.getByRole('navigation', { name: 'Guidebook contents' })
    for (const chapter of guidebookChapters) {
      expect(within(nav).getAllByText(chapter.title).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('heading', { level: 1, name: /Albatross Guidebook/ })).toBeTruthy()
  })

  it('renders markdown tables and opens a chapter from the sidebar, showing its sections', async () => {
    renderAt('/settings/guidebook')
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
    renderAt('/settings/guidebook/01-getting-started')
    const readmeLink = screen.getAllByRole('link').find((a) => a.textContent === 'README')
    expect(readmeLink).toBeTruthy()
    await userEvent.click(readmeLink!)
    expect(openInSystem).toHaveBeenCalledWith(expect.stringContaining('github.com/mysterygift/albatross/blob/main/README.md'))
  })

  it('redirects an unknown chapter to the contents page', () => {
    renderAt('/settings/guidebook/not-a-chapter')
    expect(screen.getByRole('heading', { level: 1, name: /Albatross Guidebook/ })).toBeTruthy()
  })
})
