// @vitest-environment jsdom
import { useImperativeHandle } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ReleaseFormSignPage } from '@/features/release-forms/ReleaseFormSignPage'
import type { SignaturePadProps } from '@/components/signature-pad'

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  signReleaseForm: vi.fn(),
  saveReleaseCopy: vi.fn(),
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: 'prod-1', currentProduction: { name: 'Wild Rivers' } }),
}))
vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: vi.fn(async (key: string) => mocks.settings.get(key) ?? null),
  setSetting: vi.fn(),
}))
vi.mock('@/lib/releaseForms/signReleaseForm', () => ({ signReleaseForm: mocks.signReleaseForm }))
vi.mock('@/features/release-forms/exportReleasePdf', () => ({ saveReleaseCopy: mocks.saveReleaseCopy }))
// Canvas drawing is not available in jsdom: a button stands in for drawing a signature.
vi.mock('@/components/signature-pad', () => ({
  SignaturePad: ({ ref, label, onChange }: SignaturePadProps) => {
    useImperativeHandle(ref, () => ({
      isEmpty: () => false,
      clear: () => {},
      toPng: async () => new Uint8Array([137, 80, 78, 71]),
    }))
    return (
      <button type="button" onClick={() => onChange?.(false)}>
        Draw {label}
      </button>
    )
  },
}))

beforeEach(() => {
  mocks.settings.clear()
  mocks.settings.set('release_forms_company_name', 'Maverick Live')
  mocks.signReleaseForm.mockReset().mockResolvedValue({ bytes: new Uint8Array(), fileName: 'x.pdf', documentId: 'd' })
  mocks.saveReleaseCopy.mockReset().mockResolvedValue(null)
})
afterEach(cleanup)

function renderAt(path: string, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/release-forms" element={<p>Release list</p>} />
          <Route path="/release-forms/new/:formType" element={<ReleaseFormSignPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('ReleaseFormSignPage', () => {
  it('fills the company and production into the contributor terms', async () => {
    renderAt('/release-forms/new/contributor')
    expect(await screen.findByText(/permission to Maverick Live, their partners/)).toBeTruthy()
    expect(screen.getByText(/the video production entitled Wild Rivers/)).toBeTruthy()
  })

  it('keeps Sign disabled until there is a signature and a printed name, then signs and offers a copy', async () => {
    const user = userEvent.setup()
    renderAt('/release-forms/new/contributor')
    const sign = await screen.findByRole('button', { name: /^sign$/i })
    expect(sign).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: 'Draw Signature' }))
    expect(sign).toHaveProperty('disabled', true)
    await user.type(screen.getByLabelText(/full print name/i), 'Jane Smith')
    expect(sign).toHaveProperty('disabled', false)

    await user.click(sign)
    await waitFor(() => expect(mocks.signReleaseForm).toHaveBeenCalledTimes(1))
    const args = mocks.signReleaseForm.mock.calls[0]![0]
    expect(args.formType).toBe('contributor')
    expect(args.pdf.signer.name).toBe('Jane Smith')
    expect(args.pdf.guardian).toBeNull()
    expect(args.pdf.signedAtLabel).toMatch(/\d{4}, \d{2}:\d{2}/)
    await waitFor(() => expect(mocks.saveReleaseCopy).toHaveBeenCalledWith('x.pdf', expect.any(Uint8Array)))
    expect(await screen.findByText('Release list')).toBeTruthy()
  })

  it('requires a parent or guardian signature when the signer is under 18', async () => {
    const user = userEvent.setup()
    renderAt('/release-forms/new/contributor')
    await user.click(await screen.findByRole('button', { name: 'Draw Signature' }))
    await user.type(screen.getByLabelText(/full print name/i), 'Sam Young')
    await user.click(screen.getByRole('checkbox'))
    const sign = screen.getByRole('button', { name: /^sign$/i })
    expect(sign).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: 'Draw Parent or guardian signature' }))
    await user.type(screen.getByLabelText(/parent or guardian full name/i), 'Alex Young')
    expect(sign).toHaveProperty('disabled', false)
  })

  it('requires the location address and puts it into the location terms', async () => {
    const user = userEvent.setup()
    renderAt('/release-forms/new/location')
    await user.click(await screen.findByRole('button', { name: 'Draw Signature' }))
    await user.type(screen.getByLabelText(/full print name/i), 'Owner Name')
    const sign = screen.getByRole('button', { name: /^sign$/i })
    expect(sign).toHaveProperty('disabled', true)
    await user.type(screen.getByLabelText(/location address/i), '12 Mill Lane')
    expect(sign).toHaveProperty('disabled', false)
    expect(screen.getByText(/the right to enter and remain upon 12 Mill Lane/)).toBeTruthy()
  })

  it('asks for the production company instead of showing the form when none is set', async () => {
    mocks.settings.delete('release_forms_company_name')
    renderAt('/release-forms/new/contributor')
    expect(await screen.findByText(/set your production company first/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^sign$/i })).toBeNull()
  })

  it('keeps the terms a form opened with even if the saved terms change', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderAt('/release-forms/new/contributor', qc)
    await screen.findByText(/permission to Maverick Live/)
    mocks.settings.set('release_forms_contributor_terms', 'Completely new terms for {{production_name}}.')
    await qc.invalidateQueries()
    await waitFor(() =>
      expect(qc.getQueryData(['settings', 'release_forms'])).toMatchObject({
        contributorTerms: expect.stringContaining('Completely new terms'),
      })
    )
    expect(screen.getByText(/permission to Maverick Live/)).toBeTruthy()
    expect(screen.queryByText(/Completely new terms/)).toBeNull()
  })
})
