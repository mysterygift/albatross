// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ShootDayScriptSectionsPanel } from '@/features/schedule/shoot-day-script-sections-panel'
import type { ScriptSection } from '@/lib/db/types'
import type { ShootDayCoverageLoadResult, ShootDayCoverageSummary } from '@/lib/db/coverageAnalysisService'

const loadCoverage = vi.hoisted(() => vi.fn())
const listSectionsByIds = vi.hoisted(() => vi.fn())
const getShootDayById = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/coverageAnalysisService', () => ({
  loadShootDayCoverage: loadCoverage,
}))

vi.mock('@/lib/db/repositories/scriptSections', () => ({
  listSectionsByIds,
}))

vi.mock('@/lib/db/repositories/schedule', () => ({
  getShootDayById,
}))

vi.mock('@/hooks/useEffectiveDataSourceForProduction', () => ({
  useEffectiveDataSourceForProduction: () => ({
    data: 'local_sqlite' as const,
    dataSourceKey: 'local_sqlite' as const,
  }),
}))

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function section(over: Partial<ScriptSection> = {}): ScriptSection {
  return {
    id: 'sec-1',
    production_id: 'prod-1',
    script_version_id: 'ver-1',
    scene_id: 'scene-1',
    episode_id: null,
    label: null,
    section_type: 'dialogue',
    status: 'unplanned',
    notes: null,
    is_manual: 0,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

function coverageLoad(
  over: Partial<Omit<ShootDayCoverageLoadResult, 'coverage'>> & {
    coverage?: Partial<ShootDayCoverageSummary>
  } = {}
): ShootDayCoverageLoadResult {
  const { coverage: coverageOverride, ...rest } = over
  return {
    coverage: {
      shootDayId: 'day-1',
      scheduledScenes: 1,
      includedSections: 0,
      fallbackSections: 0,
      missingSections: 0,
      selectedSidesSections: 0,
      unscheduledSelectedSections: 0,
      totalEstimatedEighths: 0,
      blockingExportIssues: [],
      issues: [],
      ...(coverageOverride ?? {}),
    },
    includedSectionIds: [],
    fallbackSectionIds: [],
    partialSceneIds: [],
    sectionsScheduledViaShotsOnly: [],
    ...rest,
  }
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ShootDayScriptSectionsPanel shootDayId="day-1" shootDayUnitId={null} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ShootDayScriptSectionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getShootDayById.mockResolvedValue({ id: 'day-1', production_id: 'prod-1', shoot_date: '2026-06-01' })
    listSectionsByIds.mockResolvedValue([])
  })
  afterEach(() => cleanup())

  it('renders included sections, eighths, and warnings', async () => {
    loadCoverage.mockResolvedValue(
      coverageLoad({
        includedSectionIds: ['sec-1'],
        coverage: {
          includedSections: 1,
          totalEstimatedEighths: 4,
          issues: [
            {
              code: 'scheduled_shot_no_section',
              severity: 'warning',
              message: 'Scheduled shot has no linked script section.',
              shotId: 'shot-2',
            },
          ],
        },
      })
    )
    listSectionsByIds.mockResolvedValue([section({ id: 'sec-1', label: 'Opening dialogue' })])

    renderPanel()

    await waitFor(() => expect(screen.getByText('Opening dialogue')).toBeTruthy())
    expect(screen.getByText('Included (shot-linked)')).toBeTruthy()
    expect(screen.getByText('Estimated eighths')).toBeTruthy()
    expect(screen.getByText('~4/8')).toBeTruthy()
    expect(screen.getByText('Scheduled shot has no linked script section.')).toBeTruthy()
  })

  it('shows an empty state when no sections are derived', async () => {
    loadCoverage.mockResolvedValue(coverageLoad())

    renderPanel()

    await waitFor(() =>
      expect(screen.getByText('No script sections derived for this day yet.')).toBeTruthy()
    )
  })

  it('renders the full-scene fallback list', async () => {
    loadCoverage.mockResolvedValue(
      coverageLoad({
        fallbackSectionIds: ['sec-9'],
        coverage: {
          fallbackSections: 1,
          totalEstimatedEighths: 8,
          issues: [
            {
              code: 'scene_fallback_full_scene',
              severity: 'info',
              message: 'Scheduled scene has no shot-linked sections; using full-scene fallback.',
              sceneId: 'scene-1',
            },
          ],
        },
      })
    )
    listSectionsByIds.mockResolvedValue([section({ id: 'sec-9', label: 'Full scene block' })])

    renderPanel()

    await waitFor(() => expect(screen.getByText('Full scene block')).toBeTruthy())
    expect(screen.getAllByText('Full-scene fallback').length).toBeGreaterThan(0)
  })
})
