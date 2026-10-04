// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import type { Slate, Take } from '@/lib/db/types'

/** In-memory stand-in for the scriptSupervisor repository (numbering is covered by DB-level tests). */
const store = vi.hoisted(() => ({
  slates: [] as Slate[],
  takes: [] as Take[],
  marks: new Map<string, { marked_status: 'complete' | 'omitted' | null; completed_shoot_day_id: string | null; credited_eighths: number | null; timed_seconds: number | null; notes: string | null }>(),
  clock: 0,
}))

vi.mock('@/lib/db/repositories/scriptSupervisor', () => {
  const soft = () => {
    store.clock += 1
    const ts = `2026-10-07T10:00:${String(store.clock).padStart(2, '0')}`
    return { created_at: ts, updated_at: ts, deleted_at: null }
  }
  return {
    SCRIPT_SUPERVISOR_REMOTE_ERROR: 'remote',
    getScriptSupervisorSettings: async (production_id: string) => ({ production_id, slating_system: 'uk', created_at: 't', updated_at: 't' }),
    countLiveSlates: async () => store.slates.length,
    setSlatingSystem: vi.fn(),
    listScenesForShootDay: async () => [
      { id: 'sc23', scene_number: '23', title: 'Edit suite', int_ext: 'INT', day_night: 'NIGHT', page_eighths: 11 },
    ],
    listSlatesByShootDay: async (dayId: string) => store.slates.filter((s) => s.shoot_day_id === dayId),
    listSlatesByScene: async (sceneId: string) => store.slates.filter((s) => s.scene_id === sceneId),
    listTakesBySlateIds: async (ids: string[]) => store.takes.filter((t) => ids.includes(t.slate_id)),
    getNextSlatePreview: async () => {
      const n = store.slates.length + 1
      return { slating_system: 'uk', slate_number: n, label: String(n) }
    },
    createSlate: async (input: Partial<Slate> & { production_id: string; shoot_day_id: string }) => {
      const slate = {
        id: `slate-${store.slates.length + 1}`, slating_system: 'uk', unit_id: null, scene_id: null, shot_id: null,
        slate_prefix: '', slate_number: store.slates.length + 1, shot_type: null, shot_code: null, description: null,
        camera: null, lens: null, stop: null, filter: null, sound_mode: 'sync', int_ext: null, day_night: null,
        camera_roll: null, sound_roll: null, notes: null, ...input, ...soft(),
      } as Slate
      store.slates.push(slate)
      return slate
    },
    updateSlate: async (id: string, patch: Partial<Slate>) => {
      const s = store.slates.find((x) => x.id === id)!
      Object.assign(s, patch)
      return s
    },
    softDeleteSlate: vi.fn(),
    createTake: async (slateId: string, fields: Partial<Take> = {}) => {
      const n = store.takes.filter((t) => t.slate_id === slateId).length + 1
      const take = { id: `${slateId}-t${n}`, slate_id: slateId, take_number: n, status: 'pending', ng_reason: null, duration_ms: fields.duration_ms ?? null, end_board: 0, remarks: null, ...soft() } as Take
      store.takes.push(take)
      return take
    },
    updateTake: async (id: string, patch: Partial<Take>) => {
      const t = store.takes.find((x) => x.id === id)!
      Object.assign(t, patch)
      if (t.status !== 'ng') t.ng_reason = null
      return t
    },
    softDeleteTake: vi.fn(),
    getDayLog: async () => null,
    saveDayLog: vi.fn(),
    setSceneProgress: async (
      _productionId: string,
      sceneId: string,
      input: { marked_status: 'complete' | 'omitted' | null; completed_shoot_day_id?: string | null; credited_eighths?: number | null }
    ) => {
      store.marks.set(sceneId, {
        marked_status: input.marked_status,
        completed_shoot_day_id: input.completed_shoot_day_id ?? null,
        credited_eighths: input.credited_eighths ?? null,
        timed_seconds: null,
        notes: null,
      })
    },
  }
})

