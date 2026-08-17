// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useGlobalSearchIndex } from '@/features/search/useGlobalSearchIndex'

const mocks = vi.hoisted(() => ({
  useAuthSession: vi.fn(),
  getDb: vi.fn(),
  requireProjectViewAccess: vi.fn(),
  listCast: vi.fn(),
  listCrew: vi.fn(),
  listScenesByProduction: vi.fn(),
  listLocationsByProduction: vi.fn(),
  listEquipmentByProduction: vi.fn(),
  listVendorPurchaseOrdersByProduction: vi.fn(),
  listVendors: vi.fn(),
}))

vi.mock('@/lib/auth/useAuthSession', () => ({ useAuthSession: mocks.useAuthSession }))
vi.mock('@/lib/db/client', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/access/projectAccessService', () => ({
  requireProjectViewAccess: mocks.requireProjectViewAccess,
}))
vi.mock('@/lib/db/repositories/person', () => ({
  listCast: mocks.listCast,
  listCrew: mocks.listCrew,
}))
vi.mock('@/lib/db/repositories/schedule', () => ({
  listScenesByProduction: mocks.listScenesByProduction,
}))
vi.mock('@/lib/db/repositories/location', () => ({
  listLocationsByProduction: mocks.listLocationsByProduction,
}))
vi.mock('@/lib/db/repositories/equipment', () => ({
  listEquipmentByProduction: mocks.listEquipmentByProduction,
}))
vi.mock('@/lib/db/repositories/vendorPurchaseOrders', () => ({
  listVendorPurchaseOrdersByProduction: mocks.listVendorPurchaseOrdersByProduction,
}))
vi.mock('@/lib/db/repositories/vendors', () => ({ listVendors: mocks.listVendors }))
vi.mock('@/features/documents/useEnrichedDocuments', () => ({
  useEnrichedDocuments: () => ({ documents: [], isLoading: false }),
}))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProduction: { currency_code: 'GBP' } }),
}))
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ format: (amount: number) => ({ formatted: `£${amount}` }) }),
}))

function Probe({ enabled = true }: { enabled?: boolean }) {
  const state = useGlobalSearchIndex('production-1', { enabled })
  return <pre data-testid="results">{JSON.stringify(state)}</pre>
}

function renderProbe(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Probe enabled={enabled} />
    </QueryClientProvider>,
  )
}

describe('global search PII authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDb.mockResolvedValue({ dialect: 'postgres' })
    mocks.requireProjectViewAccess.mockResolvedValue(undefined)
    mocks.listCast.mockResolvedValue([])
    mocks.listCrew.mockResolvedValue([])
    mocks.listScenesByProduction.mockResolvedValue([])
    mocks.listLocationsByProduction.mockResolvedValue([])
    mocks.listEquipmentByProduction.mockResolvedValue([])
    mocks.listVendorPurchaseOrdersByProduction.mockResolvedValue([])
    mocks.listVendors.mockResolvedValue([])
  })

  afterEach(cleanup)

  it('does not fetch an index before authentication establishes project access', async () => {
    mocks.useAuthSession.mockReturnValue({
      authSupported: true,
      currentUser: null,
    })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('results').textContent).toContain('"results":[]'))
    expect(mocks.getDb).not.toHaveBeenCalled()
    expect(mocks.requireProjectViewAccess).not.toHaveBeenCalled()
    expect(mocks.listCast).not.toHaveBeenCalled()
    expect(mocks.listCrew).not.toHaveBeenCalled()
    expect(mocks.listLocationsByProduction).not.toHaveBeenCalled()
    expect(mocks.listVendors).not.toHaveBeenCalled()
  })

  it('does not fetch or expose PII when the authenticated actor lacks project access', async () => {
    mocks.useAuthSession.mockReturnValue({
      authSupported: true,
      currentUser: { id: 'user-1', username: 'viewer', role: 'user' },
    })
    mocks.requireProjectViewAccess.mockRejectedValue(new Error('Forbidden'))

    renderProbe()

    await waitFor(() => expect(mocks.requireProjectViewAccess).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('results').textContent).toContain('"results":[]')
    expect(mocks.listCrew).not.toHaveBeenCalled()
    expect(mocks.listLocationsByProduction).not.toHaveBeenCalled()
    expect(mocks.listVendors).not.toHaveBeenCalled()
  })

  it('intentionally indexes contact details and addresses after project access is granted', async () => {
    mocks.useAuthSession.mockReturnValue({
      authSupported: true,
      currentUser: { id: 'user-1', username: 'viewer', role: 'user' },
    })
    mocks.listCrew.mockResolvedValue([
      {
        id: 'crew-1',
        name: 'Morgan Camera',
        department: 'Camera',
        role_name: 'Operator',
        email: 'morgan@example.test',
        phone: '+44 7700 900123',
        contributor_form_status: 'complete',
      },
    ])
    mocks.listLocationsByProduction.mockResolvedValue([
      {
        id: 'location-1',
        name: 'Private Residence',
        address: '12 Sensitive Street, London',
        booked_status: 'booked',
        what3words: 'private.contact.address',
        parking_info: 'Rear gate',
        permit_fee: null,
        location_fee: null,
        availability_constraints: null,
      },
    ])
    mocks.listVendors.mockResolvedValue([
      {
        id: 'vendor-1',
        company_name: 'Private Supplier',
        primary_contact_full_name: 'Taylor Vendor',
        primary_contact_email: 'taylor@example.test',
        is_global: false,
      },
    ])

    renderProbe()

    await waitFor(() => expect(mocks.listCrew).toHaveBeenCalledWith('production-1'))
    const rendered = screen.getByTestId('results').textContent ?? ''
    expect(rendered).toContain('morgan@example.test')
    expect(rendered).toContain('+44 7700 900123')
    expect(rendered).toContain('12 Sensitive Street, London')
    expect(rendered).toContain('private.contact.address')
    expect(rendered).toContain('Taylor Vendor')
    expect(rendered).toContain('taylor@example.test')
  })
})
