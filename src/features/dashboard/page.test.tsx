// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProduction: { id: 'p1', name: 'Alpha', slug: 'alpha', currency_code: 'GBP' },
    currentProductionId: 'p1',
    productions: [],
    setCurrentProductionId: vi.fn(),
  }),
}))
vi.mock('@/hooks/useWorkingBudgetRevision', () => ({ useWorkingBudgetRevision: () => ({ data: { id: 'r1' } }) }))
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ format: (n: number) => ({ formatted: String(n) }), ensureRate: vi.fn() }),
}))
vi.mock('@/lib/auth/useAuthSession', () => ({ useAuthSession: () => ({ authSupported: false, currentUser: null }) }))
vi.mock('@/features/onboarding/GetStartedChecklist', () => ({
  GetStartedChecklist: () => <div data-testid="get-started-checklist" />,
}))
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@/lib/db/repositories/tasks', () => ({ listTasksByProduction: async () => [] }))
vi.mock('@/lib/db/repositories/deliverable', () => ({ listDeliverablesByProduction: async () => [] }))
vi.mock('@/lib/dashboard/budgetHealth', () => ({ getDashboardBudgetHealthData: async () => null }))
vi.mock('@/lib/dashboard/nextShootDay', () => ({ getDashboardNextShootDayData: async () => null }))
vi.mock('@/lib/dashboard/vendorFinance', () => ({
  getDashboardVendorFinanceData: async () => null,
  dashboardVendorFinanceQueryKey: (id: string) => ['dashboard-vendor-finance', id],
}))
vi.mock('@/lib/budget/vendors/riskWatch', () => ({
  getVendorFinanceRiskItems: async () => [],
  riskWatchQueryKey: (id: string, rev?: string) => ['risk-watch', id, rev],
}))
vi.mock('@/lib/budget/floatReminders', () => ({
  getOutstandingFloatReminders: () => ({ reminders: [], unresolvedCount: 0 }),
}))
vi.mock('@/lib/db/repositories/floats', () => ({ listFloatsByProduction: async () => [] }))
vi.mock('@/lib/db/repositories/floatReconciliation', () => ({ listFloatExpenseLinksByProduction: async () => [] }))
vi.mock('@/lib/db/repositories/person', () => ({ listPeopleByProduction: async () => [] }))
vi.mock('@/lib/access/projectDomainService', () => ({ listPeopleByProductionForActor: async () => [] }))

import { DashboardPage } from './page'

function installStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  return storage
}

beforeEach(() => {
  installStorage()
})

afterEach(() => {
  cleanup()
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DashboardPage header', () => {
  it('has no destructive Wrap button, keeps the checklist and a quiet wrap link', async () => {
    const { container } = renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByTestId('get-started-checklist')).toBeTruthy()
    expect(container.querySelector('[data-variant="destructive"], .bg-destructive')).toBeNull()
    expect(screen.queryByRole('button', { name: /Wrap Production/i })).toBeNull()
    const link = await screen.findByRole('link', { name: 'Wrap production' })
    expect(link.getAttribute('href')).toBe('/wrap-production')
    expect(screen.getByTestId('dashboard-hero')).toBeTruthy()
  })
})