vi.mock('@/lib/db/scriptSupervisorProgressService', async () => {
  const p = await vi.importActual<typeof import('@/lib/script-supervisor/progress')>('@/lib/script-supervisor/progress')
  return {
    loadShootProgress: async () => {
      const scenes = [
        { id: 'sc23', scene_number: '23', title: 'Edit suite', page_eighths: 11, episode_id: null, duration_minutes: null },
        { id: 'sc24', scene_number: '24', title: 'Corridor', page_eighths: 4, episode_id: null, duration_minutes: null },
      ]
      const aggregates = new Map<string, { slates: number; takes: number; prints: number; lastShootDate: string | null; lastDayNumber: number | null }>()
      for (const sc of scenes) {
        const slates = store.slates.filter((s) => s.scene_id === sc.id)
        if (slates.length === 0) continue
        const takes = store.takes.filter((t) => slates.some((s) => s.id === t.slate_id))
        aggregates.set(sc.id, { slates: slates.length, takes: takes.length, prints: takes.filter((t) => t.status === 'print').length, lastShootDate: '2026-10-07', lastDayNumber: 14 })
      }
      const rows = p.buildSceneProgressRows(scenes, aggregates, store.marks)
      return { rows, totals: p.summariseProgress(rows), days: [] }
    },
  }
})

vi.mock('@/lib/documents/persistDocument', () => ({
  persistProductionDocument: vi.fn(),
  documentsQueryKey: (id: string) => ['documents', id],
}))
vi.mock('@/lib/files', () => ({ saveFileWithDialog: vi.fn() }))
vi.mock('@/lib/db/repositories/scriptAnnotations', () => ({
  listAnnotationsForScene: async () => [],
  listAnnotationsForSlate: async () => [],
  listContinuityMediaForSlate: async () => [],
  createAnnotation: vi.fn(),
  updateAnnotation: vi.fn(),
  softDeleteAnnotation: vi.fn(),
  updateContinuityMedia: vi.fn(),
  softDeleteContinuityMedia: vi.fn(),
  buildContinuityMediaInsert: vi.fn(() => []),
}))
vi.mock('@/lib/files/appDataObjectUrl', () => ({ createAppDataObjectUrl: vi.fn(async () => 'blob:x') }))
vi.mock('@/lib/db/repositories/scriptLining', () => ({
  loadLinedScene: async () => null,
  createTramline: vi.fn(),
  updateTramlineRange: vi.fn(),
  setTramlineSegments: vi.fn(),
  softDeleteTramline: vi.fn(),
  restoreTramline: vi.fn(),
}))
vi.mock('@/lib/pdf/dailyProgressReport', () => ({ generateDailyProgressReportPdf: vi.fn(async () => new Uint8Array()) }))

vi.mock('@/lib/db/repositories/schedule', () => ({
  listShootDaysByProduction: async () => [
    { id: 'day-14', production_id: 'prod-1', shoot_date: '2026-10-07', day_number: 14 },
  ],
  listScenesByProduction: async () => [
    { id: 'sc23', production_id: 'prod-1', scene_number: '23', title: 'Edit suite' },
    { id: 'sc24', production_id: 'prod-1', scene_number: '24', title: 'Corridor' },
  ],
}))

const exportsMock = vi.hoisted(() => ({
  exportContinuitySheets: vi.fn(async () => {}),
  exportEditorsLog: vi.fn(async () => {}),
  exportDayMarkedUpScript: vi.fn(async () => ['24']),
  exportSceneMarkedUpScript: vi.fn(async () => {}),
}))
vi.mock('./exports', () => exportsMock)
vi.mock('@/lib/db/scriptSupervisorExportService', () => ({
  loadDayCoverage: async () => [
    { sceneId: 'sc23', sceneNumber: '23', title: 'Edit suite', state: 'under', tramlines: 3, underCovered: 2 },
    { sceneId: 'sc24', sceneNumber: '24', title: 'Corridor', state: 'no_script', tramlines: 0, underCovered: 0 },
  ],
}))

vi.mock('@/hooks/useEffectiveDataSourceForProduction', () => ({
  useEffectiveDataSourceForProduction: () => ({ data: 'local_sqlite', dataSourceKey: 'local_sqlite' }),
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: 'prod-1', currentProduction: { id: 'prod-1', name: 'P' } }),
}))

