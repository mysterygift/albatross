// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ShotListPage } from '@/features/schedule/shot-list-page'
import type { Scene, ScriptPage, ScriptSection, ScriptSectionRange, Shot } from '@/lib/db/types'

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

const sectionsSvc = vi.hoisted(() => ({
  listSectionsByScene: vi.fn(),
  listSectionsByShot: vi.fn(),
  listRangesBySectionIds: vi.fn(),
  listCharactersBySectionIds: vi.fn(),
  getLinkedSectionCountsByShotIds: vi.fn(),
  replaceShotSectionLinks: vi.fn(),
}))

vi.mock('@/lib/db/repositories/scriptSections', () => sectionsSvc)

const listPages = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/repositories/scriptPages', () => ({
  listScriptPagesByScriptVersion: listPages,
}))

vi.mock('@/lib/db/repositories/scriptVersions', () => ({
  listScriptVersionsByProduction: vi.fn(async () => []),
}))

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
  clearShotCastForScene: vi.fn(),
}))

vi.mock('@/lib/db/repositories/person', () => ({
  listCast: vi.fn(async () => []),
}))

vi.mock('@/lib/db/repositories/episodes', () => ({
  listEpisodesByProduction: vi.fn(async () => []),
  getEpisodeByIdForProductionIncludeArchived: vi.fn(async () => null),
}))

vi.mock('@/lib/db/repositories/equipment-terms', () => ({
  listEquipmentTermsByProductionAndType: vi.fn(async () => []),
  upsertEquipmentTerm: vi.fn(),
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: { id: 'prod-1', name: 'P', is_episodic: false },
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

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '1',
    title: 'Kitchen',
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: null,
    location_id: null,
    duration_minutes: null,
    ...soft,
    ...over,
  }
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    scene_id: 'scene-1',
    shot_number: '1A',
    shot_description: null,
    subject: null,
    shot_size: null,
    support: null,
    lens: null,
    duration_seconds: null,
    estimated_shoot_minutes: null,
    camera_movement: null,
    notes: null,
    ...soft,
    ...over,
  }
}

