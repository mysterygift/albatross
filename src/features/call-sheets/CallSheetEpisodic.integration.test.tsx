// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CallSheetsPage } from '@/features/call-sheets/page'
import { getDefaultCrewHierarchyConfig } from '@/lib/people/crewHierarchyResolver'
import { generateCallSheetPdf } from '@/lib/pdf/callSheet'
import {
  extractPdfText,
  minimalCallSheetDataForEpisodicPdfTest,
} from '@/test/episodicIntegrationHelpers'

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children?: React.ReactNode }) => <div data-testid="mock-pdf">{children}</div>,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}))

vi.mock('@/lib/weather/openMeteo', () => ({
  getWeatherForCallSheet: vi.fn(async () => null),
}))

vi.mock('@/lib/files', () => ({
  saveFileWithDialog: vi.fn(),
  openInSystem: vi.fn(),
}))

const prodCtx = vi.hoisted(() => ({
  isEpisodic: true,
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: {
      id: 'prod-1',
      name: 'P',
      is_episodic: prodCtx.isEpisodic,
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

const shootDayRow = {
  id: 'day-1',
  production_id: 'prod-1',
  shooting_bloc_id: 'bloc-1',
  shoot_date: '2025-06-01',
  day_number: 1,
  call_time: null,
  wrap_time: null,
  notes: null,
  weather_manual: null,
  meal_times_json: null,
  weather_json: null,
  parking_base_address: null,
  special_notes: null,
  hospital_name: null,
  hospital_address: null,
  police_station_name: null,
  police_station_address: null,
  ...soft,
}

const dayUnitRow = {
  id: 'sdu-1',
  shoot_day_id: 'day-1',
  unit_id: 'unit-1',
  notes: null,
  is_locked: 0,
  ...soft,
}

const stripRow = {
  id: 'strip-1',
  production_id: 'prod-1',
  shoot_day_id: 'day-1',
  shoot_day_unit_id: 'sdu-1',
  strip_type: 'SCENE' as const,
  scene_id: 'scene-1',
  shot_id: null,
  title: null,
  description: null,
  estimated_minutes: null,
  sort_index: 0,
  color_tag: null,
  strip_status: 'SCHEDULED' as const,
  origin_location_id: null,
  destination_location_id: null,
  ...soft,
}

const sceneRow = {
  id: 'scene-1',
  production_id: 'prod-1',
  episode_id: 'ep-1',
  scene_number: '12',
  heading: 'INT. TEST',
  title: null,
  description: null,
  int_ext: 'INT' as const,
  day_night: 'DAY' as const,
  page_eighths: null,
  location_id: null,
  duration_minutes: null,
  ...soft,
}

const repo = vi.hoisted(() => ({
  getProductionById: vi.fn(),
  listShootDaysByProduction: vi.fn(),
  getShootDayById: vi.fn(),
  listShootDayUnitsByShootDay: vi.fn(),
  listShootDayUnitsByProduction: vi.fn(),
  listUnitsByProduction: vi.fn(),
  listStripsByShootDay: vi.fn(),
  listStripsByProduction: vi.fn(),
  listScenesByProduction: vi.fn(),
  listShotsByProduction: vi.fn(),
  listLocationsByProduction: vi.fn(),
  listKeyContactsByProduction: vi.fn(),
  listEpisodesByProduction: vi.fn(),
  listShootingBlocsByProduction: vi.fn(),
  getCastIdsBySceneIds: vi.fn(),
  getCastIdsByShotIds: vi.fn(),
  listBookingsByShootDay: vi.fn(),
  listCast: vi.fn(),
  listCrew: vi.fn(),
  getEffectiveCrewHierarchyOrDefault: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

vi.mock('@/lib/db/repositories/production', () => ({
  getProductionById: repo.getProductionById,
}))

vi.mock('@/lib/db/repositories/schedule', () => ({
  listShootDaysByProduction: repo.listShootDaysByProduction,
  getShootDayById: repo.getShootDayById,
  listScenesByProduction: repo.listScenesByProduction,
  listShotsByProduction: repo.listShotsByProduction,
}))

vi.mock('@/lib/db/repositories/stripboard-strips', () => ({
  listStripsByShootDay: repo.listStripsByShootDay,
  listStripsByProduction: repo.listStripsByProduction,
}))

vi.mock('@/lib/db/repositories/shoot-day-units', () => ({
  listShootDayUnitsByShootDay: repo.listShootDayUnitsByShootDay,
  listShootDayUnitsByProduction: repo.listShootDayUnitsByProduction,
}))

vi.mock('@/lib/db/repositories/units', () => ({
  listUnitsByProduction: repo.listUnitsByProduction,
}))

vi.mock('@/lib/db/repositories/location', () => ({
  listLocationsByProduction: repo.listLocationsByProduction,
}))

vi.mock('@/lib/db/repositories/key-contacts', () => ({
  listKeyContactsByProduction: repo.listKeyContactsByProduction,
}))

vi.mock('@/lib/db/repositories/episodes', () => ({
  listEpisodesByProduction: repo.listEpisodesByProduction,
}))

vi.mock('@/lib/db/repositories/shootingBlocs', () => ({
  listShootingBlocsByProduction: repo.listShootingBlocsByProduction,
}))

vi.mock('@/lib/db/repositories/scene-cast', () => ({
  getCastIdsBySceneIds: repo.getCastIdsBySceneIds,
}))

vi.mock('@/lib/db/repositories/shot-cast', () => ({
  getCastIdsByShotIds: repo.getCastIdsByShotIds,
}))

vi.mock('@/lib/db/repositories/booking', () => ({
  listBookingsByShootDay: repo.listBookingsByShootDay,
}))

vi.mock('@/lib/db/repositories/person', () => ({
  listCast: repo.listCast,
  listCrew: repo.listCrew,
}))

vi.mock('@/lib/people/crewHierarchyResolver', async () => {
  const actual = await vi.importActual<typeof import('@/lib/people/crewHierarchyResolver')>(
    '@/lib/people/crewHierarchyResolver'
  )
  return {
    ...actual,
    getEffectiveCrewHierarchyOrDefault: repo.getEffectiveCrewHierarchyOrDefault,
  }
})

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: repo.getSetting,
  setSetting: repo.setSetting,
  FIRST_LAUNCH_TUTORIAL_SEEN_KEY: 'x',
  setFirstLaunchTutorialSeen: vi.fn(),
  API_CALL_TRACKING_SETTING_KEY: 'y',
  OPENROUTESERVICE_API_KEY_SETTING: 'z',
}))

function setupRepoDefaults() {
  repo.getProductionById.mockResolvedValue({
    id: 'prod-1',
    name: 'P',
    slug: 'p',
    notes: null,
    currency_code: 'GBP',
    is_episodic: prodCtx.isEpisodic,
    wrapped_at: null,
    archived_at: null,
    created_from_template: null,
    ...soft,
  })
  repo.listShootDaysByProduction.mockResolvedValue([shootDayRow])
  repo.getShootDayById.mockImplementation(async (id: string) =>
    id === 'day-1' ? shootDayRow : null
  )
  repo.listShootDayUnitsByShootDay.mockResolvedValue([dayUnitRow])
  repo.listShootDayUnitsByProduction.mockResolvedValue([dayUnitRow])
  repo.listUnitsByProduction.mockResolvedValue([
    { id: 'unit-1', production_id: 'prod-1', name: 'Main Unit', ...soft },
  ])
  repo.listStripsByShootDay.mockResolvedValue([stripRow])
  repo.listStripsByProduction.mockResolvedValue([stripRow])
  repo.listScenesByProduction.mockResolvedValue([sceneRow])
  repo.listShotsByProduction.mockResolvedValue([])
  repo.listLocationsByProduction.mockResolvedValue([])
  repo.listKeyContactsByProduction.mockResolvedValue([])
  repo.listEpisodesByProduction.mockResolvedValue([
    { id: 'ep-1', production_id: 'prod-1', name: '101', sort_order: 0, ...soft },
  ])
  repo.listShootingBlocsByProduction.mockResolvedValue([
    { id: 'bloc-1', production_id: 'prod-1', name: 'Hero Block', start_date: '2025-05-01', end_date: '2025-07-01', ...soft },
  ])
  repo.getCastIdsBySceneIds.mockResolvedValue(new Map([[sceneRow.id, []]]))
  repo.getCastIdsByShotIds.mockResolvedValue(new Map())
  repo.listBookingsByShootDay.mockResolvedValue([])
  repo.listCast.mockResolvedValue([])
  repo.listCrew.mockResolvedValue([])
  repo.getEffectiveCrewHierarchyOrDefault.mockResolvedValue(getDefaultCrewHierarchyConfig())
  repo.getSetting.mockResolvedValue(null)
  repo.setSetting.mockResolvedValue(undefined)
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('CallSheet episodic PDF output', () => {
  it('includes shooting bloc masthead, EP before SC/SH in schedule header, and mixed row labels when episodes included', async () => {
    const data = minimalCallSheetDataForEpisodicPdfTest({
      shootingBlocMastheadLabel: 'Principal Block',
      includeEpisodesInSchedule: true,
    })
    const bytes = await generateCallSheetPdf(data)
    const text = await extractPdfText(bytes)
    expect(text).toMatch(/Shooting bloc:\s*Principal Block/)
    const epIdx = text.indexOf('EP')
    const scIdx = text.indexOf('SC/SH')
    expect(epIdx).toBeGreaterThanOrEqual(0)
    expect(scIdx).toBeGreaterThan(epIdx)
    expect(text).toMatch(/101/)
    expect(text).toMatch(/102/)
  })

  it('omits EP column content from schedule when episodes excluded (non-episodic schedule path)', async () => {
    const base = minimalCallSheetDataForEpisodicPdfTest()
    const data = {
      ...base,
      includeEpisodesInSchedule: false,
      schedule: base.schedule.map((r) => ({ ...r, episodeLabel: null })),
    }
    const bytes = await generateCallSheetPdf(data)
    const text = await extractPdfText(bytes)
    expect(text.includes('EP')).toBe(false)
  })

  it('omits shooting bloc masthead line when bloc label is null (outside-bloc / unassigned edge)', async () => {
    const data = minimalCallSheetDataForEpisodicPdfTest({
      shootingBlocMastheadLabel: null,
      includeEpisodesInSchedule: true,
    })
    const bytes = await generateCallSheetPdf(data)
    const text = await extractPdfText(bytes)
    expect(text.toLowerCase()).not.toMatch(/shooting bloc:/)
    const epIdx = text.indexOf('EP')
    const scIdx = text.indexOf('SC/SH')
    expect(epIdx).toBeGreaterThanOrEqual(0)
    expect(scIdx).toBeGreaterThan(epIdx)
  })

  it('sparse single-row schedule still renders EP column before SC/SH', async () => {
    const base = minimalCallSheetDataForEpisodicPdfTest()
    const data = {
      ...base,
      schedule: [base.schedule[0]!],
      shootingBlocMastheadLabel: 'Block A',
    }
    const bytes = await generateCallSheetPdf(data)
    const text = await extractPdfText(bytes)
    const epIdx = text.indexOf('EP')
    const scIdx = text.indexOf('SC/SH')
    expect(epIdx).toBeGreaterThanOrEqual(0)
    expect(scIdx).toBeGreaterThan(epIdx)
    expect(text).toMatch(/101/)
  })
})

describe('CallSheetsPage episodic UI', () => {
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
    prodCtx.isEpisodic = true
    setupRepoDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows Include episodes for episodic production and persists setting', async () => {
    const user = userEvent.setup()
    render(wrap(<CallSheetsPage />))

    const pickShoot = screen.getAllByRole('combobox')[0]!
    await user.click(pickShoot)
    await user.click(await screen.findByRole('option', { name: /2025-06-01/ }))
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2))
    await user.click(screen.getAllByRole('combobox')[1]!)
    await user.click(await screen.findByRole('option', { name: /main unit/i }))

    const inc = await screen.findByRole('checkbox', { name: /include episodes/i })
    expect(inc).toBeTruthy()
    await user.click(inc)
    await waitFor(() => expect(repo.setSetting).toHaveBeenCalled())
  })

  it('hides Include episodes for non-episodic production', async () => {
    prodCtx.isEpisodic = false
    repo.getProductionById.mockResolvedValue({
      id: 'prod-1',
      name: 'P',
      slug: 'p',
      notes: null,
      currency_code: 'GBP',
      is_episodic: false,
      wrapped_at: null,
      archived_at: null,
      created_from_template: null,
      ...soft,
    })
    const user = userEvent.setup()
    render(wrap(<CallSheetsPage />))

    await user.click(screen.getAllByRole('combobox')[0]!)
    await user.click(await screen.findByRole('option', { name: /2025-06-01/ }))
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2))
    await user.click(screen.getAllByRole('combobox')[1]!)
    await user.click(await screen.findByRole('option', { name: /main unit/i }))

    expect(screen.queryByRole('checkbox', { name: /include episodes/i })).toBeNull()
  })
})
