// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DeliverablesPage } from '@/features/deliverables/page'
import type { Deliverable } from '@/lib/db/types'

const listDel = vi.hoisted(() => vi.fn())
const listTemplates = vi.hoisted(() => vi.fn())
const createDel = vi.hoisted(() => vi.fn())
const listEpActive = vi.hoisted(() => vi.fn())
const listEpManage = vi.hoisted(() => vi.fn())
const getSpecs = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/repositories/deliverable', () => ({
  listDeliverablesByProduction: listDel,
  createDeliverable: createDel,
  updateDeliverable: vi.fn(),
  deleteDeliverable: vi.fn(),
  getTechnicalSpecByDeliverable: vi.fn(),
  getTechnicalSpecsByDeliverableIds: getSpecs,
  upsertTechnicalSpec: vi.fn(),
}))

vi.mock('@/lib/db/repositories/deliverableTemplates', () => ({
  listDeliverableTemplates: listTemplates,
  applyDeliverableTemplateToProduction: vi.fn(),
}))

vi.mock('@/lib/db/repositories/episodes', () => ({
  listEpisodesByProduction: listEpActive,
  listEpisodesForProductionManagement: listEpManage,
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

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function del(over: Partial<Deliverable> = {}): Deliverable {
  return {
    id: 'd1',
    production_id: 'prod-1',
    episode_id: null,
    name: 'Master',
    due_date: null,
    status: 'not_started',
    recipient: null,
    delivery_method: null,
    delivered_by: null,
    delivered_at: null,
    approval_status: 'pending',
    ...soft,
    ...over,
  }
}

describe('DeliverablesPage episodic scope', () => {
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
    listTemplates.mockResolvedValue([])
    listDel.mockResolvedValue([del()])
    getSpecs.mockResolvedValue([])
    listEpActive.mockResolvedValue([])
    listEpManage.mockResolvedValue([])
    createDel.mockResolvedValue(del({ id: 'new' }))
  })

  afterEach(() => {
    cleanup()
  })

  it('non-episodic: no Show / Scope column', async () => {
    render(
      <QueryClientProvider client={client}>
        <DeliverablesPage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Master')).toBeTruthy())
    expect(screen.queryByText('Show')).toBeNull()
    expect(screen.queryByText('Scope', { selector: 'th' })).toBeNull()
  })

  it('episodic: Show filter, Scope column, and scope in add dialog', async () => {
    episodicFlag.isEpisodic = true
    listEpActive.mockResolvedValue([
      { id: 'ep-1', production_id: 'prod-1', name: 'E1', sort_order: 0, ...soft },
    ])
    listEpManage.mockResolvedValue([
      { id: 'ep-1', production_id: 'prod-1', name: 'E1', sort_order: 0, ...soft },
    ])

    render(
      <QueryClientProvider client={client}>
        <DeliverablesPage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Show')).toBeTruthy())
    expect(screen.getByRole('columnheader', { name: 'Scope' })).toBeTruthy()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add deliverable/i }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByText('Scope')).toBeTruthy()
    await user.click(within(dlg).getAllByRole('combobox')[0]!)
    expect(await screen.findByRole('option', { name: 'Specific episode' })).toBeTruthy()
  })

  it('episodic: changing Show to episode issues filtered list query', async () => {
    episodicFlag.isEpisodic = true
    listEpActive.mockResolvedValue([
      { id: 'ep-1', production_id: 'prod-1', name: 'E1', sort_order: 0, ...soft },
    ])
    listEpManage.mockResolvedValue([
      { id: 'ep-1', production_id: 'prod-1', name: 'E1', sort_order: 0, ...soft },
    ])
    listDel.mockImplementation(async (_pid: string, opts?: { filter?: string; episodeId?: string }) => {
      if (opts?.filter === 'episode' && opts.episodeId === 'ep-1') {
        return [del({ id: 'dx', name: 'Ep only', episode_id: 'ep-1' })]
      }
      return [del(), del({ id: 'dx', name: 'Ep only', episode_id: 'ep-1' })]
    })

    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <DeliverablesPage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Ep only')).toBeTruthy())

    const combos = screen.getAllByRole('combobox')
    await user.click(combos[0]!)
    await user.click(await screen.findByRole('option', { name: 'E1' }))
    await waitFor(() =>
      expect(listDel).toHaveBeenCalledWith('prod-1', { filter: 'episode', episodeId: 'ep-1' })
    )
  })

  it('episodic: Show filter resets to all when production changes', async () => {
    episodicFlag.isEpisodic = true
    listEpActive.mockResolvedValue([
      { id: 'ep-1', production_id: 'prod-1', name: 'E1', sort_order: 0, ...soft },
    ])
    listEpManage.mockResolvedValue([
      { id: 'ep-1', production_id: 'prod-1', name: 'E1', sort_order: 0, ...soft },
    ])
    listDel.mockResolvedValue([del()])

    const user = userEvent.setup()
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <DeliverablesPage key={currentProdId.id} />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Show')).toBeTruthy())
    const combos = screen.getAllByRole('combobox')
    await user.click(combos[0]!)
    await user.click(await screen.findByRole('option', { name: 'Project-wide' }))

    currentProdId.id = 'prod-2'
    rerender(
      <QueryClientProvider client={client}>
        <DeliverablesPage key={currentProdId.id} />
      </QueryClientProvider>
    )
    await waitFor(() => {
      const prod2Calls = listDel.mock.calls.filter(([pid]) => pid === 'prod-2')
      const last = prod2Calls[prod2Calls.length - 1]
      expect(last?.[1]).toEqual({ filter: 'all' })
    })
  })
})
