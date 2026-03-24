// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProductionsPage } from '@/features/productions/page'
import { SettingsPage } from '@/features/settings/page'

const createFromTemplate = vi.hoisted(() => vi.fn())
const listProductionsFn = vi.hoisted(() => vi.fn())
const enableEpisodicProductionFn = vi.hoisted(() => vi.fn())

vi.mock('@/features/productions/useApfActions', () => ({
  useApfActions: () => ({
    apfBusy: null,
    handleImportApf: vi.fn(),
    handleExportApf: vi.fn(),
  }),
}))

vi.mock('@/lib/db/createProductionFromTemplate', () => ({
  createProductionFromTemplate: createFromTemplate,
}))

vi.mock('@/lib/db/episodicProductionService', () => ({
  enableEpisodicProduction: enableEpisodicProductionFn,
}))

const prodCtx = vi.hoisted(() => ({
  currentProductionId: null as string | null,
  currentProduction: null as {
    id: string
    name: string
    is_episodic: boolean
  } | null,
  refetchProductions: vi.fn(),
  setCurrentProductionId: vi.fn(),
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: prodCtx.currentProductionId,
    currentProduction: prodCtx.currentProduction,
    productions: prodCtx.currentProduction ? [prodCtx.currentProduction] : [],
    refetchProductions: prodCtx.refetchProductions,
    setCurrentProductionId: prodCtx.setCurrentProductionId,
    getSelectedBudgetRevisionId: () => null,
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
}))

vi.mock('@/lib/db/repositories/production', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/repositories/production')>(
    '@/lib/db/repositories/production'
  )
  return {
    ...actual,
    listProductions: listProductionsFn,
    findExistingDemoTemplateProduction: vi.fn(async () => null),
    updateProduction: vi.fn(),
    permanentlyDeleteProduction: vi.fn(),
    duplicateProduction: vi.fn(),
    deleteProduction: vi.fn(),
    archiveProduction: vi.fn(),
    unarchiveProduction: vi.fn(),
  }
})

const episodeSvc = vi.hoisted(() => ({
  loadEpisodesForSettings: vi.fn(),
  appendEpisode: vi.fn(),
  renameEpisode: vi.fn(),
  reorderEpisodes: vi.fn(),
  archiveEpisode: vi.fn(),
}))

vi.mock('@/lib/db/episodeManagementService', () => ({
  loadEpisodesForSettings: episodeSvc.loadEpisodesForSettings,
  appendEpisode: episodeSvc.appendEpisode,
  renameEpisode: episodeSvc.renameEpisode,
  reorderEpisodes: episodeSvc.reorderEpisodes,
  archiveEpisode: episodeSvc.archiveEpisode,
}))

vi.mock('@/hooks/useWorkingBudgetRevision', () => ({
  useWorkingBudgetRevision: () => ({
    data: { id: 'rev-1' },
    setSelectedRevisionId: vi.fn(),
  }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({
    displayCurrency: 'GBP',
    setDisplayCurrency: vi.fn(),
    conversionApiEnabled: true,
    setConversionApiEnabled: vi.fn(),
    conversionBanner: null,
  }),
}))

vi.mock('@/features/settings/CrewStructureEditor', () => ({
  CrewStructureEditor: () => null,
}))

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => {}),
  FIRST_LAUNCH_TUTORIAL_SEEN_KEY: 'first_launch',
  setFirstLaunchTutorialSeen: vi.fn(async () => {}),
  API_CALL_TRACKING_SETTING_KEY: 'api_track',
  OPENROUTESERVICE_API_KEY_SETTING: 'ors',
}))

vi.mock('@/lib/db/repositories/budgetAccounts', () => ({
  listAccounts: vi.fn(async () => []),
  createAccount: vi.fn(),
  updateAccountName: vi.fn(),
  updateAccountColor: vi.fn(),
  archiveAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  hardDeleteAccount: vi.fn(),
  getHardDeleteEligibleAccountIds: vi.fn(async () => new Set<string>()),
}))

