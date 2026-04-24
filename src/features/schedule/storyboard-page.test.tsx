// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { StoryboardPage } from '@/features/schedule/storyboard-page'
import type { Scene, Shot, StoryboardImage } from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

const scheduleRepo = vi.hoisted(() => ({
  listScenesByProduction: vi.fn(),
  listShotsByProduction: vi.fn(),
}))

const storyboardRepo = vi.hoisted(() => ({
  listStoryboardImagesByProduction: vi.fn(),
  createStoryboardImage: vi.fn(),
  updateStoryboardImage: vi.fn(),
  deleteStoryboardImage: vi.fn(),
  applyAthenaImportToStoryboard: vi.fn(),
  updateStoryboardImport: vi.fn(),
}))

const filesRepo = vi.hoisted(() => ({
  getFileUrl: vi.fn(),
  pickAthenaGalleryPdfForImport: vi.fn(),
  pickStoryboardImageForManualImport: vi.fn(),
  saveStoryboardImageFromLocalPath: vi.fn(),
  removeStoryboardImageFile: vi.fn(),
}))

const athenaImportService = vi.hoisted(() => ({
  extractAthenaPanelsFromPdf: vi.fn(),
  matchAthenaPanelsToShots: vi.fn(),
  buildAthenaImportReviewRows: vi.fn(),
}))

vi.mock('@/lib/db/repositories/schedule', () => scheduleRepo)
vi.mock('@/lib/db/repositories/storyboard', () => storyboardRepo)
vi.mock('@/lib/files', () => filesRepo)
vi.mock('@/lib/storyboard/athena-import', () => athenaImportService)
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: 'prod-1',
  }),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

function scene(over: Partial<Scene>): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '1',
    heading: 'INT. OFFICE - DAY',
    title: null,
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

