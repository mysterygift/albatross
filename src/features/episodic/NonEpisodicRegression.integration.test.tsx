// @vitest-environment jsdom
/**
 * Explicit regression shield: non-episodic productions must not surface episodic chrome
 * (settings, archive/music, deliverables, schedule strip/calendar, call sheet).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'

import { SettingsPage } from '@/features/settings/page'
import { MusicClearancePage } from '@/features/music-clearance/page'
import { DeliverablesPage } from '@/features/deliverables/page'
import { CallSheetsPage } from '@/features/call-sheets/page'
import { StripboardDayColumn } from '@/features/schedule/stripboard-day-column'
import { CalendarEventCardBody } from '@/features/schedule/calendar-page'

import type { ShootDay, ShootDayUnit, Unit, StripboardStrip } from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

vi.mock('@/features/productions/useApfActions', () => ({
  useApfActions: () => ({ apfBusy: null, handleImportApf: vi.fn(), handleExportApf: vi.fn() }),
}))

const prodCtx = vi.hoisted(() => ({
  currentProduction: {
    id: 'prod-1',
    name: 'Film',
    slug: 'film',
    currency_code: 'GBP',
    notes: null,
    is_episodic: false,
    wrapped_at: null,
    archived_at: null,
    created_from_template: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
  },
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: prodCtx.currentProduction,
    productions: [prodCtx.currentProduction],
    refetchProductions: vi.fn(),
    setCurrentProductionId: vi.fn(),
    getSelectedBudgetRevisionId: () => 'rev-1',
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
}))

vi.mock('@/hooks/useWorkingBudgetRevision', () => ({
  useWorkingBudgetRevision: () => ({ data: { id: 'rev-1' }, setSelectedRevisionId: vi.fn() }),
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

vi.mock('@/lib/db/repositories/budgetAccounts', () => ({
  listAccounts: vi.fn(async () => []),
  createAccount: vi.fn(),
  updateAccountName: vi.fn(),
  updateAccountColor: vi.fn(),
  archiveAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  hardDeleteAccount: vi.fn(),
  getHardDeleteEligibleAccountIds: vi.fn(async () => new Set()),
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

vi.mock('@/lib/db/episodeManagementService', () => ({
  loadEpisodesForSettings: vi.fn(async () => []),
  appendEpisode: vi.fn(),
  renameEpisode: vi.fn(),
  reorderEpisodes: vi.fn(),
  archiveEpisode: vi.fn(),
}))

vi.mock('@/lib/db/repositories/music-clearance', () => ({
  listMusicTracksByProduction: vi.fn(async () => [
    {
      id: 't1',
      production_id: 'prod-1',
      episode_id: null,
      title: 'Cue',
      artist: null,
      publisher_label: null,
      notes: null,
      ...soft,
    },
  ]),
  createMusicTrack: vi.fn(),
  updateMusicTrack: vi.fn(),
}))

vi.mock('@/lib/db/repositories/deliverable', () => ({
  listDeliverablesByProduction: vi.fn(async () => []),
  createDeliverable: vi.fn(),
  updateDeliverable: vi.fn(),
  deleteDeliverable: vi.fn(),
  getTechnicalSpecByDeliverable: vi.fn(),
  getTechnicalSpecsByDeliverableIds: vi.fn(async () => []),
  upsertTechnicalSpec: vi.fn(),
}))

vi.mock('@/lib/db/repositories/deliverableTemplates', () => ({
  listDeliverableTemplates: vi.fn(async () => []),
  applyDeliverableTemplateToProduction: vi.fn(),
}))

const csRepo = vi.hoisted(() => ({
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

vi.mock('@/lib/db/repositories/production', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/repositories/production')>(
    '@/lib/db/repositories/production'
  )
  return {
    ...actual,
    listProductions: vi.fn(async () => []),
    findExistingDemoTemplateProduction: vi.fn(async () => null),
    getProductionById: csRepo.getProductionById,
  }
})

vi.mock('@/lib/db/repositories/schedule', () => ({
  listShootDaysByProduction: csRepo.listShootDaysByProduction,
  getShootDayById: csRepo.getShootDayById,
  listScenesByProduction: csRepo.listScenesByProduction,
  listShotsByProduction: csRepo.listShotsByProduction,
}))

vi.mock('@/lib/db/repositories/stripboard-strips', () => ({
  listStripsByShootDay: csRepo.listStripsByShootDay,
  listStripsByProduction: csRepo.listStripsByProduction,
}))

vi.mock('@/lib/db/repositories/shoot-day-units', () => ({
  listShootDayUnitsByShootDay: csRepo.listShootDayUnitsByShootDay,
  listShootDayUnitsByProduction: csRepo.listShootDayUnitsByProduction,
}))

vi.mock('@/lib/db/repositories/units', () => ({
  listUnitsByProduction: csRepo.listUnitsByProduction,
}))

vi.mock('@/lib/db/repositories/location', () => ({
  listLocationsByProduction: csRepo.listLocationsByProduction,
}))

vi.mock('@/lib/db/repositories/key-contacts', () => ({
  listKeyContactsByProduction: csRepo.listKeyContactsByProduction,
}))

vi.mock('@/lib/db/repositories/episodes', () => ({
  listEpisodesByProduction: csRepo.listEpisodesByProduction,
  listEpisodesForProductionManagement: vi.fn(),
}))

vi.mock('@/lib/db/repositories/shootingBlocs', () => ({
  listShootingBlocsByProduction: csRepo.listShootingBlocsByProduction,
}))

vi.mock('@/lib/db/repositories/scene-cast', () => ({
  getCastIdsBySceneIds: csRepo.getCastIdsBySceneIds,
}))

vi.mock('@/lib/db/repositories/shot-cast', () => ({
  getCastIdsByShotIds: csRepo.getCastIdsByShotIds,
}))

vi.mock('@/lib/db/repositories/booking', () => ({
  listBookingsByShootDay: csRepo.listBookingsByShootDay,
}))

vi.mock('@/lib/db/repositories/person', () => ({
  listCast: csRepo.listCast,
  listCrew: csRepo.listCrew,
}))

vi.mock('@/lib/people/crewHierarchyResolver', async () => {
  const actual = await vi.importActual<typeof import('@/lib/people/crewHierarchyResolver')>(
    '@/lib/people/crewHierarchyResolver'
  )
  return {
    ...actual,
    getEffectiveCrewHierarchyOrDefault: csRepo.getEffectiveCrewHierarchyOrDefault,
  }
})

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: csRepo.getSetting,
  setSetting: csRepo.setSetting,
  FIRST_LAUNCH_TUTORIAL_SEEN_KEY: 'x',
  setFirstLaunchTutorialSeen: vi.fn(),
  API_CALL_TRACKING_SETTING_KEY: 'y',
  OPENROUTESERVICE_API_KEY_SETTING: 'z',
}))

vi.mock('@/lib/weather/openMeteo', () => ({
  getWeatherForCallSheet: vi.fn(async () => null),
}))

vi.mock('@/lib/files', () => ({
  saveFileWithDialog: vi.fn(),
  openInSystem: vi.fn(),
}))

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}))

vi.mock('@/hooks/useFirstLaunchTutorial', () => ({
  useFirstLaunchTutorial: () => ({ progress: null, updateProgress: vi.fn() }),
}))

vi.mock('@/lib/pdf', () => ({ generateCueSheet: vi.fn() }))

import { getDefaultCrewHierarchyConfig } from '@/lib/people/crewHierarchyResolver'

const shootDayRow = {
  id: 'day-1',
  production_id: 'prod-1',
  shooting_bloc_id: null,
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

function setupCallSheetMocks() {
  csRepo.getProductionById.mockResolvedValue(prodCtx.currentProduction)
  csRepo.listShootDaysByProduction.mockResolvedValue([shootDayRow])
  csRepo.getShootDayById.mockResolvedValue(shootDayRow)
  csRepo.listShootDayUnitsByShootDay.mockResolvedValue([
    { id: 'sdu-1', shoot_day_id: 'day-1', unit_id: 'unit-1', notes: null, is_locked: 0, ...soft },
  ])
  csRepo.listShootDayUnitsByProduction.mockResolvedValue([
    { id: 'sdu-1', shoot_day_id: 'day-1', unit_id: 'unit-1', notes: null, is_locked: 0, ...soft },
  ])
  csRepo.listUnitsByProduction.mockResolvedValue([
    { id: 'unit-1', production_id: 'prod-1', name: 'Main', ...soft },
  ])
  csRepo.listStripsByShootDay.mockResolvedValue([])
  csRepo.listStripsByProduction.mockResolvedValue([])
  csRepo.listScenesByProduction.mockResolvedValue([])
  csRepo.listShotsByProduction.mockResolvedValue([])
  csRepo.listLocationsByProduction.mockResolvedValue([])
  csRepo.listKeyContactsByProduction.mockResolvedValue([])
  csRepo.listEpisodesByProduction.mockResolvedValue([])
  csRepo.listShootingBlocsByProduction.mockResolvedValue([])
  csRepo.getCastIdsBySceneIds.mockResolvedValue(new Map())
  csRepo.getCastIdsByShotIds.mockResolvedValue(new Map())
  csRepo.listBookingsByShootDay.mockResolvedValue([])
  csRepo.listCast.mockResolvedValue([])
  csRepo.listCrew.mockResolvedValue([])
  csRepo.getEffectiveCrewHierarchyOrDefault.mockResolvedValue(getDefaultCrewHierarchyConfig())
  csRepo.getSetting.mockResolvedValue(null)
}

function qc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

describe('Non-episodic regression shield', () => {
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
    setupCallSheetMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('Settings: Episodes section absent; episodic enable card still copy-only', async () => {
    render(
      <QueryClientProvider client={qc()}>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Episodes' })).toBeNull()
    expect(screen.getByText(/Episodic production/i)).toBeTruthy()
  })

  it('Music & Archive: no Show / Scope', async () => {
    render(
      <QueryClientProvider client={qc()}>
        <MusicClearancePage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Cue')).toBeTruthy())
    expect(screen.queryByText('Show')).toBeNull()
    expect(screen.queryByText('Scope')).toBeNull()
  })

  it('Deliverables: no Show / Scope column', async () => {
    render(
      <QueryClientProvider client={qc()}>
        <DeliverablesPage />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByText('No deliverables yet. Add one or apply a template to get started.')
      ).toBeTruthy()
    )
    expect(screen.queryByText('Show')).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Scope' })).toBeNull()
  })

  it('Stripboard: no bloc label; Calendar card: no bloc when not episodic', () => {
    const day: ShootDay = {
      id: 'day-1',
      production_id: 'prod-1',
      shooting_bloc_id: 'b1',
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
    const unit: Unit = { id: 'u-1', production_id: 'prod-1', name: 'U', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: day.id,
      unit_id: unit.id,
      notes: null,
      is_locked: 0,
      ...soft,
    }
    const blocLabel = 'HiddenBlocLabelNonEpisodic'
    const { unmount } = render(
      <TooltipProvider>
        <DndContext onDragEnd={() => {}}>
          <StripboardDayColumn
            day={day}
            units={[unit]}
            dayUnits={[sdu]}
            stripsByUnit={[{ shootDayUnit: sdu, strips: [] as StripboardStrip[] }]}
            scenes={[]}
            shots={[]}
            estimatedShootMinutesByShotId={new Map()}
            columnId={(d, u) => `${d}:${u}`}
            isLocked={false}
            pageEighthsTarget={48}
            onSendToBoneyard={() => {}}
            isEpisodic={false}
            shootingBlocLabel={blocLabel}
          />
        </DndContext>
      </TooltipProvider>
    )
    expect(screen.queryByText(blocLabel)).toBeNull()
    unmount()

    render(
      <CalendarEventCardBody
        event={{
          shootDayId: 'd',
          shootDayUnitId: 'du',
          date: '2025-06-01',
          shootingBlocId: 'b',
          shootingBlocName: 'BlocName',
          unitId: 'u',
          unitName: 'Main',
          unitKey: 'main',
          callTime: null,
          lunchTime: null,
          wrapTime: null,
          notes: null,
          primaryLocationName: null,
          primaryLocationId: null,
          shotCount: 0,
          estMinutes: 0,
        }}
        onClick={() => {}}
        isEpisodic={false}
      />
    )
    expect(screen.queryByText('BlocName')).toBeNull()
  })

  it('Call sheets: no Include episodes after selecting day/unit', async () => {
    const { userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={qc()}>
        <CallSheetsPage />
      </QueryClientProvider>
    )
    await user.click(screen.getAllByRole('combobox')[0]!)
    await user.click(await screen.findByRole('option', { name: /2025-06-01/ }))
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2))
    await user.click(screen.getAllByRole('combobox')[1]!)
    await user.click(await screen.findByRole('option', { name: /main/i }))
    expect(screen.queryByRole('checkbox', { name: /include episodes/i })).toBeNull()
  })
})
