// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ScriptSectionsPage } from '@/features/schedule/script-sections-page'
import {
  validateSectionEditorValues,
  EMPTY_SECTION_VALUES,
} from '@/features/schedule/script-section-edit-dialog'
import type {
  Scene,
  ScriptSection,
  ScriptVersion,
  Shot,
} from '@/lib/db/types'

const loadSceneCoverage = vi.hoisted(() => vi.fn())
const listVersions = vi.hoisted(() => vi.fn())
const listScenes = vi.hoisted(() => vi.fn())
const listShotsByScene = vi.hoisted(() => vi.fn())
const listPages = vi.hoisted(() => vi.fn())
const listSections = vi.hoisted(() => vi.fn())
const listRanges = vi.hoisted(() => vi.fn())
const listCharacters = vi.hoisted(() => vi.fn())
const createSection = vi.hoisted(() => vi.fn())
const updateSection = vi.hoisted(() => vi.fn())
const replaceRanges = vi.hoisted(() => vi.fn())
const replaceCharacters = vi.hoisted(() => vi.fn())
const softDeleteWithChildren = vi.hoisted(() => vi.fn())
const getLinkedShotCounts = vi.hoisted(() => vi.fn())
const getLinkedSectionCounts = vi.hoisted(() => vi.fn())
const listShotsBySection = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/coverageAnalysisService', () => ({
  loadSceneCoverage: loadSceneCoverage,
}))

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

vi.mock('@/lib/db/repositories/scriptPages', () => ({
  listScriptPagesByScriptVersion: listPages,
}))