function shot(over: Partial<Shot>): Shot {
  return {
    id: 'shot-1',
    scene_id: 'scene-1',
    shot_number: '1A',
    description: null,
    shot_description: 'Hero close-up',
    subject: null,
    action_description: null,
    shot_size: 'CU',
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

function image(over: Partial<StoryboardImage>): StoryboardImage {
  return {
    id: 'img-1',
    production_id: 'prod-1',
    scene_id: 'scene-1',
    shot_id: 'shot-1',
    storage_key: 'storyboards/prod-1/shots/shot-1/manual/img-1.jpg',
    original_filename: 'board-a.jpg',
    mime_type: 'image/jpeg',
    width: 1200,
    height: 800,
    sort_order: 0,
    source_type: 'manual',
    source_import_id: null,
    ...soft,
    ...over,
  }
}

describe('StoryboardPage', () => {
  let scenesData: Scene[]
  let shotsData: Shot[]
  let imagesData: StoryboardImage[]
  let saveCounter = 0

  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    HTMLElement.prototype.scrollIntoView = () => {}
    saveCounter = 0
    scenesData = []
    shotsData = []
    imagesData = []
    scheduleRepo.listScenesByProduction.mockImplementation(async () => scenesData)
    scheduleRepo.listShotsByProduction.mockImplementation(async () => shotsData)
    storyboardRepo.listStoryboardImagesByProduction.mockImplementation(async () => imagesData)
    storyboardRepo.createStoryboardImage.mockImplementation(async (payload: Record<string, unknown>) => {
      const created = image({
        id: `img-created-${imagesData.length + 1}`,
        production_id: payload.production_id as string,
        scene_id: payload.scene_id as string,
        shot_id: payload.shot_id as string,
        storage_key: payload.storage_key as string,
        original_filename: payload.original_filename as string,
        mime_type: payload.mime_type as string,
      })
      imagesData = [...imagesData, created]
      return created
    })
    storyboardRepo.updateStoryboardImage.mockImplementation(async (id: string, payload: Record<string, unknown>) => {
      imagesData = imagesData.map((img) =>
        img.id === id
          ? {
              ...img,
              ...(payload.storage_key ? { storage_key: payload.storage_key as string } : {}),
              ...(payload.original_filename ? { original_filename: payload.original_filename as string } : {}),
              ...(payload.mime_type ? { mime_type: payload.mime_type as string } : {}),
            }
          : img
      )
      return imagesData.find((img) => img.id === id)!
    })
    storyboardRepo.deleteStoryboardImage.mockImplementation(async (id: string) => {
      imagesData = imagesData.filter((img) => img.id !== id)
    })
    storyboardRepo.applyAthenaImportToStoryboard.mockResolvedValue({ appliedCount: 1 })
    storyboardRepo.updateStoryboardImport.mockResolvedValue({ id: 'import-1' })
    filesRepo.getFileUrl.mockImplementation(async (key: string) => `file:///app/${key}`)
    filesRepo.pickAthenaGalleryPdfForImport.mockResolvedValue({
      sourcePath: '/tmp/gallery.pdf',
      originalFilename: 'gallery.pdf',
      mimeType: 'application/pdf',
    })
    filesRepo.pickStoryboardImageForManualImport.mockResolvedValue({
      sourcePath: '/tmp/new-image.jpg',
      originalFilename: 'new-image.jpg',
      mimeType: 'image/jpeg',
    })
    filesRepo.saveStoryboardImageFromLocalPath.mockImplementation(async () => {
      saveCounter += 1
      return {
        storageKey: `storyboards/prod-1/shots/shot-1/manual/upload-${saveCounter}.jpg`,
        originalFilename: saveCounter === 1 ? 'new-image.jpg' : `new-image-${saveCounter}.jpg`,
      }
    })
    filesRepo.removeStoryboardImageFile.mockResolvedValue(undefined)
    athenaImportService.extractAthenaPanelsFromPdf.mockResolvedValue({
      importId: 'import-1',
      candidates: [
        {
          id: 'cand-1',
          source_import_id: 'import-1',
          storage_key: 'storyboards/prod-1/imports/import-1/candidates/a.png',
          preview_url: 'file:///app/storyboards/prod-1/imports/import-1/candidates/a.png',
          page_number: 1,
          panel_index: 0,
          global_order: 0,
          detected_number_text: '1A',
          number_confidence: 'text',
          bbox: { x: 0, y: 0, width: 200, height: 100 },
        },
      ],
    })
    athenaImportService.matchAthenaPanelsToShots.mockImplementation(
      ({ candidates }: { candidates: Array<{ id: string; detected_number_text: string | null }> }) =>
        candidates.map((candidate) => ({
          candidate,
          status: 'matched',
          matched_shot_id: 'shot-1',
          matched_shot_number: '1A',
          match_method: 'number',
        }))
    )
    athenaImportService.buildAthenaImportReviewRows.mockImplementation(
      ({ matchRows }: { matchRows: Array<{ candidate: { id: string }; matched_shot_id: string | null; matched_shot_number: string | null }> }) =>
        matchRows.map((row) => ({
          candidate: row.candidate,
          status: 'matched',
          matched_shot_id: row.matched_shot_id,
          matched_shot_number: row.matched_shot_number,
          match_method: 'number',
          has_existing_images: row.matched_shot_id === 'shot-1' && imagesData.some((img) => img.shot_id === 'shot-1'),
          conflict_policy: 'skip',
          is_ready_to_apply: row.matched_shot_id != null,
        }))
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders scenes and shots grouped under scenes', async () => {
    scenesData = [
      scene({ id: 'scene-1', scene_number: '10', heading: 'INT. OFFICE - DAY' }),
      scene({ id: 'scene-2', scene_number: '11', heading: 'EXT. STREET - NIGHT' }),
    ]
    shotsData = [
      shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: '1A' }),
      shot({ id: 'shot-2', scene_id: 'scene-2', shot_number: '2B', shot_description: 'Wide walk and talk' }),
    ]

    render(wrap(<StoryboardPage />))

    await waitFor(() => expect(scheduleRepo.listScenesByProduction).toHaveBeenCalledWith('prod-1'))
    expect(await screen.findByText(/Scene 10/)).toBeTruthy()
    expect(await screen.findByText(/Scene 11/)).toBeTruthy()
    expect(await screen.findByText(/Shot 1A/)).toBeTruthy()
    expect(await screen.findByText(/Shot 2B/)).toBeTruthy()
  })

  it('shows storyboard thumbnails when images exist and placeholders otherwise', async () => {
    scenesData = [scene({})]
    shotsData = [
      shot({ id: 'shot-with-image', shot_number: '3', scene_id: 'scene-1' }),
      shot({ id: 'shot-empty', shot_number: '4', scene_id: 'scene-1' }),
    ]
    imagesData = [
      image({ id: 'img-1', shot_id: 'shot-with-image', original_filename: 'frame-1.jpg' }),
    ]

    render(wrap(<StoryboardPage />))

    await waitFor(() =>
      expect(storyboardRepo.listStoryboardImagesByProduction).toHaveBeenCalledWith('prod-1')
    )
    expect(await screen.findByRole('img', { name: 'frame-1.jpg' })).toBeTruthy()
    expect(await screen.findByText('No storyboard images yet.')).toBeTruthy()
  })

  it('shows clean empty state when there are no scenes', async () => {
    render(wrap(<StoryboardPage />))
    await waitFor(() => expect(scheduleRepo.listScenesByProduction).toHaveBeenCalled())
    expect(await screen.findByText(/No scenes yet/)).toBeTruthy()
  })

  it('does not display non-current-production scene/image data', async () => {
    scenesData = [
      scene({ id: 'scene-valid', production_id: 'prod-1', scene_number: '1' }),
      scene({ id: 'scene-foreign', production_id: 'prod-2', scene_number: '99', heading: 'FOREIGN' }),
    ]
    shotsData = [
      shot({ id: 'shot-valid', scene_id: 'scene-valid', shot_number: 'A' }),
      shot({ id: 'shot-foreign', scene_id: 'scene-foreign', shot_number: 'B' }),
    ]
    imagesData = [
      image({ id: 'img-valid', production_id: 'prod-1', shot_id: 'shot-valid', original_filename: 'ok.jpg' }),
      image({ id: 'img-foreign', production_id: 'prod-2', shot_id: 'shot-foreign', original_filename: 'foreign.jpg' }),
    ]

    render(wrap(<StoryboardPage />))

    await waitFor(() => expect(scheduleRepo.listScenesByProduction).toHaveBeenCalled())
    expect(await screen.findByText(/Scene 1/)).toBeTruthy()
    expect(screen.queryByText(/Scene 99/)).toBeNull()
    expect(await screen.findByRole('img', { name: 'ok.jpg' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'foreign.jpg' })).toBeNull()
  })

  it('uploading image creates storyboard image and updates display', async () => {
    const user = userEvent.setup()
    scenesData = [scene({ id: 'scene-1' })]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: 'X' })]

    render(wrap(<StoryboardPage />))
    await screen.findByText(/Shot X/)

    await user.click(screen.getByRole('button', { name: 'Add image' }))
    await waitFor(() => expect(storyboardRepo.createStoryboardImage).toHaveBeenCalled())
    expect(await screen.findByRole('img', { name: 'new-image.jpg' })).toBeTruthy()
  })

  it('replacing image updates thumbnail and removing clears image', async () => {
    const user = userEvent.setup()
    scenesData = [scene({ id: 'scene-1' })]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: 'Y' })]
    imagesData = [image({ id: 'img-1', shot_id: 'shot-1', original_filename: 'old.jpg' })]
    filesRepo.saveStoryboardImageFromLocalPath.mockResolvedValue({
      storageKey: 'storyboards/prod-1/shots/shot-1/manual/replaced.jpg',
      originalFilename: 'replaced.jpg',
    })

    render(wrap(<StoryboardPage />))
    expect(await screen.findByRole('img', { name: 'old.jpg' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(storyboardRepo.updateStoryboardImage).toHaveBeenCalled())
    expect(await screen.findByRole('img', { name: 'replaced.jpg' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(storyboardRepo.deleteStoryboardImage).toHaveBeenCalled())
    expect(await screen.findByText('No storyboard images yet.')).toBeTruthy()
  })

  it('preview opens and invalid file type is surfaced as an error', async () => {
    const user = userEvent.setup()
    scenesData = [scene({ id: 'scene-1' })]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: 'P' })]
    imagesData = [image({ id: 'img-prev', shot_id: 'shot-1', original_filename: 'preview.jpg' })]

    render(wrap(<StoryboardPage />))
    await user.click(await screen.findByRole('img', { name: 'preview.jpg' }))
    expect(await screen.findByText('preview.jpg')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    filesRepo.pickStoryboardImageForManualImport.mockRejectedValueOnce(
      new Error('Unsupported file type. Please select an image.')
    )
    await user.click(screen.getByRole('button', { name: 'Add image' }))
    expect(await screen.findByText('Unsupported file type. Please select an image.')).toBeTruthy()
  })

  it('toggles between list and grid layouts', async () => {
    const user = userEvent.setup()
    scenesData = [scene({ id: 'scene-1', scene_number: '10' })]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: '1A' })]

    render(wrap(<StoryboardPage />))

    expect(await screen.findByTestId('storyboard-list-layout')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Grid' }))
    expect(await screen.findByTestId('storyboard-grid-layout')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'List' }))
    expect(await screen.findByTestId('storyboard-list-layout')).toBeTruthy()
  })

  it('filters by scene and restores all scenes', async () => {
    const user = userEvent.setup()
    scenesData = [
      scene({ id: 'scene-1', scene_number: '10', heading: 'INT. OFFICE - DAY' }),
      scene({ id: 'scene-2', scene_number: '11', heading: 'EXT. STREET - NIGHT' }),
    ]
    shotsData = [
      shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: '1A' }),
      shot({ id: 'shot-2', scene_id: 'scene-2', shot_number: '2B' }),
    ]

    render(wrap(<StoryboardPage />))
    expect(await screen.findByText(/Scene 10/)).toBeTruthy()
    expect(await screen.findByText(/Scene 11/)).toBeTruthy()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Scene 11 - EXT. STREET - NIGHT'))
    expect(screen.queryByText(/Scene 10/)).toBeNull()
    expect(await screen.findByText(/Shot 2B/)).toBeTruthy()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('All scenes'))
    expect(await screen.findByText(/Scene 10/)).toBeTruthy()
    expect(await screen.findByText(/Scene 11/)).toBeTruthy()
  })

  it('keeps scene and shot ordering stable across view toggles and filtering', async () => {
    const user = userEvent.setup()
    scenesData = [
      scene({ id: 'scene-a', scene_number: '20', heading: 'FIRST' }),
      scene({ id: 'scene-b', scene_number: '10', heading: 'SECOND' }),
    ]
    shotsData = [
      shot({ id: 'shot-a1', scene_id: 'scene-a', shot_number: '3C' }),
      shot({ id: 'shot-a2', scene_id: 'scene-a', shot_number: '1A' }),
      shot({ id: 'shot-b1', scene_id: 'scene-b', shot_number: '9Z' }),
    ]

    render(wrap(<StoryboardPage />))
    await screen.findByText(/Scene 20/)

    const scene20Before = screen.getByText(/Scene 20/)
    const scene10Before = screen.getByText(/Scene 10/)
    expect(scene20Before.compareDocumentPosition(scene10Before) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const shot3CBefore = screen.getAllByText('Shot 3C')[0]
    const shot1ABefore = screen.getAllByText('Shot 1A')[0]
    expect(shot3CBefore.compareDocumentPosition(shot1ABefore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Grid' }))
    const scene20AfterGrid = await screen.findByText(/Scene 20/)
    const scene10AfterGrid = await screen.findByText(/Scene 10/)
    expect(scene20AfterGrid.compareDocumentPosition(scene10AfterGrid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Scene 20 - FIRST'))
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('All scenes'))

    const shot3CAfter = screen.getAllByText('Shot 3C')[0]
    const shot1AAfter = screen.getAllByText('Shot 1A')[0]
    expect(shot3CAfter.compareDocumentPosition(shot1AAfter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows empty filtered state when selected scene has no shots', async () => {
    const user = userEvent.setup()
    scenesData = [
      scene({ id: 'scene-1', scene_number: '10', heading: 'INT. OFFICE - DAY' }),
      scene({ id: 'scene-2', scene_number: '11', heading: 'EMPTY' }),
    ]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: '1A' })]

    render(wrap(<StoryboardPage />))
    await screen.findByText(/Scene 10/)

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Scene 11 - EMPTY'))
    expect(await screen.findByText('No shots in scene 11 yet.')).toBeTruthy()
  })

  it('renders import review and applies with conflict handling', async () => {
    const user = userEvent.setup()
    scenesData = [scene({ id: 'scene-1', scene_number: '10' })]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: '1A' })]
    imagesData = [image({ id: 'existing-1', shot_id: 'shot-1', original_filename: 'existing.jpg' })]

    athenaImportService.buildAthenaImportReviewRows.mockImplementationOnce(
      ({ matchRows }: { matchRows: Array<{ candidate: { id: string }; matched_shot_id: string | null; matched_shot_number: string | null }> }) =>
        matchRows.map((row) => ({
          candidate: row.candidate,
          status: 'matched',
          matched_shot_id: row.matched_shot_id,
          matched_shot_number: row.matched_shot_number,
          match_method: 'number',
          has_existing_images: true,
          conflict_policy: 'skip',
          is_ready_to_apply: false,
        }))
    )
    athenaImportService.buildAthenaImportReviewRows.mockImplementation(
      ({ matchRows }: { matchRows: Array<{ candidate: { id: string }; matched_shot_id: string | null; matched_shot_number: string | null }> }) =>
        matchRows.map((row) => ({
          candidate: row.candidate,
          status: 'matched',
          matched_shot_id: row.matched_shot_id,
          matched_shot_number: row.matched_shot_number,
          match_method: 'number',
          has_existing_images: true,
          conflict_policy: 'replace',
          is_ready_to_apply: true,
        }))
    )

    render(wrap(<StoryboardPage />))
    await user.click(await screen.findByRole('button', { name: 'Import Athena Gallery PDF' }))
    expect(await screen.findByText(/Exclude non-shot images/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue to review' }))
    expect(await screen.findByText(/Athena import review/i)).toBeTruthy()
    expect(await screen.findByText(/Conflict handling/i)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Apply import' }))
    await waitFor(() => expect(storyboardRepo.applyAthenaImportToStoryboard).toHaveBeenCalled())
  })

  it('discarding import cleans up candidate files and clears review state', async () => {
    const user = userEvent.setup()
    scenesData = [scene({ id: 'scene-1', scene_number: '10' })]
    shotsData = [shot({ id: 'shot-1', scene_id: 'scene-1', shot_number: '1A' })]

    render(wrap(<StoryboardPage />))
    await user.click(await screen.findByRole('button', { name: 'Import Athena Gallery PDF' }))
    expect(await screen.findByText(/Exclude non-shot images/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue to review' }))
    await user.click(screen.getByRole('button', { name: 'Discard import' }))
    await waitFor(() => expect(filesRepo.removeStoryboardImageFile).toHaveBeenCalled())
    await waitFor(() => expect(storyboardRepo.updateStoryboardImport).toHaveBeenCalled())
    expect(screen.queryByText(/Athena import preview/i)).toBeNull()
  })
})
