// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EpisodesSettingsSection } from '@/features/settings/EpisodesSettingsSection'
import { SettingsPage } from '@/features/settings/page'
import type { Episode } from '@/lib/db/types'

const episodeSvc = vi.hoisted(() => ({
  loadEpisodesForSettings: vi.fn(),
  appendEpisode: vi.fn(),
  renameEpisode: vi.fn(),
  reorderEpisodes: vi.fn(),
  archiveEpisode: vi.fn(),
  deleteEpisodeClearingReferences: vi.fn(),
}))

vi.mock('@/lib/db/episodeManagementService', () => ({
  loadEpisodesForSettings: episodeSvc.loadEpisodesForSettings,
  appendEpisode: episodeSvc.appendEpisode,
  renameEpisode: episodeSvc.renameEpisode,
  reorderEpisodes: episodeSvc.reorderEpisodes,
  archiveEpisode: episodeSvc.archiveEpisode,
  deleteEpisodeClearingReferences: episodeSvc.deleteEpisodeClearingReferences,
}))

const settingsVisibility = vi.hoisted(() => ({
  isEpisodic: true,
}))

function prodStub(isEpisodic: boolean) {
  return {
    id: 'prod-1',
    name: 'Test',
    slug: 'test',
    currency_code: 'GBP',
    notes: null,
    is_episodic: isEpisodic,
    wrapped_at: null,
    archived_at: null,
    created_from_template: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
  }
}

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: prodStub(settingsVisibility.isEpisodic),
    productions: [prodStub(settingsVisibility.isEpisodic)],
    refetchProductions: vi.fn(),
    setCurrentProductionId: vi.fn(),
    getSelectedBudgetRevisionId: () => 'rev-1',
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
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

