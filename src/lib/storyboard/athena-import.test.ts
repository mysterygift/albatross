// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
}))

const storyboardRepoMock = vi.hoisted(() => ({
  createStoryboardImport: vi.fn(),
  updateStoryboardImport: vi.fn(),
}))

const fileMock = vi.hoisted(() => ({
  assertAthenaPdfFilename: vi.fn(),
  saveStoryboardImportCandidatePng: vi.fn(),
  getFileUrl: vi.fn(),
  removeStoryboardImageFile: vi.fn(),
}))

const pdfjsMock = vi.hoisted(() => ({
  getDocument: vi.fn(),
  OPS: {
    transform: 1,
    save: 2,
    restore: 3,
    paintJpegXObject: 4,
    paintImageXObject: 5,
    paintXObject: 6,
    paintImageMaskXObject: 7,
  },
}))

vi.mock('@tauri-apps/plugin-fs', () => fsMock)
vi.mock('@/lib/db/repositories/storyboard', () => storyboardRepoMock)
vi.mock('@/lib/files', () => fileMock)
vi.mock('pdfjs-dist', () => pdfjsMock)

import {
  buildAthenaImportReviewRows,
  extractAthenaPanelsFromPdf,
  matchAthenaPanelsToShots,
  orderAthenaAnchorsLeftToRightTopToBottom,
} from '@/lib/storyboard/athena-import'

function makeFakeCanvas() {
  const ctx = { drawImage: vi.fn() }
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => 'data:image/png;base64,AA=='),
  }
}

