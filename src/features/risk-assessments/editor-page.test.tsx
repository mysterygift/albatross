// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'

import { RiskAssessmentEditorPage } from '@/features/risk-assessments/editor-page'
import type { RiskAssessmentFull } from '@/lib/db/repositories/risk-assessments'

const repo = vi.hoisted(() => ({
  getRiskAssessment: vi.fn(),
  saveRiskAssessment: vi.fn(),
  approveRiskAssessment: vi.fn(),
  listShootDaysByProduction: vi.fn(),
  listUnitsByProduction: vi.fn(),
  listShootDayUnitsByShootDay: vi.fn(),
  listLocationsByProduction: vi.fn(),
  listCrew: vi.fn(),
  listHazardTemplatesByProduction: vi.fn(),
  upsertHazardTemplate: vi.fn(),
  deleteHazardTemplate: vi.fn(),
}))

vi.mock('@/lib/db/repositories/risk-assessments', () => ({
  getRiskAssessment: repo.getRiskAssessment,
  saveRiskAssessment: repo.saveRiskAssessment,
  approveRiskAssessment: repo.approveRiskAssessment,
  duplicateRiskAssessment: vi.fn(),
}))
vi.mock('@/lib/db/repositories/schedule', () => ({ listShootDaysByProduction: repo.listShootDaysByProduction }))
vi.mock('@/lib/db/repositories/units', () => ({ listUnitsByProduction: repo.listUnitsByProduction }))
vi.mock('@/lib/db/repositories/shoot-day-units', () => ({ listShootDayUnitsByShootDay: repo.listShootDayUnitsByShootDay }))
vi.mock('@/lib/db/repositories/location', () => ({ listLocationsByProduction: repo.listLocationsByProduction }))
vi.mock('@/lib/db/repositories/person', () => ({ listCrew: repo.listCrew }))
vi.mock('@/lib/db/repositories/hazard-templates', () => ({
  listHazardTemplatesByProduction: repo.listHazardTemplatesByProduction,
  upsertHazardTemplate: repo.upsertHazardTemplate,
  deleteHazardTemplate: repo.deleteHazardTemplate,
}))
vi.mock('@/features/risk-assessments/exportRamsPdf', () => ({ exportRamsPdfWithSaveDialog: vi.fn() }))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: 'prod-1' }),
}))
vi.mock('@/lib/auth/useAuthSession', () => ({
  useAuthSession: () => ({ currentUser: { id: 'u1', username: 'Dana Director', role: 'user' } }),
}))

const soft = { created_at: 't', updated_at: 't1', deleted_at: null as string | null }

function ra(over: Partial<RiskAssessmentFull> = {}): RiskAssessmentFull {
  return {
    id: 'ra-1',
    production_id: 'prod-1',
    shoot_day_id: 'day-1',
    location_id: null,
    location_name: 'Warehouse',
    activities: 'Rigging',
    responsible_person_id: null,
    responsible_person_name: 'Sam Safety',
    first_aiders_json: null,
    first_aiders: [],
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
    shoot_day_unit_ids: ['sdu-1'],
    hazards: [],
    ...soft,
    ...over,
  }
}

