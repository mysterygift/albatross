// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { ScriptSectionsPage } from '@/features/schedule/script-sections-page'
import { buildSceneLines, rangeForRun, type LineRun } from '@/lib/db/scriptSectionLayout'
import type { SectionShotProgress } from '@/lib/db/scriptSectionStatus'
import type {
  Scene,
  ScriptPage,
  ScriptSection,
  ScriptSectionRange,
  ScriptVersion,
} from '@/lib/db/types'

const listVersions = vi.hoisted(() => vi.fn())
const listScenes = vi.hoisted(() => vi.fn())
const listShotsByScene = vi.hoisted(() => vi.fn())
const listPages = vi.hoisted(() => vi.fn())
const listSections = vi.hoisted(() => vi.fn())
const listRanges = vi.hoisted(() => vi.fn())
const listCharacters = vi.hoisted(() => vi.fn())
const applyLayout = vi.hoisted(() => vi.fn())
const setCut = vi.hoisted(() => vi.fn())
const softDeleteWithChildren = vi.hoisted(() => vi.fn())
const getLinkedSectionCounts = vi.hoisted(() => vi.fn())
const loadProgress = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/repositories/scriptVersions', () => ({
  listScriptVersionsByProduction: listVersions,
}))

vi.mock('@/lib/db/scriptSectionReconciliationService', () => ({
  reconcileScriptVersions: vi.fn(),
  applySafeShotLinkRemaps: vi.fn(),
  formatScriptVersionLabel: (v: { version_label?: string | null; title?: string | null; id: string }) =>
    v.version_label ?? v.title ?? v.id,
}))

vi.mock('@/lib/db/repositories/schedule', () => ({
  listScenesByProduction: listScenes,
  listShotsByScene: listShotsByScene,
}))

vi.mock('@/lib/db/repositories/location', () => ({
  listLocationsByProduction: vi.fn(async () => []),
}))

vi.mock('@/lib/db/repositories/scriptPages', () => ({
  listScriptPagesByScriptVersion: listPages,
}))

vi.mock('@/lib/db/repositories/scriptSections', () => ({
  listSectionsByScriptVersion: listSections,
  listRangesByScriptVersion: listRanges,
  listCharactersByScriptVersion: listCharacters,
  applyScriptSectionLayout: applyLayout,
  setScriptSectionCut: setCut,
  softDeleteSectionWithChildren: softDeleteWithChildren,
  getLinkedSectionCountsByShotIds: getLinkedSectionCounts,
}))

vi.mock('@/lib/db/scriptSectionStatusService', () => ({
  loadScriptVersionSectionProgress: loadProgress,
}))

vi.mock('@/hooks/useEffectiveDataSourceForProduction', () => ({
  useEffectiveDataSourceForProduction: () => ({ dataSourceKey: 'local_sqlite' }),
}))

const currentProdId = vi.hoisted(() => ({ id: 'prod-1' as string | null }))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: currentProdId.id,
    currentProduction: { id: currentProdId.id, name: 'P', is_episodic: false },
    productions: [],
    refetchProductions: vi.fn(),
    setCurrentProductionId: vi.fn(),
    getSelectedBudgetRevisionId: () => null,
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
}))

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function version(over: Partial<ScriptVersion> = {}): ScriptVersion {
  return {
    id: 'ver-1',
    production_id: 'prod-1',
    episode_id: null,
    title: 'Shooting Script',
    version_label: null,
    revision_colour: null,
    is_locked: 0,
    locked_pages_json: null,
    previous_script_version_id: null,
    ...soft,
    ...over,
  }
}

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '12',
    title: 'Harbour office',
    description: null,
    int_ext: 'INT',
    day_night: 'NIGHT',
    page_eighths: null,
    location_id: null,
    duration_minutes: null,
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
    label: 'Scene 12 — Page 14',
    section_type: 'action',
    status: 'unplanned',
    notes: null,
    is_manual: 0,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

const PAGE_TEXT = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? (i < 8 ? 'MAGGIE' : 'TOM') : `Line ${i}.`)).join('\n')
const page: ScriptPage = {
  id: 'page-14',
  script_version_id: 'ver-1',
  scene_id: 'scene-1',
  page_number: '14',
  page_index: 0,
  content: PAGE_TEXT,
  eighths: 8,
  ...soft,
}
const lines = buildSceneLines([page])

