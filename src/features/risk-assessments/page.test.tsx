// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { RiskAssessmentsPage } from '@/features/risk-assessments/page'
import type { RiskAssessmentSummary } from '@/lib/db/repositories/risk-assessments'

const repo = vi.hoisted(() => ({
  listRiskAssessmentsByProduction: vi.fn(),
  deleteRiskAssessment: vi.fn(),
  listUnitsByProduction: vi.fn(),
}))

vi.mock('@/lib/db/repositories/risk-assessments', () => ({
  listRiskAssessmentsByProduction: repo.listRiskAssessmentsByProduction,
  deleteRiskAssessment: repo.deleteRiskAssessment,
  duplicateRiskAssessment: vi.fn(),
  saveRiskAssessment: vi.fn(),
}))
vi.mock('@/lib/db/repositories/units', () => ({ listUnitsByProduction: repo.listUnitsByProduction }))
vi.mock('@/lib/db/repositories/schedule', () => ({ listShootDaysByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/shoot-day-units', () => ({ listShootDayUnitsByShootDay: vi.fn(async () => []) }))
vi.mock('@/features/risk-assessments/exportRamsPdf', () => ({ exportRamsPdfWithSaveDialog: vi.fn() }))
vi.mock('@/features/productions/context', () => ({ useCurrentProduction: () => ({ currentProductionId: 'prod-1' }) }))

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function row(over: Partial<RiskAssessmentSummary> & Pick<RiskAssessmentSummary, 'id'>): RiskAssessmentSummary {
  return {
    production_id: 'prod-1',
    shoot_day_id: 'day',
    location_id: null,
    location_name: '',
    activities: '',
    responsible_person_id: null,
    responsible_person_name: '',
    first_aiders_json: null,
    hospital_name: null,
    hospital_address: null,
    hospital_phone: null,
    police_name: null,
    police_address: null,
    police_phone: null,
    status: 'draft',
    approved_by: null,
    approved_at: null,
    generated_document_id: null,
    shoot_date: '2026-06-01',
    day_number: null,
    units: [{ shoot_day_unit_id: 'sdu-main', unit_id: 'unit-main' }],
    shoot_day_unit_ids: ['sdu-main'],
    hazard_count: 2,
    max_residual_factor: 4,
    ...soft,
    ...over,
  }
}

const ROWS = [
  row({ id: 'a', shoot_date: '2026-06-03', day_number: 3, location_name: 'Beach', status: 'approved', max_residual_factor: 12 }),
  row({ id: 'b', shoot_date: '2026-06-01', day_number: 1, location_name: 'Warehouse', units: [{ shoot_day_unit_id: 's2', unit_id: 'unit-second' }] }),
  row({ id: 'c', shoot_date: '2026-06-02', day_number: 2, location_name: 'Abbey', max_residual_factor: 9 }),
  row({ id: 'd', shoot_date: '2026-06-04', day_number: 4, location_name: '', hazard_count: 0, max_residual_factor: null }),
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <RiskAssessmentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

/** Date cells (first column) in display order. */
function dateOrder(): string[] {
  const rows = screen.getAllByRole('row').slice(1)
  return rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent!.trim())
}

describe('RiskAssessmentsPage', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.clearAllMocks()
    repo.listRiskAssessmentsByProduction.mockResolvedValue(ROWS)
    repo.listUnitsByProduction.mockResolvedValue([
      { id: 'unit-main', production_id: 'prod-1', name: 'Main Unit', ...soft },
      { id: 'unit-second', production_id: 'prod-1', name: 'Second Unit', ...soft },
    ])
    repo.deleteRiskAssessment.mockResolvedValue(undefined)
  })

  afterEach(cleanup)

  it('shows an empty state with a create action', async () => {
    repo.listRiskAssessmentsByProduction.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No risk assessments yet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /new risk assessment/i }).length).toBeGreaterThan(0)
  })

  it('lists rows by shoot day with units, hazard count, residual risk and status', async () => {
    renderPage()
    await screen.findByText('Beach')
    expect(dateOrder()).toEqual([
      'Day 1 · 2026-06-01',
      'Day 2 · 2026-06-02',
      'Day 3 · 2026-06-03',
      'Day 4 · 2026-06-04',
    ])
    expect(screen.getByText('12 | Severe')).toBeTruthy()
    expect(screen.getByText('9 | Moderate')).toBeTruthy()
    expect(screen.getAllByText('4 | Tolerable')).toHaveLength(1)
    expect(screen.getByText('Second Unit')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getAllByText('Draft').length).toBe(3)
    expect(screen.getByText('No location')).toBeTruthy()
  })

  it('sorts by shoot day (toggle) and by location, with blank locations last', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Beach')

    await user.click(screen.getByRole('button', { name: /^date$/i }))
    expect(dateOrder()[0]).toBe('Day 4 · 2026-06-04')

    await user.click(screen.getByRole('button', { name: /^location$/i }))
    // Abbey, Beach, Warehouse, then the blank location.
    expect(dateOrder()).toEqual([
      'Day 2 · 2026-06-02',
      'Day 3 · 2026-06-03',
      'Day 1 · 2026-06-01',
      'Day 4 · 2026-06-04',
    ])
    expect(screen.getByRole('columnheader', { name: /location/i }).getAttribute('aria-sort')).toBe('ascending')

    await user.click(screen.getByRole('button', { name: /^location$/i }))
    expect(dateOrder().slice(0, 3)).toEqual([
      'Day 1 · 2026-06-01',
      'Day 3 · 2026-06-03',
      'Day 2 · 2026-06-02',
    ])
  })

  it('filters by status and by unit', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Beach')

    await user.click(screen.getByRole('combobox', { name: /filter by status/i }))
    await user.click(await screen.findByRole('option', { name: 'Approved' }))
    expect(dateOrder()).toEqual(['Day 3 · 2026-06-03'])

    await user.click(screen.getByRole('combobox', { name: /filter by status/i }))
    await user.click(await screen.findByRole('option', { name: 'All statuses' }))
    await user.click(screen.getByRole('combobox', { name: /filter by unit/i }))
    await user.click(await screen.findByRole('option', { name: 'Second Unit' }))
    expect(dateOrder()).toEqual(['Day 1 · 2026-06-01'])
  })

  it('deletes after a destructive confirmation', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Beach')

    await user.click(screen.getByRole('button', { name: /actions for day 3/i }))
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete risk assessment?')).toBeTruthy()
    expect(repo.deleteRiskAssessment).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(repo.deleteRiskAssessment).toHaveBeenCalledWith('a'))
  })
})