const hazardRow = {
  id: 'hz-1',
  risk_assessment_id: 'ra-1',
  sort_order: 0,
  name: 'Working at height',
  description: '',
  risks: '',
  outcomes: '',
  control_measures: '',
  at_risk_crew: 1,
  at_risk_cast: 0,
  at_risk_public: 0,
  severity_before: 4,
  probability_before: 3,
  severity_after: 2,
  probability_after: 2,
  ...soft,
}

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/risk-assessments/:id', element: <RiskAssessmentEditorPage /> },
      { path: '/risk-assessments', element: <div>List page</div> },
    ],
    { initialEntries: ['/risk-assessments/ra-1'] }
  )
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('RiskAssessmentEditorPage', () => {
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
    repo.getRiskAssessment.mockResolvedValue(ra())
    repo.listShootDaysByProduction.mockResolvedValue([
      { id: 'day-1', production_id: 'prod-1', shoot_date: '2026-06-09', day_number: 4, ...soft },
    ])
    repo.listUnitsByProduction.mockResolvedValue([{ id: 'unit-1', production_id: 'prod-1', name: 'Main Unit', ...soft }])
    repo.listShootDayUnitsByShootDay.mockResolvedValue([
      { id: 'sdu-1', shoot_day_id: 'day-1', unit_id: 'unit-1', notes: null, is_locked: 0, ...soft },
    ])
    repo.listLocationsByProduction.mockResolvedValue([])
    repo.listCrew.mockResolvedValue([])
    repo.listHazardTemplatesByProduction.mockResolvedValue([])
    repo.saveRiskAssessment.mockImplementation(async (input: { hazards: unknown[] }) =>
      ra({ updated_at: 't2', hazards: input.hazards.map((h, i) => ({ ...hazardRow, ...(h as object), id: `hz-new-${i}` })) as never })
    )
  })

  afterEach(cleanup)

  it('loads the RAMS and keeps Approve disabled until there is a hazard', async () => {
    renderEditor()
    expect(await screen.findByDisplayValue('Warehouse')).toBeTruthy()
    expect(screen.getByDisplayValue('Sam Safety')).toBeTruthy()
    expect(screen.getByText('Draft')).toBeTruthy()
    const approve = screen.getByRole('button', { name: /^approve$/i }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(approve.title).toBe('Add at least one hazard before approving')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('adds the built-in Manual Handling hazard (red before, green after) and saves it', async () => {
    const user = userEvent.setup()
    renderEditor()
    await screen.findByDisplayValue('Warehouse')

    await user.click(screen.getByRole('button', { name: /add hazard/i }))
    await user.click(await screen.findByRole('option', { name: 'Manual Handling' }))

    const card = await screen.findByTestId('hazard-card')
    expect(within(card).getByDisplayValue('Manual Handling')).toBeTruthy()
    expect(within(card).getAllByText('12 | Severe').length).toBeGreaterThan(0)
    expect(within(card).getAllByText('4 | Tolerable').length).toBeGreaterThan(0)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(repo.saveRiskAssessment).toHaveBeenCalledTimes(1))
    const input = repo.saveRiskAssessment.mock.calls[0]![0]
    expect(input).toMatchObject({ id: 'ra-1', production_id: 'prod-1', shoot_day_id: 'day-1', shoot_day_unit_ids: ['sdu-1'] })
    expect(input.hazards).toHaveLength(1)
    expect(input.hazards[0]).toMatchObject({
      name: 'Manual Handling',
      severity_before: 4,
      probability_before: 3,
      severity_after: 2,
      probability_after: 2,
      at_risk_crew: 1,
    })
    expect(input.hazards[0].id).toBeUndefined()
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
  })

  it('changes a rating from the matrix, keeps the hazard id, and saves the new value', async () => {
    repo.getRiskAssessment.mockResolvedValue(ra({ hazards: [hazardRow] as never }))
    const user = userEvent.setup()
    renderEditor()
    const card = await screen.findByTestId('hazard-card')

    const after = within(card).getByRole('radiogroup', { name: /risk after controls/i })
    await user.click(within(after).getByRole('radio', { name: /Severity 3, probability 3/ }))
    expect(within(card).getAllByText('9 | Moderate').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(repo.saveRiskAssessment).toHaveBeenCalledTimes(1))
    expect(repo.saveRiskAssessment.mock.calls[0]![0].hazards[0]).toMatchObject({
      id: 'hz-1',
      severity_after: 3,
      probability_after: 3,
      severity_before: 4,
      probability_before: 3,
    })
  })

  it('requires a hazard name before saving', async () => {
    const user = userEvent.setup()
    renderEditor()
    await screen.findByDisplayValue('Warehouse')
    await user.click(screen.getByRole('button', { name: /add hazard/i }))
    await user.click(await screen.findByRole('option', { name: 'Blank hazard' }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Name the hazard')).toBeTruthy()
    expect(repo.saveRiskAssessment).not.toHaveBeenCalled()
  })

  it('approves with the signed-in user prefilled as approver', async () => {
    repo.getRiskAssessment.mockResolvedValue(ra({ hazards: [hazardRow] as never }))
    const approved = ra({
      hazards: [hazardRow] as never,
      status: 'approved',
      approved_by: 'Dana Director',
      approved_at: '2026-06-09T10:00:00Z',
      updated_at: 't3',
    })
    repo.approveRiskAssessment.mockImplementation(async () => {
      repo.getRiskAssessment.mockResolvedValue(approved) // what a refetch now returns
      return approved
    })
    const user = userEvent.setup()
    renderEditor()
    await screen.findByTestId('hazard-card')

    const approve = screen.getByRole('button', { name: /^approve$/i }) as HTMLButtonElement
    expect(approve.disabled).toBe(false)
    await user.click(approve)
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('Approved by') as HTMLInputElement).value).toBe('Dana Director')
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(repo.approveRiskAssessment).toHaveBeenCalledWith('ra-1', 'Dana Director'))
    expect(await screen.findByText('Approved')).toBeTruthy()
    // Once approved, the Approve button is gone.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull())
  })

  it('blocks approving while there are unsaved changes', async () => {
    repo.getRiskAssessment.mockResolvedValue(ra({ hazards: [hazardRow] as never }))
    const user = userEvent.setup()
    renderEditor()
    await screen.findByTestId('hazard-card')
    await user.type(screen.getByLabelText('Location name'), ' 2')
    const approve = screen.getByRole('button', { name: /^approve$/i }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(approve.title).toBe('Save your changes before approving')
    expect((screen.getByRole('button', { name: /export pdf/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('warns that saving an approved RAMS will revert it to draft', async () => {
    repo.getRiskAssessment.mockResolvedValue(
      ra({ hazards: [hazardRow] as never, status: 'approved', approved_by: 'Boss', approved_at: '2026-06-09T10:00:00Z' })
    )
    const user = userEvent.setup()
    renderEditor()
    await screen.findByTestId('hazard-card')
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText(/by Boss/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull()

    await user.type(screen.getByLabelText('Location name'), ' 2')
    expect(screen.getByText(/saving will revert this to draft/i)).toBeTruthy()
  })
})
