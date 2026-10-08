// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ReleaseFormsPage } from '@/features/release-forms/page'

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: 'prod-1', currentProduction: { name: 'Wild Rivers' } }),
}))
const settings = vi.hoisted(() => new Map<string, string>())
vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: vi.fn(async (key: string) => settings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => void settings.set(key, value)),
}))
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
const platform = vi.hoisted(() => ({ ios: false }))
vi.mock('@/lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/platform')>()),
  isIosPlatform: () => platform.ios,
}))

afterEach(() => {
  cleanup()
  settings.clear()
  platform.ios = false
})

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
  it('requires the production company when editing the terms', async () => {
    settings.set('release_forms_company_name', 'Maverick Live')
    const user = userEvent.setup()
    renderPage()
    const edit = screen.getByRole('button', { name: /edit terms/i })
    await waitFor(() => expect(edit).toHaveProperty('disabled', false))
    await user.click(edit)
    const dialog = await screen.findByRole('dialog')
    const company = within(dialog).getByLabelText(/production company/i)
    await user.clear(company)
    expect(within(dialog).getByRole('button', { name: /save terms/i })).toHaveProperty('disabled', true)
    expect(within(dialog).getByText(/can’t be signed without it/i)).toBeTruthy()
  })

  it('lists signed releases only, not uploaded forms', () => {
    renderPage()
    expect(screen.getByText('contributor-release-jane-smith-2026-10-08-1432.pdf')).toBeTruthy()
    expect(screen.queryByText('uploaded.pdf')).toBeNull()
  })

  it('offers Open and Save or share on desktop, and a single Share on iOS', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /^open$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /save or share/i })).toBeTruthy()
    cleanup()
    platform.ios = true
    renderPage()
    expect(screen.getByRole('button', { name: /^share$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /save or share/i })).toBeNull()
  })

  it('asks for the production company before the first release, then offers the forms', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: /new release/i })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/set your production company first/i)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /contributor release form/i })).toBeNull()
    const save = within(dialog).getByRole('button', { name: /save and continue/i })
    expect(save).toHaveProperty('disabled', true)

    await user.type(within(dialog).getByLabelText(/production company/i), 'Maverick Live')
    await user.click(save)
    expect(settings.get('release_forms_company_name')).toBe('Maverick Live')
    expect(await within(dialog).findByRole('button', { name: /contributor release form/i })).toBeTruthy()
  })

  it('New Release offers the two forms and opens the chosen one', async () => {
    settings.set('release_forms_company_name', 'Maverick Live')
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: /new release/i })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('button', { name: /contributor release form/i })).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /location release form/i }))
    expect(await screen.findByText(/signing/i)).toBeTruthy()
  })
})