vi.mock('@/lib/db/repositories/costReportGroups', () => ({
  listCostReportGroups: vi.fn(async () => []),
  createCostReportGroup: vi.fn(),
  updateCostReportGroup: vi.fn(),
  deleteCostReportGroup: vi.fn(),
  listGroupAccountIds: vi.fn(async () => []),
  setGroupAccountIds: vi.fn(),
}))

vi.mock('@/lib/db/seed/demoProductionSeed', () => ({
  ensureDemoData: vi.fn(),
  resetDemoData: vi.fn(),
  getLastSeededAt: vi.fn(async () => null),
  getSeedVersion: vi.fn(async () => null),
  verifyCascades: vi.fn(async () => ({ ok: true, message: '' })),
}))

function wrapProductions(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

function wrapSettings(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProductionsPage episodic wizard', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
    vi.clearAllMocks()
    listProductionsFn.mockResolvedValue([])
    createFromTemplate.mockResolvedValue({
      id: 'new-prod',
      name: 'Series A',
      slug: 'series-a',
      is_episodic: true,
      currency_code: 'GBP',
      notes: null,
      wrapped_at: null,
      archived_at: null,
      created_from_template: 'default',
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('warns that episodic mode is irreversible and requires a first episode name', async () => {
    const user = userEvent.setup()
    render(wrapProductions(<ProductionsPage />))
    await user.click(screen.getByRole('button', { name: /new production/i }))

    const dialog = await screen.findByRole('dialog', { name: /new production/i })
    await waitFor(() => {
      expect(document.getElementById('is-episodic')).toBeTruthy()
    })
    await user.click(document.getElementById('is-episodic')!)

    expect(
      within(dialog).getByText(/cannot turn off episodic mode after the project is created/i)
    ).toBeTruthy()

    await user.type(screen.getByPlaceholderText(/e.g. My Feature/i), 'Series A')
    await user.click(within(dialog).getByRole('button', { name: /^Create$/i }))

    await waitFor(() =>
      expect(screen.getByText('Enter a name for the first episode')).toBeTruthy()
    )

    await user.type(screen.getByPlaceholderText(/e.g. Episode 1 or 101/i), '  Ep One  ')
    await user.click(within(screen.getByRole('dialog', { name: /new production/i })).getByRole('button', { name: /^Create$/i }))

    await waitFor(() =>
      expect(createFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Series A',
          isEpisodic: true,
          initialEpisodeName: 'Ep One',
          template: 'default',
        })
      )
    )
  })
})

describe('Settings enable episodic dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prodCtx.currentProductionId = 'prod-1'
    prodCtx.currentProduction = {
      id: 'prod-1',
      name: 'Feature',
      slug: 'feature',
      currency_code: 'GBP',
      notes: null,
      is_episodic: false,
      wrapped_at: null,
      archived_at: null,
      created_from_template: null,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    }
    listProductionsFn.mockResolvedValue([])
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([])
    enableEpisodicProductionFn.mockResolvedValue({
      id: 'prod-1',
      name: 'Feature',
      is_episodic: true,
      slug: 'feature',
      currency_code: 'GBP',
      notes: null,
      wrapped_at: null,
      archived_at: null,
      created_from_template: null,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    })
  })

  afterEach(() => {
    cleanup()
    prodCtx.currentProductionId = null
    prodCtx.currentProduction = null
  })

  it('shows permanent choice copy and validates first episode before calling service', async () => {
    const user = userEvent.setup()
    render(wrapSettings(<SettingsPage />))

    await user.click(await screen.findByRole('button', { name: /Enable episodic mode/i }))

    expect(screen.getByText(/This choice is permanent/i)).toBeTruthy()
    expect(screen.getByText(/This cannot be undone/i)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^Enable episodic mode$/i }))

    await waitFor(() =>
      expect(screen.getByText('Enter a name for the first episode')).toBeTruthy()
    )
    expect(enableEpisodicProductionFn).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/First episode name/i), 'Pilot')
    await user.click(screen.getByRole('button', { name: /^Enable episodic mode$/i }))

    await waitFor(() =>
      expect(enableEpisodicProductionFn).toHaveBeenCalledWith({
        productionId: 'prod-1',
        initialEpisodeName: 'Pilot',
      })
    )
  })
})
