// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { SidesBuilderSheet } from '@/features/schedule/sides-builder-sheet'
import {
  buildSidesDraftModel,
  defaultSidesFilters,
  type SidesBuilderSource,
  type SidesSectionEntry,
} from '@/lib/db/sidesBuilderService'
import type { Scene, ScriptSection } from '@/lib/db/types'

const loadSource = vi.hoisted(() => vi.fn())
const exportSides = vi.hoisted(() => vi.fn())
const getFileUrlMock = vi.hoisted(() => vi.fn())
const openInSystemMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/sidesBuilderService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/sidesBuilderService')>()
  return { ...actual, loadSidesBuilderSource: loadSource }
})

vi.mock('@/lib/db/sidesExportService', () => ({ exportShootDaySides: exportSides }))

vi.mock('@/lib/files', () => ({
  getFileUrl: getFileUrlMock,
  openInSystem: openInSystemMock,
}))

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '1',
    title: null,
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 8,
    location_id: null,
    duration_minutes: null,
    ...soft,
    ...over,
  }
}

function section(over: Partial<ScriptSection> = {}): ScriptSection {
  return {
    id: 'sec-a',
    production_id: 'prod-1',
    script_version_id: 'sv-1',
    scene_id: 'scene-1',
    episode_id: null,
    label: 'Opening',
    section_type: 'dialogue',
    status: 'planned',
    notes: null,
    is_manual: 0,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

function entry(over: Partial<SidesSectionEntry> = {}): SidesSectionEntry {
  const sec = over.section ?? section()
  const scn = over.scene ?? scene()
  return {
    sectionId: sec.id,
    section: sec,
    scene: scn,
    episodeId: null,
    episodeName: null,
    episodeSortOrder: null,
    unitId: 'unit-1',
    locationId: null,
    locationName: null,
    ranges: [],
    characterNames: [],
    linkedShotNumbers: [],
    scriptText: 'SCRIPT TEXT',
    origin: 'included',
    isPartialScene: false,
    isViaShotsOnly: false,
    isEstimated: false,
    estimatedEighths: 4,
    startPageSort: 0,
    ...over,
  }
}

function source(over: Partial<SidesBuilderSource> = {}): SidesBuilderSource {
  return {
    shootDayId: 'sd-1',
    productionId: 'prod-1',
    unitId: 'unit-1',
    shootDate: '2026-06-01',
    unitName: 'Main Unit',
    scheduledSceneIds: ['scene-1', 'scene-2'],
    scriptVersionIds: ['sv-1'],
    scriptVersionLabelsById: { 'sv-1': 'v1' },
    latestScriptVersionIdByEpisodeScope: { '': 'sv-1' },
    totalEstimatedEighths: 8,
    entries: [
      entry({
        section: section({ id: 'sec-a', label: 'Opening', scene_id: 'scene-1' }),
        scene: scene({ id: 'scene-1', scene_number: '1', int_ext: 'INT', day_night: 'DAY', title: 'INT. KITCHEN - DAY' }),
        scriptText: 'KITCHEN TEXT',
        origin: 'included',
      }),
      entry({
        section: section({ id: 'sec-b', label: 'Scene Two', scene_id: 'scene-2' }),
        scene: scene({ id: 'scene-2', scene_number: '2', int_ext: 'EXT', day_night: 'DAY', title: 'EXT. PARK - DAY' }),
        scriptText: 'PARK TEXT',
        origin: 'fallback',
      }),
    ],
    sb5Warnings: [],
    scriptPagesByVersionId: {},
    ...over,
  }
}

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SidesBuilderSheet open onOpenChange={() => {}} shootDayId="sd-1" shootDayUnitId={null} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SidesBuilderSheet', () => {
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
    loadSource.mockResolvedValue(source())
    getFileUrlMock.mockResolvedValue('app://attachments/prod-1/doc-sides.pdf')
    openInSystemMock.mockResolvedValue(undefined)
    exportSides.mockResolvedValue({
      document: { id: 'doc-1', file_path: 'attachments/prod-1/doc-1-sides.pdf' },
      exportRecord: { id: 'exp-1' },
    })
  })
  afterEach(() => cleanup())

  it('builds collated preview script from the mock source', () => {
    const model = buildSidesDraftModel(source(), defaultSidesFilters(), { overrides: {} })
    expect(model.groups[0]!.scenes[0]!.collatedScriptText).toContain('KITCHEN TEXT')
    expect(model.groups[0]!.scenes[1]!.collatedScriptText).toContain('PARK TEXT')
  })

  it('renders the preview from the source', async () => {
    renderSheet()
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/KITCHEN TEXT/)).toBeTruthy())
    expect(screen.getByText(/PARK TEXT/)).toBeTruthy()
    expect(screen.getAllByText(/INT\. KITCHEN - DAY/).length).toBeGreaterThan(0)
    expect(screen.getByText('Coverage')).toBeTruthy()
  })

  it('narrows the preview when a filter is applied', async () => {
    const user = userEvent.setup()
    renderSheet()
    await waitFor(() => expect(screen.getByText(/PARK TEXT/)).toBeTruthy())

    await user.click(screen.getByRole('checkbox', { name: 'Linked-shot sections only' }))

    await waitFor(() => expect(screen.queryByText(/PARK TEXT/)).toBeNull())
    expect(screen.getByText(/KITCHEN TEXT/)).toBeTruthy()
  })

  it('excludes a section when its checkbox is toggled off', async () => {
    const user = userEvent.setup()
    renderSheet()
    await waitFor(() => expect(screen.getByText(/KITCHEN TEXT/)).toBeTruthy())

    await user.click(screen.getByRole('checkbox', { name: 'Include Opening' }))

    await waitFor(() => expect(screen.queryByText(/KITCHEN TEXT/)).toBeNull())
    expect(screen.getByText(/PARK TEXT/)).toBeTruthy()
  })

  it('disables export when no sections are selected', async () => {
    const user = userEvent.setup()
    renderSheet()
    await waitFor(() => expect(screen.getByText(/KITCHEN TEXT/)).toBeTruthy())

    await user.click(screen.getByRole('checkbox', { name: 'Include Opening' }))
    await user.click(screen.getByRole('checkbox', { name: 'Include Scene Two' }))

    await waitFor(() =>
      expect(
        screen.getByText('No sections selected. Select at least one section before exporting.')
      ).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: 'Export sides PDF' })).toHaveProperty(
      'disabled',
      true
    )
    expect(exportSides).not.toHaveBeenCalled()
  })

  it('exports sides and exposes an open action on success', async () => {
    const user = userEvent.setup()
    renderSheet()
    await waitFor(() => expect(screen.getByText(/KITCHEN TEXT/)).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'Export sides PDF' }))

    await waitFor(() =>
      expect(screen.getByText('Sides exported and saved to documents.')).toBeTruthy()
    )
    expect(exportSides).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /Open sides PDF/ }))
    await waitFor(() =>
      expect(getFileUrlMock).toHaveBeenCalledWith('attachments/prod-1/doc-1-sides.pdf')
    )
    expect(openInSystemMock).toHaveBeenCalledWith('app://attachments/prod-1/doc-sides.pdf')
  })
})
