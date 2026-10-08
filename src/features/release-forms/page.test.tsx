// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ReleaseFormsPage } from '@/features/release-forms/page'

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: 'prod-1', currentProduction: { name: 'Wild Rivers' } }),
}))
vi.mock('@/lib/db/repositories/settings', () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn() }))
vi.mock('@/features/documents/useEnrichedDocuments', () => ({
  useEnrichedDocuments: () => ({
    isLoading: false,
    getCategoryDocuments: () => [
      {
        id: 'doc-1',
        entity_type: 'signed_contributor_release',
        file_name: 'contributor-release-jane-smith-2026-10-08-1432.pdf',
        file_path: 'attachments/prod-1/doc-1-contributor-release.pdf',
        created_at: '2026-10-08T13:32:00.000Z',
      },
      { id: 'doc-2', entity_type: 'contributor_form', file_name: 'uploaded.pdf', created_at: '2026-10-01T00:00:00Z' },
    ],
  }),
}))
vi.mock('@/lib/documents/hardDeleteDocument', () => ({ hardDeleteDocument: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }))

afterEach(cleanup)

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/release-forms']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/release-forms" element={<ReleaseFormsPage />} />
          <Route path="/release-forms/new/:formType" element={<p>Signing {window.location.pathname}</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('ReleaseFormsPage', () => {
  it('lists signed releases only, not uploaded forms', () => {
    renderPage()
    expect(screen.getByText('contributor-release-jane-smith-2026-10-08-1432.pdf')).toBeTruthy()
    expect(screen.queryByText('uploaded.pdf')).toBeNull()
  })

  it('New Release offers the two forms and opens the chosen one', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: /new release/i })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /contributor release form/i })).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /location release form/i }))
    expect(await screen.findByText(/signing/i)).toBeTruthy()
  })
})
