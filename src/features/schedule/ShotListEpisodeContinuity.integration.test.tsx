// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ShotListPage } from '@/features/schedule/shot-list-page'
import type { Episode, Scene } from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

const schedSvc = vi.hoisted(() => ({
  listScenesByProduction: vi.fn(),
  listShotsByScene: vi.fn(),
  createScene: vi.fn(),
  createShot: vi.fn(),
  deleteShot: vi.fn(),
  updateScene: vi.fn(),
  updateShot: vi.fn(),
}))

vi.mock('@/lib/db/repositories/schedule', () => schedSvc)

vi.mock('@/lib/db/repositories/location', () => ({
  listLocationsByProduction: vi.fn(async () => []),
}))

vi.mock('@/lib/db/repositories/scene-cast', () => ({
  listSceneCastByScene: vi.fn(async () => []),
  addSceneCast: vi.fn(),
  removeSceneCast: vi.fn(),
}))

vi.mock('@/lib/db/repositories/shot-cast', () => ({
  listShotCastByShotIds: vi.fn(async () => new Map()),
  addShotCast: vi.fn(),
  removeShotCast: vi.fn(),
}))

vi.mock('@/lib/db/repositories/person', () => ({
  listCast: vi.fn(async () => []),
}))

const epRepo = vi.hoisted(() => ({
  listEpisodesByProduction: vi.fn(),
  getEpisodeByIdForProductionIncludeArchived: vi.fn(),
}))

vi.mock('@/lib/db/repositories/episodes', () => epRepo)

vi.mock('@/lib/db/repositories/equipment-terms', () => ({
  listEquipmentTermsByProductionAndType: vi.fn(async () => []),
  upsertEquipmentTerm: vi.fn(),
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: {
      id: 'prod-1',
      name: 'P',
      slug: 'p',
      is_episodic: true,
      currency_code: 'GBP',
      notes: null,
      wrapped_at: null,
      archived_at: null,
      created_from_template: null,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    },
    productions: [],
    refetchProductions: vi.fn(),
    setCurrentProductionId: vi.fn(),
    getSelectedBudgetRevisionId: () => null,
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

function ep(over: Partial<Episode>): Episode {
  return {
    id: 'e-a',
    production_id: 'prod-1',
    name: 'Alpha',
    sort_order: 0,
    ...soft,
    ...over,
  }
}

describe('ShotListPage episode continuity', () => {
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
    schedSvc.listShotsByScene.mockResolvedValue([])
    epRepo.listEpisodesByProduction.mockResolvedValue([
      ep({ id: 'e-b', name: 'Beta', sort_order: 0 }),
      ep({ id: 'e-c', name: 'Gamma', sort_order: 1 }),
    ])
    epRepo.getEpisodeByIdForProductionIncludeArchived.mockImplementation(
      async (_prod: string, eid: string) => {
        if (eid === 'e-a')
          return ep({ id: 'e-a', name: 'Alpha', sort_order: -1, deleted_at: '2025-01-01' })
        return null
      }
    )
    const archivedScene: Scene = {
      id: 'sc-arch',
      production_id: 'prod-1',
      episode_id: 'e-a',
      scene_number: '1',
      heading: null,
      title: null,
      description: null,
      int_ext: 'INT',
      day_night: 'DAY',
      page_eighths: null,
      location_id: null,
      duration_minutes: null,
      ...soft,
    }
    schedSvc.listScenesByProduction.mockResolvedValue([archivedScene])
  })

  afterEach(() => {
    cleanup()
  })

  it('New scene episode select lists active episodes in order and excludes archived', async () => {
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(epRepo.listEpisodesByProduction).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /new scene/i }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByText('New scene')).toBeTruthy()

    const newSceneCombos = within(dlg).getAllByRole('combobox')
    await user.click(newSceneCombos[0]!)
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: 'Beta' })).toBeTruthy()
    expect(within(list).getByRole('option', { name: 'Gamma' })).toBeTruthy()
    expect(within(list).queryByRole('option', { name: /Alpha/ })).toBeNull()
  })

  it('Edit scene shows archived assignment as readable option', async () => {
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(schedSvc.listScenesByProduction).toHaveBeenCalled())
    const sceneCombos = screen.getAllByRole('combobox')
    await user.click(sceneCombos[0]!)
    await user.click(await screen.findByRole('option', { name: /^\s*1\./ }))

    await user.click(screen.getByRole('button', { name: /edit scene/i }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByText('Edit scene')).toBeTruthy()

    await waitFor(() =>
      expect(epRepo.getEpisodeByIdForProductionIncludeArchived).toHaveBeenCalledWith('prod-1', 'e-a')
    )

    const editCombos = within(dlg).getAllByRole('combobox')
    await user.click(editCombos[0]!)
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: /Alpha \(archived\)/ })).toBeTruthy()
  })
})