vi.mock('@/lib/db/repositories/scriptSections', () => ({
  listSectionsByScriptVersion: listSections,
  listRangesBySection: listRanges,
  listCharactersBySection: listCharacters,
  createSectionWithRangesAndCharacters: createSection,
  updateScriptSection: updateSection,
  replaceSectionRanges: replaceRanges,
  replaceSectionCharacters: replaceCharacters,
  softDeleteSectionWithChildren: softDeleteWithChildren,
  getLinkedShotCountsBySectionIds: getLinkedShotCounts,
  getLinkedSectionCountsByShotIds: getLinkedSectionCounts,
  listShotsBySection: listShotsBySection,
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
    scene_number: '1',
    heading: null,
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
    label: 'A section',
    section_type: 'custom',
    status: 'unplanned',
    notes: null,
    is_manual: 1,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ScriptSectionsPage />
    </QueryClientProvider>
  )
}

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
    listPages.mockResolvedValue([])
    listSections.mockResolvedValue([
      section({ id: 'sec-manual', label: 'Manual Fight', is_manual: 1 }),
      section({ id: 'sec-generated', label: 'Generated Scene', section_type: 'action', is_manual: 0 }),
    ])
    listRanges.mockResolvedValue([])
    listCharacters.mockResolvedValue([])
    createSection.mockResolvedValue(section({ id: 'sec-new' }))
    updateSection.mockResolvedValue(section())
    replaceRanges.mockResolvedValue([])
    replaceCharacters.mockResolvedValue([])
    softDeleteWithChildren.mockResolvedValue(undefined)
    getLinkedShotCounts.mockResolvedValue(new Map<string, number>())
    getLinkedSectionCounts.mockResolvedValue(new Map<string, number>())
    listShotsBySection.mockResolvedValue([])
    listShotsByScene.mockResolvedValue([])
    loadSceneCoverage.mockResolvedValue({
      sceneId: 'scene-1',
      totalSections: 2,
      coveredSections: 1,
      uncoveredSections: 1,
      linkedShots: 1,
      unlinkedShots: 1,
      coveragePercent: 50,
      isPartialScene: false,
      issues: [],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('lists the script version and its sections', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())
    expect(screen.getByText('Generated Scene')).toBeTruthy()
    expect(listSections).toHaveBeenCalledWith('ver-1')
    // Both Generated and Manual badges are present.
    expect(screen.getByText('Generated')).toBeTruthy()
    expect(screen.getByText('Manual')).toBeTruthy()
  })

  it('creates a custom section', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'New section' }))
    const dlg = await screen.findByRole('dialog')

    // Choose the linked scene (required on create).
    await user.click(within(dlg).getByRole('combobox', { name: 'Linked scene' }))
    await user.click(await screen.findByRole('option', { name: /Scene 1/ }))

    await user.type(within(dlg).getByLabelText('Label'), 'New custom bit')
    await user.click(within(dlg).getByRole('button', { name: 'Create section' }))

    await waitFor(() => expect(createSection).toHaveBeenCalledTimes(1))
    expect(createSection.mock.calls[0]![0]).toMatchObject({
      production_id: 'prod-1',
      script_version_id: 'ver-1',
      scene_id: 'scene-1',
      is_manual: true,
      label: 'New custom bit',
    })
  })

  it('edits a custom section', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!)
    const dlg = await screen.findByRole('dialog')

    const labelInput = within(dlg).getByLabelText('Label')
    await user.clear(labelInput)
    await user.type(labelInput, 'Renamed fight')
    await user.click(within(dlg).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateSection).toHaveBeenCalledTimes(1))
    expect(updateSection.mock.calls[0]![0]).toBe('sec-manual')
    expect(updateSection.mock.calls[0]![1]).toMatchObject({ label: 'Renamed fight' })
  })

  it('deletes a custom section', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!)
    await waitFor(() => expect(softDeleteWithChildren).toHaveBeenCalledWith('sec-manual'))
  })

  it('deletes a generated section', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Generated Scene')).toBeTruthy())

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' }) as HTMLButtonElement[]
    await user.click(deleteButtons[1]!)
    await waitFor(() => expect(softDeleteWithChildren).toHaveBeenCalledWith('sec-generated'))
  })

  it('blocks saving an out-of-bounds eighth value', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!)
    const dlg = await screen.findByRole('dialog')

    await user.type(within(dlg).getByLabelText(/Start eighth/), '9')
    await user.click(within(dlg).getByRole('button', { name: 'Save changes' }))

    expect(await within(dlg).findByRole('alert')).toBeTruthy()
    expect(updateSection).not.toHaveBeenCalled()
  })

  it('edits page/eighth ranges on a generated section', async () => {
    listRanges.mockImplementation(async (sectionId: string) => {
      if (sectionId === 'sec-generated') {
        return [
          {
            id: 'range-1',
            section_id: sectionId,
            start_page: '1',
            start_eighth: 0,
            end_page: '1',
            end_eighth: 4,
            start_offset: 0,
            end_offset: 20,
            created_at: 't',
            updated_at: 't',
            deleted_at: null,
          },
        ]
      }
      return []
    })

    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Generated Scene')).toBeTruthy())

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!)
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).queryByText('Type')).toBeNull()

    const startEighth = within(dlg).getByLabelText(/Start eighth/)
    await user.clear(startEighth)
    await user.type(startEighth, '2')
    await user.click(within(dlg).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateSection).toHaveBeenCalledTimes(1))
    expect(updateSection.mock.calls[0]![0]).toBe('sec-generated')
    await waitFor(() => expect(replaceRanges).toHaveBeenCalledTimes(1))
    expect(replaceRanges.mock.calls[0]![0]).toBe('sec-generated')
    expect(replaceRanges.mock.calls[0]![1]).toEqual([
      expect.objectContaining({ start_eighth: 2 }),
    ])
    expect(replaceRanges.mock.calls[0]![2]).toEqual({ markUserEdited: true })
  })

  it('shows capitalized status labels', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())
    expect(screen.getAllByText('Unplanned').length).toBeGreaterThan(0)
    expect(screen.queryByText('unplanned')).toBeNull()
  })

  it('filters sections by scene and restores all scenes', async () => {
    const user = userEvent.setup()
    listScenes.mockResolvedValue([
      scene({ id: 'scene-1', scene_number: '10', title: 'Office' }),
      scene({ id: 'scene-2', scene_number: '11', title: 'Street' }),
    ])
    listSections.mockResolvedValue([
      section({ id: 'sec-scene-1', scene_id: 'scene-1', label: 'Office section' }),
      section({ id: 'sec-scene-2', scene_id: 'scene-2', label: 'Street section' }),
    ])

    renderPage()
    await waitFor(() => expect(screen.getByText('Office section')).toBeTruthy())
    expect(screen.getByText('Street section')).toBeTruthy()

    await user.click(screen.getByRole('combobox', { name: 'Scene' }))
    await user.click(await screen.findByRole('option', { name: /Scene 11/ }))
    expect(screen.queryByText('Office section')).toBeNull()
    expect(screen.getByText('Street section')).toBeTruthy()

    await user.click(screen.getByRole('combobox', { name: 'Scene' }))
    await user.click(await screen.findByRole('option', { name: 'All scenes' }))
    expect(await screen.findByText('Office section')).toBeTruthy()
    expect(screen.getByText('Street section')).toBeTruthy()
  })

  it('clears section selection when filtered out by scene', async () => {
    const user = userEvent.setup()
    listScenes.mockResolvedValue([
      scene({ id: 'scene-1', scene_number: '10', title: 'Office' }),
      scene({ id: 'scene-2', scene_number: '11', title: 'Street' }),
    ])
    listSections.mockResolvedValue([
      section({ id: 'sec-scene-1', scene_id: 'scene-1', label: 'Office section' }),
      section({ id: 'sec-scene-2', scene_id: 'scene-2', label: 'Street section' }),
    ])
    listShotsBySection.mockResolvedValue([])
    listShotsByScene.mockResolvedValue([])
    loadSceneCoverage.mockResolvedValue({
      sceneId: 'scene-1',
      totalSections: 1,
      coveredSections: 0,
      uncoveredSections: 1,
      linkedShots: 0,
      unlinkedShots: 0,
      coveragePercent: 0,
      isPartialScene: false,
      issues: [],
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('Office section')).toBeTruthy())

    await user.click(screen.getByText('Office section'))
    await waitFor(() => expect(screen.getByText(/Scene coverage/)).toBeTruthy())

    await user.click(screen.getByRole('combobox', { name: 'Scene' }))
    await user.click(await screen.findByRole('option', { name: /Scene 11/ }))

    expect(screen.queryByText(/Scene coverage/)).toBeNull()
  })

  it('shows linked-shot coverage badges per section', async () => {
    getLinkedShotCounts.mockResolvedValue(new Map<string, number>([['sec-manual', 2]]))
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())

    // The covered section shows a shot count; the uncovered one shows a warning.
    await waitFor(() => expect(screen.getByText('2 shots')).toBeTruthy())
    expect(screen.getByText('No shots')).toBeTruthy()
  })

  it('shows a coverage panel with linked and uncovered shots when a section is selected', async () => {
    listShotsBySection.mockResolvedValue([shot({ id: 'shot-1', shot_number: '1A' })])
    listShotsByScene.mockResolvedValue([
      shot({ id: 'shot-1', shot_number: '1A' }),
      shot({ id: 'shot-2', shot_number: '1B' }),
    ])
    // shot-1 is covered (1 section), shot-2 is uncovered (absent from the map).
    getLinkedSectionCounts.mockResolvedValue(new Map<string, number>([['shot-1', 1]]))

    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual Fight')).toBeTruthy())

    await user.click(screen.getByText('Manual Fight'))

    await waitFor(() => expect(screen.getByText(/Coverage for/)).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/Scene coverage/)).toBeTruthy())
    expect(screen.getByText('50%')).toBeTruthy()
    // Linked shot 1A appears, uncovered shot 1B is flagged.
    expect(screen.getByText('Shot 1A')).toBeTruthy()
    expect(screen.getByText('Shot 1B')).toBeTruthy()
  })
})