vi.mock('@/lib/db/repositories/production', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/repositories/production')>(
    '@/lib/db/repositories/production'
  )
  return {
    ...actual,
    getProductionBySlug: vi.fn(),
  }
})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function wrap(ui: React.ReactElement) {
  const qc = makeQueryClient()
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

const baseEpisode = (overrides: Partial<Episode>): Episode => ({
  id: 'e1',
  production_id: 'prod-1',
  name: 'E1',
  sort_order: 0,
  created_at: 't',
  updated_at: 't',
  deleted_at: null,
  ...overrides,
})

describe('EpisodesSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([
      baseEpisode({ id: 'a', name: 'Alpha', sort_order: 0 }),
      baseEpisode({ id: 'b', name: 'Beta', sort_order: 1, deleted_at: '2025-01-01' }),
    ])
    episodeSvc.appendEpisode.mockResolvedValue(baseEpisode({ id: 'c', name: 'Gamma', sort_order: 2 }))
    episodeSvc.renameEpisode.mockImplementation(async () => baseEpisode({ id: 'a', name: 'Renamed', sort_order: 0 }))
    episodeSvc.reorderEpisodes.mockResolvedValue(undefined)
    episodeSvc.archiveEpisode.mockResolvedValue(undefined)
    episodeSvc.deleteEpisodeClearingReferences.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders episodes in canonical order and marks archived', async () => {
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => {
      expect(episodeSvc.loadEpisodesForSettings).toHaveBeenCalledWith('prod-1')
      expect(screen.getByText('Alpha')).toBeTruthy()
    })
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(screen.getByText('Archived')).toBeTruthy()
  })

  it('create rejects blank name in dialog', async () => {
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /add episode/i }))
    const add = screen.getByRole('button', { name: /^add$/i }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
  })

  it('appendEpisode called with trimmed name', async () => {
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /add episode/i }))
    await user.type(screen.getByLabelText('Name'), '  New ep  ')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(episodeSvc.appendEpisode).toHaveBeenCalledWith('prod-1', 'New ep'))
  })

  it('rename calls service with trimmed name', async () => {
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
    await user.click(screen.getByLabelText('Rename'))
    const nameInput = document.getElementById('episode-edit-name')!
    expect(nameInput).toBeTruthy()
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(episodeSvc.renameEpisode).toHaveBeenCalledWith('prod-1', 'a', 'Renamed')
    )
  })

  it('move down triggers reorderEpisodes', async () => {
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([
      baseEpisode({ id: 'a', name: 'A', sort_order: 0 }),
      baseEpisode({ id: 'b', name: 'B', sort_order: 1 }),
    ])
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => screen.getAllByLabelText('Move down'))
    const moveDownButtons = screen.getAllByLabelText('Move down')
    await user.click(moveDownButtons[0]!)
    await waitFor(() =>
      expect(episodeSvc.reorderEpisodes).toHaveBeenCalledWith('prod-1', ['b', 'a'])
    )
  })

  it('disables archive when only one active episode', async () => {
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([baseEpisode({ id: 'solo', name: 'Only', sort_order: 0 })])
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => expect(screen.getByText('Only')).toBeTruthy())
    const archiveBtn = screen.getByLabelText('Archive') as HTMLButtonElement
    expect(archiveBtn.disabled).toBe(true)
  })

  it('archive calls service when confirmed in dialog', async () => {
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([
      baseEpisode({ id: 'a', name: 'A', sort_order: 0 }),
      baseEpisode({ id: 'b', name: 'B', sort_order: 1 }),
    ])
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => screen.getAllByLabelText('Archive'))
    const archiveButtons = screen.getAllByLabelText('Archive')
    await user.click(archiveButtons[0]!)
    await waitFor(() => expect(screen.getByLabelText('Confirm archive')).toBeTruthy())
    await user.click(screen.getByLabelText('Confirm archive'))
    await waitFor(() => expect(episodeSvc.archiveEpisode).toHaveBeenCalledWith('prod-1', 'a'))
  })

  it('disables delete episode when only one active episode', async () => {
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([baseEpisode({ id: 'solo', name: 'Only', sort_order: 0 })])
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => expect(screen.getByText('Only')).toBeTruthy())
    const deleteBtn = screen.getByLabelText('Delete episode') as HTMLButtonElement
    expect(deleteBtn.disabled).toBe(true)
  })

  it('delete episode calls service when confirmed in dialog', async () => {
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([
      baseEpisode({ id: 'a', name: 'A', sort_order: 0 }),
      baseEpisode({ id: 'b', name: 'B', sort_order: 1 }),
    ])
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => screen.getAllByLabelText('Delete episode'))
    const deleteButtons = screen.getAllByLabelText('Delete episode')
    await user.click(deleteButtons[0]!)
    await waitFor(() => expect(screen.getByLabelText('Confirm delete episode')).toBeTruthy())
    await user.click(screen.getByLabelText('Confirm delete episode'))
    await waitFor(() =>
      expect(episodeSvc.deleteEpisodeClearingReferences).toHaveBeenCalledWith('prod-1', 'a')
    )
  })

  it('delete archived episode calls service when confirmed in dialog', async () => {
    const user = userEvent.setup()
    render(wrap(<EpisodesSettingsSection productionId="prod-1" />))
    await waitFor(() => expect(screen.getByLabelText('Delete archived episode')).toBeTruthy())
    await user.click(screen.getByLabelText('Delete archived episode'))
    await waitFor(() => expect(screen.getByLabelText('Confirm delete episode')).toBeTruthy())
    await user.click(screen.getByLabelText('Confirm delete episode'))
    await waitFor(() =>
      expect(episodeSvc.deleteEpisodeClearingReferences).toHaveBeenCalledWith('prod-1', 'b')
    )
  })
})

describe('SettingsPage episodic visibility', () => {
  afterEach(() => {
    cleanup()
    settingsVisibility.isEpisodic = true
  })

  it('shows Episodes section when production is episodic', async () => {
    settingsVisibility.isEpisodic = true
    episodeSvc.loadEpisodesForSettings.mockResolvedValue([baseEpisode({ name: 'Only', sort_order: 0 })])
    render(wrap(<SettingsPage />))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Episodes' })).toBeTruthy())
  })

  it('hides Episodes section when production is not episodic', async () => {
    settingsVisibility.isEpisodic = false
    render(wrap(<SettingsPage />))
    await waitFor(() => expect(screen.getByText('Episodic production')).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Episodes' })).toBeNull()
  })
})