function section(over: Partial<ScriptSection> = {}): ScriptSection {
  return {
    id: 'sec-1',
    production_id: 'prod-1',
    script_version_id: 'ver-1',
    scene_id: 'scene-1',
    episode_id: null,
    label: 'Dialogue A',
    section_type: 'dialogue',
    status: 'unplanned',
    notes: null,
    is_manual: 1,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

function range(over: Partial<ScriptSectionRange> = {}): ScriptSectionRange {
  return {
    id: 'range-1',
    section_id: 'sec-1',
    start_page: '1',
    start_eighth: 0,
    end_page: '1',
    end_eighth: 8,
    start_offset: null,
    end_offset: null,
    ...soft,
    ...over,
  }
}

function scriptPage(over: Partial<ScriptPage> = {}): ScriptPage {
  return {
    id: 'page-1',
    script_version_id: 'ver-1',
    scene_id: 'scene-1',
    page_number: '1',
    page_index: 0,
    content: 'Hello there.',
    eighths: 8,
    ...soft,
    ...over,
  }
}

async function selectScene(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('combobox')[0]!)
  await user.click(await screen.findByRole('option', { name: /^\s*1\./ }))
}

describe('ShotListPage script-section linking', () => {
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

    schedSvc.listScenesByProduction.mockResolvedValue([scene()])
    schedSvc.listShotsByScene.mockResolvedValue([shot()])
    sectionsSvc.listSectionsByScene.mockResolvedValue([
      section({ id: 'sec-1', label: 'Dialogue A', section_type: 'dialogue', is_manual: 1 }),
      section({ id: 'sec-2', label: 'Action B', section_type: 'action', is_manual: 0 }),
    ])
    sectionsSvc.listSectionsByShot.mockResolvedValue([])
    sectionsSvc.listRangesBySectionIds.mockResolvedValue(
      new Map([
        ['sec-1', [range({ id: 'range-1', section_id: 'sec-1', start_page: '1', end_page: '1' })]],
        ['sec-2', [range({ id: 'range-2', section_id: 'sec-2', start_page: '2', end_page: '2' })]],
      ])
    )
    sectionsSvc.listCharactersBySectionIds.mockResolvedValue(
      new Map([
        ['sec-1', [{ id: 'char-1', section_id: 'sec-1', person_id: null, character_name: 'ALICE', ...soft }]],
      ])
    )
    listPages.mockResolvedValue([
      scriptPage({ id: 'page-1', page_number: '1', page_index: 0, content: 'Hello there.' }),
      scriptPage({
        id: 'page-2',
        page_number: '2',
        page_index: 1,
        content: 'MICHAEL enters the room.',
      }),
    ])
    sectionsSvc.getLinkedSectionCountsByShotIds.mockResolvedValue(new Map<string, number>())
    sectionsSvc.replaceShotSectionLinks.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a "No coverage" badge for a shot with no linked sections', async () => {
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(schedSvc.listScenesByProduction).toHaveBeenCalled())
    await selectScene(user)

    await waitFor(() => expect(screen.getByText('1A')).toBeTruthy())
    expect(screen.getByText('No coverage')).toBeTruthy()
  })

  it('shows a linked-count badge when the shot has coverage', async () => {
    sectionsSvc.getLinkedSectionCountsByShotIds.mockResolvedValue(
      new Map<string, number>([['shot-1', 2]])
    )
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(schedSvc.listScenesByProduction).toHaveBeenCalled())
    await selectScene(user)

    await waitFor(() => expect(screen.getByText('2 linked')).toBeTruthy())
  })

  it('links sections to a shot via the manage dialog', async () => {
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(schedSvc.listScenesByProduction).toHaveBeenCalled())
    await selectScene(user)

    await waitFor(() => expect(screen.getByText('1A')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Sections' }))

    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByText('Dialogue A')).toBeTruthy()
    expect(within(dlg).getByText('Action B')).toBeTruthy()

    await user.click(within(dlg).getByRole('checkbox', { name: 'Link section Dialogue A' }))
    await user.click(within(dlg).getByRole('button', { name: /Save links/ }))

    await waitFor(() => expect(sectionsSvc.replaceShotSectionLinks).toHaveBeenCalledTimes(1))
    expect(sectionsSvc.replaceShotSectionLinks.mock.calls[0]).toEqual(['shot-1', ['sec-1']])
  })

  it('pre-selects existing links and can unlink them', async () => {
    sectionsSvc.listSectionsByShot.mockResolvedValue([
      section({ id: 'sec-1', label: 'Dialogue A' }),
    ])
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(schedSvc.listScenesByProduction).toHaveBeenCalled())
    await selectScene(user)

    await waitFor(() => expect(screen.getByText('1A')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Sections' }))
    const dlg = await screen.findByRole('dialog')

    // Toggle the already-linked section off via checkbox, then save -> empties the links.
    await user.click(within(dlg).getByRole('checkbox', { name: 'Link section Dialogue A' }))
    await user.click(within(dlg).getByRole('button', { name: /Save links/ }))

    await waitFor(() => expect(sectionsSvc.replaceShotSectionLinks).toHaveBeenCalledTimes(1))
    expect(sectionsSvc.replaceShotSectionLinks.mock.calls[0]).toEqual(['shot-1', []])
  })

  it('shows script text preview when clicking a section row', async () => {
    const user = userEvent.setup()
    render(wrap(<ShotListPage />))
    await waitFor(() => expect(schedSvc.listScenesByProduction).toHaveBeenCalled())
    await selectScene(user)

    await waitFor(() => expect(screen.getByText('1A')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Sections' }))

    const dlg = await screen.findByRole('dialog')
    await waitFor(() => expect(listPages).toHaveBeenCalled())

    expect(within(dlg).getByText('Hello there.')).toBeTruthy()
    expect(within(dlg).getByText(/Characters: ALICE/)).toBeTruthy()
    expect(within(dlg).getByText(/showing pages for .Dialogue A/)).toBeTruthy()

    await user.click(within(dlg).getByRole('button', { name: /Action B/ }))

    await waitFor(() =>
      expect(within(dlg).getByText(/showing pages for .Action B/)).toBeTruthy()
    )
    expect(within(dlg).getByText('MICHAEL enters the room.')).toBeTruthy()
  })
})