describe('validateSectionEditorValues', () => {
  it('requires a scene when requested', () => {
    expect(validateSectionEditorValues(EMPTY_SECTION_VALUES, { requireScene: true })).toMatch(/scene/i)
  })

  it('rejects start page after end page', () => {
    const result = validateSectionEditorValues({
      ...EMPTY_SECTION_VALUES,
      scene_id: 'scene-1',
      start_page: '5',
      end_page: '2',
    })
    expect(result).toMatch(/start page/i)
  })

  it('rejects start eighth after end eighth on the same page', () => {
    const result = validateSectionEditorValues({
      ...EMPTY_SECTION_VALUES,
      scene_id: 'scene-1',
      start_page: '3',
      end_page: '3',
      start_eighth: '6',
      end_eighth: '2',
    })
    expect(result).toMatch(/eighth/i)
  })

  it('rejects eighth values outside 0–8', () => {
    expect(
      validateSectionEditorValues({ ...EMPTY_SECTION_VALUES, scene_id: 'scene-1', start_eighth: '9' })
    ).toMatch(/between 0 and 8/i)
  })

  it('accepts a valid range', () => {
    expect(
      validateSectionEditorValues({
        ...EMPTY_SECTION_VALUES,
        scene_id: 'scene-1',
        start_page: '1',
        start_eighth: '0',
        end_page: '2',
        end_eighth: '4',
      })
    ).toBeNull()
  })
})
