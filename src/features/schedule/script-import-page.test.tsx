// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ScriptImportPage } from '@/features/schedule/script-import-page'
import type { ParsedScene } from '@/lib/script-parser'
import type { Location } from '@/lib/db/types'

const parserRepo = vi.hoisted(() => ({
  parse: vi.fn(),
}))

const locationRepo = vi.hoisted(() => ({
  listLocationsByProduction: vi.fn(),
}))

const episodeRepo = vi.hoisted(() => ({
  listEpisodesByProduction: vi.fn(),
}))

const scriptVersionRepo = vi.hoisted(() => ({
  getLatestScriptVersionForScope: vi.fn(),
}))

vi.mock('@/lib/script-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/script-parser')>()
  return {
    ...actual,
    defaultParser: { parse: parserRepo.parse },
    parsePdfScript: vi.fn(),
  }
})

vi.mock('@/lib/db/repositories/location', () => locationRepo)
vi.mock('@/lib/db/repositories/episodes', () => episodeRepo)
vi.mock('@/lib/db/repositories/scriptVersions', () => scriptVersionRepo)
vi.mock('@/hooks/useEffectiveDataSourceForProduction', () => ({
  useEffectiveDataSourceForProduction: () => ({ dataSourceKey: 'local' }),
}))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
    currentProduction: { id: 'prod-1', is_episodic: false },
  }),
}))
vi.mock('@/lib/files', () => ({
  pickAndSaveAttachment: vi.fn(),
}))
vi.mock('@/lib/db/repositories/document', () => ({
  createDocument: vi.fn(),
}))

const SAMPLE_SCENES: ParsedScene[] = [
  {
    scene_number: '1',
    title: 'KITCHEN - DAY',
    location: 'Kitchen',
    int_ext: 'INT',
    day_night: 'DAY',
  },
  {
    scene_number: '2',
    title: 'KITCHEN - NIGHT',
    location: 'KITCHEN',
    int_ext: 'INT',
    day_night: 'NIGHT',
  },
]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('ScriptImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    parserRepo.parse.mockResolvedValue(SAMPLE_SCENES)
    locationRepo.listLocationsByProduction.mockResolvedValue([] as Location[])
    episodeRepo.listEpisodesByProduction.mockResolvedValue([])
    scriptVersionRepo.getLatestScriptVersionForScope.mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
  })

  it('shows merge UI after an edit introduces duplicate location spellings', async () => {
    const user = userEvent.setup()
    parserRepo.parse.mockResolvedValue([
      {
        scene_number: '1',
        title: 'KITCHEN - DAY',
        location: 'KITCHEN',
        int_ext: 'INT',
        day_night: 'DAY',
      },
      {
        scene_number: '2',
        title: 'KITCHEN - NIGHT',
        location: 'KITCHEN',
        int_ext: 'INT',
        day_night: 'NIGHT',
      },
    ] satisfies ParsedScene[])

    render(wrap(<ScriptImportPage />))

    await user.type(screen.getByRole('textbox'), 'INT. KITCHEN - DAY\n\nAction.')
    await user.click(screen.getByRole('button', { name: /parse scenes/i }))

    await waitFor(() => {
      expect(screen.getByText(/found 2 scene\(s\)/i)).toBeTruthy()
    })

    expect(
      screen.queryByText(/these spellings will map to one location on import/i)
    ).toBeNull()

    const sceneRow = screen.getByRole('button', { name: /1.*kitchen.*day/i })
    await user.click(sceneRow)

    const dialog = await screen.findByRole('dialog')
    const locationInput = within(dialog).getByLabelText(/^location$/i)
    await user.clear(locationInput)
    await user.type(locationInput, 'Kitchen')
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/these spellings will map to one location on import/i)
      ).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /merge 2 scenes/i })).toBeTruthy()
    expect(screen.getByText(/some locations have multiple spellings/i)).toBeTruthy()
  })

  it('shows parsed scenes and updates location summary after editing a scene', async () => {
    const user = userEvent.setup()
    render(wrap(<ScriptImportPage />))

    await user.type(screen.getByRole('textbox'), 'INT. KITCHEN - DAY\n\nAction.')
    await user.click(screen.getByRole('button', { name: /parse scenes/i }))

    await waitFor(() => {
      expect(screen.getByText(/found 2 scene\(s\)/i)).toBeTruthy()
    })

    expect(screen.getByText(/locations in this import/i)).toBeTruthy()
    expect(
      screen.getByText(/these spellings will map to one location on import/i)
    ).toBeTruthy()

    const sceneButtons = screen.getAllByRole('button', { name: /kitchen/i })
    const firstSceneRow = sceneButtons.find((btn) => btn.textContent?.includes('1'))!
    await user.click(firstSceneRow)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/edit parsed scene/i)).toBeTruthy()

    const locationInput = within(dialog).getByLabelText(/^location$/i)
    await user.clear(locationInput)
    await user.type(locationInput, 'Main Kitchen')
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    expect(screen.getAllByText(/main kitchen/i).length).toBeGreaterThan(0)
  })
})
