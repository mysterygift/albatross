// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MusicClearancePage } from '@/features/music-clearance/page'
import type { MusicTrack } from '@/lib/db/types'

const repo = vi.hoisted(() => ({
  listMusicTracksByProduction: vi.fn(),
  createMusicTrack: vi.fn(),
  updateMusicTrack: vi.fn(),
}))

const prodSvc = vi.hoisted(() => ({
  getProductionById: vi.fn(),
}))

const episodeSvc = vi.hoisted(() => ({
  listEpisodesForProductionManagement: vi.fn(),
}))

vi.mock('@/lib/db/repositories/music-clearance', () => ({
  listMusicTracksByProduction: repo.listMusicTracksByProduction,
  createMusicTrack: repo.createMusicTrack,
  updateMusicTrack: repo.updateMusicTrack,
}))

vi.mock('@/lib/db/repositories/production', () => ({
  getProductionById: prodSvc.getProductionById,
}))

vi.mock('@/lib/db/repositories/episodes', () => ({
  listEpisodesForProductionManagement: episodeSvc.listEpisodesForProductionManagement,
}))

const episodicFlag = vi.hoisted(() => ({ isEpisodic: false }))
const currentProdId = vi.hoisted(() => ({ id: 'prod-1' }))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: currentProdId.id,
    currentProduction: {
      id: currentProdId.id,
      name: 'P',
      is_episodic: episodicFlag.isEpisodic,
    },
    productions: [],
    refetchProductions: vi.fn(),
    setCurrentProductionId: vi.fn(),
    getSelectedBudgetRevisionId: () => null,
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
}))

vi.mock('@/hooks/useFirstLaunchTutorial', () => ({
  useFirstLaunchTutorial: () => ({
    progress: null,
    updateProgress: vi.fn(),
  }),
}))

vi.mock('@/lib/pdf', () => ({
  generateCueSheet: vi.fn(),
}))

vi.mock('@/lib/files', () => ({
  saveFileWithDialog: vi.fn(),
}))

function productionRow(isEpisodic: boolean) {
  return {
    id: 'prod-1',
    name: 'P',
    slug: 'p',
    notes: null,
    currency_code: 'GBP',
    is_episodic: isEpisodic,
    wrapped_at: null,
    archived_at: null,
    created_from_template: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
  }
}

function track(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 't1',
    production_id: 'prod-1',
    episode_id: null,
    title: 'Theme',
    artist: 'A',
    publisher_label: 'L',
    notes: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...overrides,
  }
}

describe('MusicClearancePage episodic UI', () => {
  let client: QueryClient

  beforeEach(() => {
    currentProdId.id = 'prod-1'
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
    episodicFlag.isEpisodic = false
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    prodSvc.getProductionById.mockResolvedValue(productionRow(false))
    repo.listMusicTracksByProduction.mockResolvedValue([track()])
    episodeSvc.listEpisodesForProductionManagement.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
  })

  it('non-episodic: no Scope column or Show filter', async () => {
    render(
      <QueryClientProvider client={client}>
        <MusicClearancePage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy())
    expect(screen.queryByText('Show')).toBeNull()
    expect(screen.queryByText('Scope')).toBeNull()
  })

  it('episodic: shows filter, scope column, and applies-to in add dialog', async () => {
    episodicFlag.isEpisodic = true
    prodSvc.getProductionById.mockResolvedValue(productionRow(true))
    episodeSvc.listEpisodesForProductionManagement.mockResolvedValue([
      {
        id: 'ep-1',
        production_id: 'prod-1',
        name: 'Episode One',
        sort_order: 0,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ])

    render(
      <QueryClientProvider client={client}>
        <MusicClearancePage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Show')).toBeTruthy())
    expect(screen.getByText('All tracks')).toBeTruthy()
    expect(screen.getByText('Scope')).toBeTruthy()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add track/i }))

    await waitFor(() => expect(screen.getByText('Applies to')).toBeTruthy())
    expect(screen.getByText('Project-wide assets are not tied to a single episode.')).toBeTruthy()
  })

  it('episodic: list query uses filter all by default', async () => {
    episodicFlag.isEpisodic = true
    prodSvc.getProductionById.mockResolvedValue(productionRow(true))
    episodeSvc.listEpisodesForProductionManagement.mockResolvedValue([
      {
        id: 'ep-1',
        production_id: 'prod-1',
        name: 'Episode One',
        sort_order: 0,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ])

    render(
      <QueryClientProvider client={client}>
        <MusicClearancePage />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(repo.listMusicTracksByProduction).toHaveBeenCalledWith('prod-1', { filter: 'all' })
    )
  })

  it('episodic: Show filter episode-specific calls list with episode filter; project-wide rows remain in data model', async () => {
    episodicFlag.isEpisodic = true
    prodSvc.getProductionById.mockResolvedValue(productionRow(true))
    episodeSvc.listEpisodesForProductionManagement.mockResolvedValue([
      {
        id: 'ep-1',
        production_id: 'prod-1',
        name: 'Episode One',
        sort_order: 0,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ])
    repo.listMusicTracksByProduction.mockImplementation(async (_pid, opts) => {
      if (opts?.filter === 'episode' && opts.episodeId === 'ep-1') {
        return [track({ id: 't-ep', title: 'Cue A', episode_id: 'ep-1' })]
      }
      return [
        track({ id: 't-all', title: 'Cue B', episode_id: null }),
        track({ id: 't-ep', title: 'Cue A', episode_id: 'ep-1' }),
      ]
    })

    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <MusicClearancePage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Cue B')).toBeTruthy())
    expect(screen.getByText('Cue A')).toBeTruthy()

    const showTriggers = screen.getAllByRole('combobox')
    await user.click(showTriggers[0]!)
    await user.click(await screen.findByRole('option', { name: 'Episode One' }))
    await waitFor(() =>
      expect(repo.listMusicTracksByProduction).toHaveBeenCalledWith('prod-1', {
        filter: 'episode',
        episodeId: 'ep-1',
      })
    )
  })

  it('episodic: Show filter resets to All tracks when production changes', async () => {
    episodicFlag.isEpisodic = true
    prodSvc.getProductionById.mockImplementation(async (id: string) => ({
      ...productionRow(true),
      id,
    }))
    episodeSvc.listEpisodesForProductionManagement.mockResolvedValue([
      {
        id: 'ep-1',
        production_id: 'prod-1',
        name: 'Episode One',
        sort_order: 0,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ])
    repo.listMusicTracksByProduction.mockResolvedValue([track()])

    const user = userEvent.setup()
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MusicClearancePage key={currentProdId.id} />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Show')).toBeTruthy())
    const showTriggers = screen.getAllByRole('combobox')
    await user.click(showTriggers[0]!)
    await user.click(await screen.findByRole('option', { name: 'Project-wide' }))

    currentProdId.id = 'prod-2'
    rerender(
      <QueryClientProvider client={client}>
        <MusicClearancePage key={currentProdId.id} />
      </QueryClientProvider>
    )
    await waitFor(() => {
      const prod2Calls = repo.listMusicTracksByProduction.mock.calls.filter(([pid]) => pid === 'prod-2')
      const last = prod2Calls[prod2Calls.length - 1]
      expect(last?.[1]).toEqual({ filter: 'all' })
    })
  })
})