function rangeRow(sectionId: string, run: LineRun): ScriptSectionRange {
  return { id: `range-${sectionId}`, section_id: sectionId, ...rangeForRun(lines, run), ...soft } as ScriptSectionRange
}

function progressShot(over: Partial<SectionShotProgress> = {}): SectionShotProgress {
  return { shotId: 'shot-1', shotNumber: '12A', shootDays: [], printedTakes: [], sceneComplete: false, ...over }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ScriptSectionsPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

const rowFor = (code: string) => screen.getByRole('option', { name: new RegExp(`^${code.replace('.', '\\.')}`) })

describe('ScriptSectionsPage', () => {
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

    listVersions.mockResolvedValue([version()])
    listScenes.mockResolvedValue([scene()])
    listPages.mockResolvedValue([page])
    listSections.mockResolvedValue([
      section({ id: 'sec-a', created_at: '1' }),
      section({ id: 'sec-b', created_at: '2', is_manual: 1, section_type: 'custom' }),
    ])
    listRanges.mockResolvedValue(
      new Map([
        ['sec-a', [rangeRow('sec-a', { from: 0, to: 7 })]],
        ['sec-b', [rangeRow('sec-b', { from: 8, to: 15 })]],
      ])
    )
    listCharacters.mockResolvedValue(
      new Map([['sec-a', [{ id: 'c1', section_id: 'sec-a', person_id: null, character_name: 'MAGGIE', ...soft }]]])
    )
    loadProgress.mockResolvedValue({
      shotsBySectionId: new Map([
        [
          'sec-a',
          [
            progressShot({ shotId: 'shot-1', shotNumber: '12A', shootDays: [{ id: 'd6', dayNumber: 6, shootDate: '2026-10-08' }] }),
          ],
        ],
      ]),
      omittedSceneIds: new Set<string>(),
    })
    applyLayout.mockResolvedValue('sec-a')
    setCut.mockResolvedValue(section())
    softDeleteWithChildren.mockResolvedValue(undefined)
    getLinkedSectionCounts.mockResolvedValue(new Map<string, number>())
    listShotsByScene.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
  })

  it('groups sections under their scene with codes and a status set by the app', async () => {
    renderPage()
    await waitFor(() => expect(rowFor('12.1')).toBeTruthy())
    expect(rowFor('12.2')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Scene 12' })).toBeTruthy()
    expect(within(rowFor('12.1')).getByText('Scheduled · Day 6')).toBeTruthy()
    expect(within(rowFor('12.2')).getByText('No coverage')).toBeTruthy()
    expect(within(rowFor('12.1')).getByText('MAGGIE')).toBeTruthy()
    // The old manual status and badges are gone.
    expect(screen.queryByText('Unplanned')).toBeNull()
    expect(screen.queryByText('No shots')).toBeNull()
    expect(screen.queryByText('Generated')).toBeNull()
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(rowFor('12.1')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /^No coverage/ }))
    expect(screen.queryByRole('option', { name: /^12\.1/ })).toBeNull()
    expect(rowFor('12.2')).toBeTruthy()
  })

  it('shows progress steps and the shot table for the selected section', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(rowFor('12.1')).toBeTruthy())
    await user.click(rowFor('12.1'))
    const steps = await screen.findByRole('list', { name: 'Section progress' })
    expect(within(steps).getByText('1 shot linked: 12A')).toBeTruthy()
    expect(within(steps).getByText('On Day 6 · 2026-10-08')).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Day 6 · 2026-10-08' })).toBeTruthy()
  })

  it('edits a range with the eighth nudges and takes the lines from the next section', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(rowFor('12.1')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Edit section 12.1' }))
    const dlg = await screen.findByRole('dialog')

    expect(within(dlg).getByText(/Scene 12 —/)).toBeTruthy()
    expect(within(dlg).queryByLabelText('Label')).toBeNull()
    expect(within(dlg).queryByLabelText('Notes')).toBeNull()
    expect(within(dlg).queryByRole('combobox', { name: /status/i })).toBeNull()
    expect(within(dlg).getByText(/can’t be edited here/)).toBeTruthy()

    await user.click(within(dlg).getByRole('button', { name: 'Move end forward an eighth' }))
    expect(await within(dlg).findByText('Saving changes other sections')).toBeTruthy()
    expect(within(dlg).getByText(/12\.2 gives up/)).toBeTruthy()

    await user.click(within(dlg).getByRole('button', { name: 'Save and take from 12.2' }))
    await waitFor(() => expect(applyLayout).toHaveBeenCalledTimes(1))
    const input = applyLayout.mock.calls[0]![0]
    expect(input).toMatchObject({
      production_id: 'prod-1',
      script_version_id: 'ver-1',
      scene_id: 'scene-1',
      removals: [],
      splits: [],
      current: { id: 'sec-a', cut: false },
    })
    expect(input.current.range.start_offset).toBe(0)
    expect(input.current.range.end_offset).toBeGreaterThan(lines[7]!.endOffset)
    expect(input.updates).toHaveLength(1)
    expect(input.updates[0].sectionId).toBe('sec-b')
    expect(input.updates[0].range.start_offset).toBe(input.current.range.end_offset)
  })

  it('highlights lines by dragging and hands released lines to the neighbour', async () => {
    renderPage()
    await waitFor(() => expect(rowFor('12.2')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Edit section 12.2' }))
    const dlg = await screen.findByRole('dialog')
    const lineEl = (i: number) => dlg.querySelector(`[data-line="${i}"]`)!

    fireEvent.pointerDown(lineEl(12), { pointerType: 'mouse', button: 0 })
    fireEvent.pointerEnter(lineEl(15), { pointerType: 'mouse' })
    fireEvent.pointerUp(window)

    expect(await within(dlg).findByText(/12\.1 takes over/)).toBeTruthy()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(applyLayout).toHaveBeenCalledTimes(1))
    const input = applyLayout.mock.calls[0]![0]
    expect(input.current.range.start_offset).toBe(lines[12]!.startOffset)
    expect(input.updates).toEqual([
      expect.objectContaining({ sectionId: 'sec-a', range: expect.objectContaining({ end_offset: lines[11]!.endOffset }) }),
    ])
  })

  it('marks a section as cut without touching its range', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(rowFor('12.2')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Edit section 12.2' }))
    const dlg = await screen.findByRole('dialog')
    await user.click(within(dlg).getByRole('button', { name: 'Mark as cut' }))
    await user.click(within(dlg).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(setCut).toHaveBeenCalledWith('sec-b', true))
    expect(applyLayout).not.toHaveBeenCalled()
  })

  it('asks for confirmation before deleting', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(rowFor('12.2')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Edit section 12.2' }))
    const dlg = await screen.findByRole('dialog')
    await user.click(within(dlg).getByRole('button', { name: 'Delete' }))
    expect(softDeleteWithChildren).not.toHaveBeenCalled()
    await user.click(within(dlg).getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(softDeleteWithChildren).toHaveBeenCalledWith('sec-b'))
  })

  it('creates a section from a highlighted selection, splitting the section it lands in', async () => {
    renderPage()
    await waitFor(() => expect(rowFor('12.1')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'New section' }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByRole('button', { name: 'Highlight the script to save' })).toHaveProperty('disabled', true)

    const lineEl = (i: number) => dlg.querySelector(`[data-line="${i}"]`)!
    await waitFor(() => expect(lineEl(3)).toBeTruthy())
    fireEvent.pointerDown(lineEl(3), { pointerType: 'mouse', button: 0 })
    fireEvent.pointerEnter(lineEl(4), { pointerType: 'mouse' })
    fireEvent.pointerUp(window)

    expect(await within(dlg).findByText(/12\.1 is split/)).toBeTruthy()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save and take from 12.1' }))
    await waitFor(() => expect(applyLayout).toHaveBeenCalledTimes(1))
    const input = applyLayout.mock.calls[0]![0]
    expect(input.current.id).toBeNull()
    expect(input.current.label).toMatch(/^Scene 12 — p14/)
    expect(input.updates).toEqual([expect.objectContaining({ sectionId: 'sec-a' })])
    expect(input.splits).toEqual([expect.objectContaining({ sourceSectionId: 'sec-a' })])
  })
})