import { ScriptSupervisorPage } from './script-supervisor-page'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScriptSupervisorPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Script Supervisor page (SS3)', () => {
  beforeEach(() => {
    store.slates = []
    store.takes = []
    store.marks = new Map()
    store.clock = 0
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it('logs a slate, rolls and cuts a take, and prints it', async () => {
    const user = userEvent.setup()
    renderPage()

    const newSlate = await screen.findByRole('button', { name: /new slate 1/i })
    await user.click(newSlate)
    await waitFor(() => expect(screen.getByTestId('current-slate-label').textContent).toBe('1'))
    expect(store.slates[0]).toMatchObject({ scene_id: 'sc23', shoot_day_id: 'day-14' })

    await user.click(screen.getByRole('button', { name: /roll take 1/i }))
    await user.click(screen.getByRole('button', { name: /cut take 1/i }))
    const row = await screen.findByTestId('take-row-1')
    expect(store.takes[0]!.duration_ms).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /^print/i }))
    await waitFor(() => expect(within(row).getByRole('button', { name: /take 1: print/i })).toBeTruthy())
    const slateList = screen.getByRole('region', { name: /slates on this day/i })
    expect(within(slateList).getByText('Print 1')).toBeTruthy()
  })

  it('carries camera setup into the next slate', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /new slate 1/i }))
    const lens = await screen.findByLabelText('Lens')
    await user.type(lens, '50mm')
    await user.tab()
    await waitFor(() => expect(store.slates[0]!.lens).toBe('50mm'))

    await user.click(await screen.findByRole('button', { name: /new slate 2/i }))
    await waitFor(() => expect(store.slates).toHaveLength(2))
    expect(store.slates[1]!.lens).toBe('50mm')
  })

  it('toggles the tablet layout and remembers it on this device', async () => {
    const user = userEvent.setup()
    renderPage()
    const toggle = await screen.findByRole('button', { name: 'Tablet layout' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('albatross.scriptSupervisor.touchLayout')).toBe('true')
  })

  it('marks the scene complete and shows it in Review', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /new slate 1/i }))
    await waitFor(() => expect(store.slates).toHaveLength(1))

    const complete = await screen.findByRole('button', { name: 'Scene 23 complete' })
    expect(complete.getAttribute('aria-pressed')).toBe('false')
    await user.click(complete)
    await waitFor(() => expect(store.marks.get('sc23')?.completed_shoot_day_id).toBe('day-14'))
    await waitFor(() => expect(complete.getAttribute('aria-pressed')).toBe('true'))

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    const row = await screen.findByTestId('progress-row-23')
    expect(within(row).getByRole('img', { name: 'Complete' })).toBeTruthy()
    expect(within(screen.getByTestId('progress-row-24')).getByRole('img', { name: 'Not shot' })).toBeTruthy()
  })

  it('exports the day’s paperwork and opens a scene from the two-tramline check (SS9)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: 'Review' }))
    const card = await screen.findByRole('region', { name: 'Exports' })
    expect(await within(card).findByText('2 blocks have fewer than two tramlines')).toBeTruthy()
    expect(within(card).getByText('Not in an imported script')).toBeTruthy()

    await user.click(within(card).getByRole('button', { name: /continuity sheets/i }))
    await waitFor(() => expect(exportsMock.exportContinuitySheets).toHaveBeenCalledTimes(1))
    expect(exportsMock.exportContinuitySheets).toHaveBeenCalledWith(
      expect.objectContaining({ productionId: 'prod-1', shootDayId: 'day-14', shootDate: '2026-10-07', dayNumber: 14 })
    )
    await user.click(within(card).getByRole('button', { name: /editor’s log/i }))
    await waitFor(() => expect(exportsMock.exportEditorsLog).toHaveBeenCalledTimes(1))
    await user.click(within(card).getByRole('button', { name: /marked-up script/i }))
    expect(await within(card).findByText('Left out Sc 24: not in an imported script.')).toBeTruthy()

    await user.click(within(card).getByRole('button', { name: /scene 23: 2 blocks/i }))
    expect((await screen.findByRole('tab', { name: 'Line & log' })).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /script · sc 23/i }).getAttribute('aria-selected')).toBe('true')
  })
})