describe('athena import extraction foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fileMock.assertAthenaPdfFilename.mockImplementation(() => {})
    storyboardRepoMock.createStoryboardImport.mockResolvedValue({ id: 'import-1' })
    storyboardRepoMock.updateStoryboardImport.mockResolvedValue({ id: 'import-1' })
    fileMock.saveStoryboardImportCandidatePng.mockImplementation(async (args: { pageNumber: number; panelIndex: number }) =>
      `storyboards/prod/imports/import-1/candidates/page-${args.pageNumber}-panel-${args.panelIndex}.png`
    )
    fileMock.getFileUrl.mockImplementation(async (key: string) => `file:///app/${key}`)
    fsMock.readFile.mockResolvedValue(new TextEncoder().encode('%PDF-1.7 mock'))
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas() as unknown as HTMLElement
      return originalCreateElement(tag)
    }) as typeof document.createElement)
  })

  it('orders anchors left-to-right, top-to-bottom', () => {
    const ordered = orderAthenaAnchorsLeftToRightTopToBottom([
      { x: 200, y: 500, numberText: '2' },
      { x: 100, y: 500, numberText: '1' },
      { x: 90, y: 300, numberText: '3' },
    ])
    expect(ordered.map((a) => a.numberText)).toEqual(['1', '2', '3'])
  })

  it('fails cleanly for non-pdf bytes', async () => {
    fsMock.readFile.mockResolvedValue(new TextEncoder().encode('NOTPDF'))
    await expect(
      extractAthenaPanelsFromPdf({
        productionId: 'prod',
        sourcePath: '/tmp/bad.pdf',
        sourceFilename: 'bad.pdf',
        sceneId: null,
      })
    ).rejects.toThrow(/valid PDF/i)
  })

  it('extracts ordered candidates and records completed metadata', async () => {
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({
            width: 1000,
            height: 800,
          }),
          getOperatorList: async () => ({
            fnArray: [
              pdfjsMock.OPS.save,
              pdfjsMock.OPS.transform,
              pdfjsMock.OPS.paintImageXObject,
              pdfjsMock.OPS.restore,
              pdfjsMock.OPS.save,
              pdfjsMock.OPS.transform,
              pdfjsMock.OPS.paintImageXObject,
              pdfjsMock.OPS.restore,
            ],
            argsArray: [
              [],
              [120, 0, 0, 80, 120, 700],
              ['img-1'],
              [],
              [],
              [200, 0, 0, 90, 300, 650],
              ['img-2'],
              [],
            ],
          }),
          objs: {
            get: (name: string) =>
              name === 'img-1'
                ? { width: 120, height: 80, bitmap: { width: 120, height: 80 } }
                : { width: 200, height: 90, bitmap: { width: 200, height: 90 } },
          },
        }),
      }),
    })

    const result = await extractAthenaPanelsFromPdf({
      productionId: 'prod',
      sourcePath: '/tmp/good.pdf',
      sourceFilename: 'good.pdf',
      sceneId: null,
    })
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]!.detected_number_text).toBeNull()
    expect(result.candidates[1]!.detected_number_text).toBeNull()
    expect(result.candidates[0]!.bbox.width).toBe(120)
    expect(result.candidates[1]!.bbox.width).toBe(200)
    expect(storyboardRepoMock.updateStoryboardImport).toHaveBeenCalledWith(
      'import-1',
      expect.objectContaining({ status: 'completed' })
    )
  })

  it('handles missing numbers with unknown confidence', async () => {
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({
            width: 900,
            height: 700,
          }),
          getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
          objs: { get: () => null },
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    })

    const result = await extractAthenaPanelsFromPdf({
      productionId: 'prod',
      sourcePath: '/tmp/no-numbers.pdf',
      sourceFilename: 'no-numbers.pdf',
      sceneId: null,
    })
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]!.detected_number_text).toBeNull()
    expect(result.candidates[0]!.number_confidence).toBe('unknown')
  })

  it('fails cleanly for oversized PDFs', async () => {
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 300,
      }),
    })
    await expect(
      extractAthenaPanelsFromPdf({
        productionId: 'prod',
        sourcePath: '/tmp/huge.pdf',
        sourceFilename: 'huge.pdf',
        sceneId: null,
      })
    ).rejects.toThrow(/maximum supported length/i)
  })

  it('cleans up saved candidate files if extraction fails mid-run', async () => {
    let pageCall = 0
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async () => {
          pageCall += 1
          if (pageCall === 2) throw new Error('render exploded')
          return {
            getViewport: () => ({
              width: 1000,
              height: 800,
            }),
            getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
            objs: { get: () => null },
            render: () => ({ promise: Promise.resolve() }),
          }
        },
      }),
    })
    await expect(
      extractAthenaPanelsFromPdf({
        productionId: 'prod',
        sourcePath: '/tmp/partial.pdf',
        sourceFilename: 'partial.pdf',
        sceneId: null,
      })
    ).rejects.toThrow(/render exploded/)
    expect(fileMock.removeStoryboardImageFile).toHaveBeenCalled()
    expect(storyboardRepoMock.updateStoryboardImport).toHaveBeenCalledWith(
      'import-1',
      expect.objectContaining({ status: 'failed' })
    )
  })

  it('matches by exact shot number in scene scope', () => {
    const rows = matchAthenaPanelsToShots({
      selectedSceneId: 'scene-1',
      shots: [
        {
          id: 'shot-1',
          scene_id: 'scene-1',
          shot_number: '1A',
          description: null,
          shot_description: null,
          subject: null,
          action_description: null,
          shot_size: null,
          support: null,
          lens: null,
          duration_seconds: null,
          estimated_shoot_minutes: null,
          camera_movement: null,
          notes: null,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ],
      candidates: [
        {
          id: 'c1',
          source_import_id: 'imp',
          storage_key: 'k',
          preview_url: 'u',
          page_number: 1,
          panel_index: 0,
          global_order: 0,
          detected_number_text: '1A',
          number_confidence: 'text',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    })
    expect(rows[0]!.status).toBe('matched')
    expect(rows[0]!.matched_shot_number).toBe('1A')
    expect(rows[0]!.match_method).toBe('number')
  })

  it('uses reading-order fallback for missing numbers in selected scene', () => {
    const rows = matchAthenaPanelsToShots({
      selectedSceneId: 'scene-1',
      shots: [
        {
          id: 'shot-1',
          scene_id: 'scene-1',
          shot_number: '1',
          description: null,
          shot_description: null,
          subject: null,
          action_description: null,
          shot_size: null,
          support: null,
          lens: null,
          duration_seconds: null,
          estimated_shoot_minutes: null,
          camera_movement: null,
          notes: null,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
        {
          id: 'shot-2',
          scene_id: 'scene-1',
          shot_number: '2',
          description: null,
          shot_description: null,
          subject: null,
          action_description: null,
          shot_size: null,
          support: null,
          lens: null,
          duration_seconds: null,
          estimated_shoot_minutes: null,
          camera_movement: null,
          notes: null,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ],
      candidates: [
        {
          id: 'c1',
          source_import_id: 'imp',
          storage_key: 'k1',
          preview_url: 'u1',
          page_number: 1,
          panel_index: 0,
          global_order: 0,
          detected_number_text: null,
          number_confidence: 'unknown',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: 'c2',
          source_import_id: 'imp',
          storage_key: 'k2',
          preview_url: 'u2',
          page_number: 1,
          panel_index: 1,
          global_order: 1,
          detected_number_text: null,
          number_confidence: 'unknown',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    })
    expect(rows.map((r) => r.matched_shot_number)).toEqual(['1', '2'])
    expect(rows.every((r) => r.match_method === 'reading-order')).toBe(true)
  })

  it('flags duplicate number candidates while retaining them', () => {
    const rows = matchAthenaPanelsToShots({
      selectedSceneId: 'scene-1',
      shots: [
        {
          id: 'shot-1',
          scene_id: 'scene-1',
          shot_number: '7',
          description: null,
          shot_description: null,
          subject: null,
          action_description: null,
          shot_size: null,
          support: null,
          lens: null,
          duration_seconds: null,
          estimated_shoot_minutes: null,
          camera_movement: null,
          notes: null,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ],
      candidates: [
        {
          id: 'c1',
          source_import_id: 'imp',
          storage_key: 'k1',
          preview_url: 'u1',
          page_number: 1,
          panel_index: 0,
          global_order: 0,
          detected_number_text: '7',
          number_confidence: 'text',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: 'c2',
          source_import_id: 'imp',
          storage_key: 'k2',
          preview_url: 'u2',
          page_number: 1,
          panel_index: 1,
          global_order: 1,
          detected_number_text: '7',
          number_confidence: 'text',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    })
    expect(rows[0]!.status).toBe('matched')
    expect(rows[1]!.status).toBe('duplicate')
  })

  it('preserves missing-number and unmatched candidates for review', () => {
    const rows = matchAthenaPanelsToShots({
      selectedSceneId: null,
      shots: [],
      candidates: [
        {
          id: 'c1',
          source_import_id: 'imp',
          storage_key: 'k1',
          preview_url: 'u1',
          page_number: 1,
          panel_index: 0,
          global_order: 0,
          detected_number_text: null,
          number_confidence: 'unknown',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: 'c2',
          source_import_id: 'imp',
          storage_key: 'k2',
          preview_url: 'u2',
          page_number: 1,
          panel_index: 1,
          global_order: 1,
          detected_number_text: '99',
          number_confidence: 'text',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    })
    expect(rows[0]!.status).toBe('missing-number')
    expect(rows[1]!.status).toBe('unmatched')
  })

  it('is scene-scoped and marks ambiguous when matching across scenes', () => {
    const candidates = [
      {
        id: 'c1',
        source_import_id: 'imp',
        storage_key: 'k1',
        preview_url: 'u1',
        page_number: 1,
        panel_index: 0,
        global_order: 0,
        detected_number_text: '1',
        number_confidence: 'text' as const,
        bbox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ]
    const shots = [
      {
        id: 'shot-a',
        scene_id: 'scene-a',
        shot_number: '1',
        description: null,
        shot_description: null,
        subject: null,
        action_description: null,
        shot_size: null,
        support: null,
        lens: null,
        duration_seconds: null,
        estimated_shoot_minutes: null,
        camera_movement: null,
        notes: null,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
      {
        id: 'shot-b',
        scene_id: 'scene-b',
        shot_number: '1',
        description: null,
        shot_description: null,
        subject: null,
        action_description: null,
        shot_size: null,
        support: null,
        lens: null,
        duration_seconds: null,
        estimated_shoot_minutes: null,
        camera_movement: null,
        notes: null,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ]
    const scoped = matchAthenaPanelsToShots({ candidates, shots, selectedSceneId: 'scene-a' })
    expect(scoped[0]!.status).toBe('matched')
    expect(scoped[0]!.matched_shot_id).toBe('shot-a')

    const unscoped = matchAthenaPanelsToShots({ candidates, shots, selectedSceneId: null })
    expect(unscoped[0]!.status).toBe('ambiguous')
  })

  it('builds review rows with manual reassignment and conflict policy', () => {
    const matchRows = [
      {
        candidate: {
          id: 'c1',
          source_import_id: 'imp',
          storage_key: 'k1',
          preview_url: 'u1',
          page_number: 1,
          panel_index: 0,
          global_order: 0,
          detected_number_text: null,
          number_confidence: 'unknown' as const,
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        },
        status: 'missing-number' as const,
        matched_shot_id: null,
        matched_shot_number: null,
        match_method: null,
      },
    ]
    const rows = buildAthenaImportReviewRows({
      matchRows,
      shots: [
        {
          id: 'shot-1',
          scene_id: 'scene-1',
          shot_number: '1A',
          description: null,
          shot_description: null,
          subject: null,
          action_description: null,
          shot_size: null,
          support: null,
          lens: null,
          duration_seconds: null,
          estimated_shoot_minutes: null,
          camera_movement: null,
          notes: null,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ],
      existingImageCountByShotId: new Map([['shot-1', 2]]),
      manualShotIdByCandidateId: new Map([['c1', 'shot-1']]),
      conflictPolicyByCandidateId: new Map([['c1', 'replace']]),
    })
    expect(rows[0]!.matched_shot_id).toBe('shot-1')
    expect(rows[0]!.match_method).toBe('manual')
    expect(rows[0]!.has_existing_images).toBe(true)
    expect(rows[0]!.conflict_policy).toBe('replace')
    expect(rows[0]!.is_ready_to_apply).toBe(true)
  })
})
