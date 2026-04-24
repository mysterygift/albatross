import { readFile } from '@tauri-apps/plugin-fs'
import {
  createStoryboardImport,
  updateStoryboardImport,
} from '@/lib/db/repositories/storyboard'
import type { Shot } from '@/lib/db/types'
import {
  assertAthenaPdfFilename,
  getFileUrl,
  removeStoryboardImageFile,
  saveStoryboardImportCandidatePng,
} from '@/lib/files'

const ATHENA_MAX_IMPORT_PAGES = 250

export type AthenaPanelCandidate = {
  id: string
  source_import_id: string
  storage_key: string
  preview_url: string
  page_number: number
  panel_index: number
  global_order: number
  detected_number_text: string | null
  number_confidence: 'text' | 'unknown'
  bbox: { x: number; y: number; width: number; height: number }
}

export type AthenaPanelMatchStatus =
  | 'matched'
  | 'unmatched'
  | 'duplicate'
  | 'missing-number'
  | 'ambiguous'

export type AthenaPanelMatchRow = {
  candidate: AthenaPanelCandidate
  status: AthenaPanelMatchStatus
  matched_shot_id: string | null
  matched_shot_number: string | null
  match_method: 'number' | 'reading-order' | null
}

export type AthenaImportConflictPolicy = 'skip' | 'replace' | 'add'

export type AthenaImportReviewRow = {
  candidate: AthenaPanelCandidate
  status: AthenaPanelMatchStatus
  matched_shot_id: string | null
  matched_shot_number: string | null
  match_method: 'number' | 'reading-order' | 'manual' | null
  has_existing_images: boolean
  conflict_policy: AthenaImportConflictPolicy
  is_ready_to_apply: boolean
}

type Anchor = {
  x: number
  y: number
  numberText: string
}

type OrderedAnchor = Anchor & { panelIndex: number }

function isNumberLikeText(text: string): boolean {
  return /^\d{1,4}[A-Za-z]?$/.test(text.trim())
}

function normalizeMatchToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function groupAnchorRows(anchors: Anchor[], rowTolerancePx = 48): Anchor[][] {
  const sorted = [...anchors].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Anchor[][] = []
  for (const anchor of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.y - anchor.y) <= rowTolerancePx)
    if (row) row.push(anchor)
    else rows.push([anchor])
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x)
  rows.sort((a, b) => b[0]!.y - a[0]!.y)
  return rows
}

export function orderAthenaAnchorsLeftToRightTopToBottom(anchors: Anchor[]): OrderedAnchor[] {
  const rows = groupAnchorRows(anchors)
  const ordered: OrderedAnchor[] = []
  let i = 0
  for (const row of rows) {
    for (const anchor of row) {
      ordered.push({ ...anchor, panelIndex: i++ })
    }
  }
  return ordered
}

export function matchAthenaPanelsToShots(args: {
  candidates: AthenaPanelCandidate[]
  shots: Shot[]
  selectedSceneId: string | null
}): AthenaPanelMatchRow[] {
  const scopedShots = args.selectedSceneId
    ? args.shots.filter((shot) => shot.scene_id === args.selectedSceneId)
    : args.shots
  const candidates = [...args.candidates].sort((a, b) => a.global_order - b.global_order)

  const shotsByNormalizedNumber = new Map<string, Shot[]>()
  for (const shot of scopedShots) {
    const key = normalizeMatchToken(shot.shot_number)
    const list = shotsByNormalizedNumber.get(key) ?? []
    list.push(shot)
    shotsByNormalizedNumber.set(key, list)
  }

  const occurrencesByNumber = new Map<string, number>()
  for (const candidate of candidates) {
    if (!candidate.detected_number_text) continue
    const key = normalizeMatchToken(candidate.detected_number_text)
    occurrencesByNumber.set(key, (occurrencesByNumber.get(key) ?? 0) + 1)
  }

  const rows: AthenaPanelMatchRow[] = []
  const matchedShotIds = new Set<string>()
  const numberUseCount = new Map<string, number>()
  for (const candidate of candidates) {
    const detected = candidate.detected_number_text?.trim() ?? ''
    if (!detected) {
      rows.push({
        candidate,
        status: 'missing-number',
        matched_shot_id: null,
        matched_shot_number: null,
        match_method: null,
      })
      continue
    }

    const key = normalizeMatchToken(detected)
    const candidateCountForNumber = occurrencesByNumber.get(key) ?? 0
    const matchingShots = shotsByNormalizedNumber.get(key) ?? []
    if (matchingShots.length === 0) {
      rows.push({
        candidate,
        status: 'unmatched',
        matched_shot_id: null,
        matched_shot_number: null,
        match_method: null,
      })
      continue
    }
    if (matchingShots.length > 1) {
      rows.push({
        candidate,
        status: 'ambiguous',
        matched_shot_id: null,
        matched_shot_number: null,
        match_method: null,
      })
      continue
    }

    const usage = (numberUseCount.get(key) ?? 0) + 1
    numberUseCount.set(key, usage)
    const shot = matchingShots[0]!
    if (candidateCountForNumber > 1 && usage > 1) {
      rows.push({
        candidate,
        status: 'duplicate',
        matched_shot_id: shot.id,
        matched_shot_number: shot.shot_number,
        match_method: 'number',
      })
      continue
    }

    rows.push({
      candidate,
      status: 'matched',
      matched_shot_id: shot.id,
      matched_shot_number: shot.shot_number,
      match_method: 'number',
    })
    matchedShotIds.add(shot.id)
  }

  if (args.selectedSceneId) {
    const fallbackQueue = scopedShots.filter((shot) => !matchedShotIds.has(shot.id))
    let fallbackIndex = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (row.status !== 'missing-number') continue
      const shot = fallbackQueue[fallbackIndex]
      if (!shot) continue
      fallbackIndex += 1
      rows[i] = {
        ...row,
        status: 'matched',
        matched_shot_id: shot.id,
        matched_shot_number: shot.shot_number,
        match_method: 'reading-order',
      }
    }
  }

  return rows
}

export function buildAthenaImportReviewRows(args: {
  matchRows: AthenaPanelMatchRow[]
  shots: Shot[]
  existingImageCountByShotId: Map<string, number>
  manualShotIdByCandidateId: Map<string, string>
  conflictPolicyByCandidateId: Map<string, AthenaImportConflictPolicy>
}): AthenaImportReviewRow[] {
  const shotsById = new Map(args.shots.map((shot) => [shot.id, shot]))
  return args.matchRows.map((row) => {
    const manualShotId = args.manualShotIdByCandidateId.get(row.candidate.id) ?? null
    const effectiveShot = manualShotId ? shotsById.get(manualShotId) ?? null : null
    const matchedShotId = effectiveShot?.id ?? row.matched_shot_id
    const matchedShotNumber = effectiveShot?.shot_number ?? row.matched_shot_number
    const matchMethod = effectiveShot ? 'manual' : row.match_method
    const hasExistingImages = matchedShotId
      ? (args.existingImageCountByShotId.get(matchedShotId) ?? 0) > 0
      : false
    const defaultPolicy: AthenaImportConflictPolicy = hasExistingImages ? 'skip' : 'add'
    const policy = args.conflictPolicyByCandidateId.get(row.candidate.id) ?? defaultPolicy
    const effectiveStatus: AthenaPanelMatchStatus = matchedShotId ? 'matched' : row.status
    const isReady = matchedShotId != null && policy !== 'skip'
    return {
      candidate: row.candidate,
      status: effectiveStatus,
      matched_shot_id: matchedShotId,
      matched_shot_number: matchedShotNumber,
      match_method: matchMethod,
      has_existing_images: hasExistingImages,
      conflict_policy: policy,
      is_ready_to_apply: isReady,
    }
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function derivePanelBboxes(
  ordered: OrderedAnchor[],
  canvasWidth: number,
  canvasHeight: number
): Array<{ x: number; y: number; width: number; height: number; numberText: string }> {
  const rows = groupAnchorRows(ordered)
  const rowTops = rows.map((row, index) => {
    const currentY = row[0]!.y
    const prevY = index === 0 ? canvasHeight : rows[index - 1]![0]!.y
    return (prevY + currentY) / 2
  })
  const rowBottoms = rows.map((row, index) => {
    const currentY = row[0]!.y
    const nextY = index === rows.length - 1 ? 0 : rows[index + 1]![0]!.y
    return (currentY + nextY) / 2
  })

  const boxes: Array<{ x: number; y: number; width: number; height: number; numberText: string }> = []
  rows.forEach((row, rowIndex) => {
    row.forEach((anchor, colIndex) => {
      const prevX = colIndex === 0 ? 0 : row[colIndex - 1]!.x
      const nextX = colIndex === row.length - 1 ? canvasWidth : row[colIndex + 1]!.x
      const left = colIndex === 0 ? 0 : (prevX + anchor.x) / 2
      const right = colIndex === row.length - 1 ? canvasWidth : (anchor.x + nextX) / 2
      const top = rowTops[rowIndex]!
      const bottom = rowBottoms[rowIndex]!
      const x = clamp(Math.floor(left), 0, canvasWidth - 1)
      const y = clamp(Math.floor(canvasHeight - top), 0, canvasHeight - 1)
      const width = clamp(Math.ceil(right - left), 1, canvasWidth - x)
      const height = clamp(Math.ceil(top - bottom), 1, canvasHeight - y)
      boxes.push({ x, y, width, height, numberText: anchor.numberText })
    })
  })
  return boxes
}

export async function extractAthenaPanelsFromPdf(args: {
  productionId: string
  sourcePath: string
  sourceFilename: string
  sceneId: string | null
}): Promise<{ importId: string; candidates: AthenaPanelCandidate[] }> {
  // #region agent log
  fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '72cc09' },
    body: JSON.stringify({
      sessionId: '72cc09',
      runId: 'pre-fix',
      hypothesisId: 'H2',
      location: 'src/lib/storyboard/athena-import.ts:extractAthenaPanelsFromPdf:entry',
      message: 'Starting Athena PDF extraction',
      data: {
        productionId: args.productionId,
        sceneId: args.sceneId,
        sourceFilename: args.sourceFilename,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  let stage = 'validate_filename'
  assertAthenaPdfFilename(args.sourceFilename)
  stage = 'read_file'
  const rawBytes = await readFile(args.sourcePath)
  const pdfBytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes)
  const pdfHeader = new TextDecoder().decode(pdfBytes.slice(0, 5))
  // #region agent log
  fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '72cc09' },
    body: JSON.stringify({
      sessionId: '72cc09',
      runId: 'pre-fix',
      hypothesisId: 'H2',
      location: 'src/lib/storyboard/athena-import.ts:extractAthenaPanelsFromPdf:pdfHeader',
      message: 'Read Athena PDF bytes and header',
      data: {
        byteLength: pdfBytes.length,
        header: pdfHeader,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  if (!pdfHeader.startsWith('%PDF-')) {
    throw new Error('Selected file is not a valid PDF.')
  }

  stage = 'create_import_row'
  const importRow = await createStoryboardImport({
    production_id: args.productionId,
    scene_id: args.sceneId,
    source_filename: args.sourceFilename,
    source_type: 'athena_pdf_import',
    status: 'pending',
    metadata_json: JSON.stringify({
      phase: 'extracting',
      source_filename: args.sourceFilename,
    }),
  })

  const createdStorageKeys: string[] = []
  try {
    stage = 'pdfjs_get_document'
    if (typeof document === 'undefined') {
      throw new Error('PDF extraction requires a browser rendering context.')
    }
    if (typeof (globalThis as unknown as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
      ;(globalThis as unknown as { DOMMatrix: new () => unknown }).DOMMatrix = class {}
    }

    const { getDocument } = await import('pdfjs-dist')
    const loadingTask = getDocument({
      data: pdfBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    stage = 'pdfjs_loading_task'
    const pdf = await loadingTask.promise
    // #region agent log
    fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '72cc09' },
      body: JSON.stringify({
        sessionId: '72cc09',
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'src/lib/storyboard/athena-import.ts:extractAthenaPanelsFromPdf:pdfLoaded',
        message: 'PDF loaded successfully',
        data: {
          importId: importRow.id,
          numPages: pdf.numPages,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    if (pdf.numPages > ATHENA_MAX_IMPORT_PAGES) {
      throw new Error(`Athena PDF exceeds maximum supported length (${ATHENA_MAX_IMPORT_PAGES} pages).`)
    }

    const candidates: AthenaPanelCandidate[] = []
    let globalOrder = 0
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create canvas context for PDF extraction.')
      await page.render({ canvasContext: context, viewport }).promise

      const text = await page.getTextContent()
      const anchors: Anchor[] = []
      for (const item of text.items) {
        if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item)) continue
        const str = typeof item.str === 'string' ? item.str.trim() : ''
        if (!isNumberLikeText(str)) continue
        const transform = (item as { transform: number[] }).transform
        const point = viewport.convertToViewportPoint(transform[4] ?? 0, transform[5] ?? 0)
        anchors.push({ x: point[0] ?? 0, y: point[1] ?? 0, numberText: str })
      }

      if (anchors.length === 0) {
        const pngBytes = canvasToPngBytes(canvas)
        const storageKey = await saveStoryboardImportCandidatePng({
          pngBytes,
          productionId: args.productionId,
          sourceImportId: importRow.id,
          pageNumber,
          panelIndex: 0,
        })
        candidates.push({
          id: crypto.randomUUID(),
          source_import_id: importRow.id,
          storage_key: storageKey,
          preview_url: await getFileUrl(storageKey),
          page_number: pageNumber,
          panel_index: 0,
          global_order: globalOrder++,
          detected_number_text: null,
          number_confidence: 'unknown',
          bbox: { x: 0, y: 0, width: canvas.width, height: canvas.height },
        })
        createdStorageKeys.push(storageKey)
        continue
      }

      const orderedAnchors = orderAthenaAnchorsLeftToRightTopToBottom(anchors)
      const panelBboxes = derivePanelBboxes(orderedAnchors, canvas.width, canvas.height)
      for (let panelIndex = 0; panelIndex < panelBboxes.length; panelIndex++) {
        const panel = panelBboxes[panelIndex]!
        const panelCanvas = document.createElement('canvas')
        panelCanvas.width = panel.width
        panelCanvas.height = panel.height
        const panelCtx = panelCanvas.getContext('2d')
        if (!panelCtx) throw new Error('Could not create panel canvas context.')
        panelCtx.drawImage(
          canvas,
          panel.x,
          panel.y,
          panel.width,
          panel.height,
          0,
          0,
          panel.width,
          panel.height
        )
        const pngBytes = canvasToPngBytes(panelCanvas)
        const storageKey = await saveStoryboardImportCandidatePng({
          pngBytes,
          productionId: args.productionId,
          sourceImportId: importRow.id,
          pageNumber,
          panelIndex,
        })
        candidates.push({
          id: crypto.randomUUID(),
          source_import_id: importRow.id,
          storage_key: storageKey,
          preview_url: await getFileUrl(storageKey),
          page_number: pageNumber,
          panel_index: panelIndex,
          global_order: globalOrder++,
          detected_number_text: panel.numberText,
          number_confidence: 'text',
          bbox: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
        })
        createdStorageKeys.push(storageKey)
      }
    }

    await updateStoryboardImport(importRow.id, {
      status: 'completed',
      metadata_json: JSON.stringify({
        source_filename: args.sourceFilename,
        candidate_count: candidates.length,
        candidates: candidates.map((c) => ({
          storage_key: c.storage_key,
          page_number: c.page_number,
          panel_index: c.panel_index,
          global_order: c.global_order,
          detected_number_text: c.detected_number_text,
          number_confidence: c.number_confidence,
          bbox: c.bbox,
        })),
      }),
    })
    // #region agent log
    fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '72cc09' },
      body: JSON.stringify({
        sessionId: '72cc09',
        runId: 'pre-fix',
        hypothesisId: 'H6',
        location: 'src/lib/storyboard/athena-import.ts:extractAthenaPanelsFromPdf:success',
        message: 'Athena extraction completed',
        data: {
          importId: importRow.id,
          candidateCount: candidates.length,
          previewUrlCount: candidates.filter((c) => !!c.preview_url).length,
          firstPreviewUrl: candidates[0]?.preview_url ?? null,
          bboxSummary: {
            uniqueSizes: [...new Set(candidates.map((c) => `${c.bbox.width}x${c.bbox.height}`))],
            minWidth: Math.min(...candidates.map((c) => c.bbox.width)),
            maxWidth: Math.max(...candidates.map((c) => c.bbox.width)),
            minHeight: Math.min(...candidates.map((c) => c.bbox.height)),
            maxHeight: Math.max(...candidates.map((c) => c.bbox.height)),
          },
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return { importId: importRow.id, candidates }
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '72cc09' },
      body: JSON.stringify({
        sessionId: '72cc09',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'src/lib/storyboard/athena-import.ts:extractAthenaPanelsFromPdf:catch',
        message: 'Athena extraction failed',
        data: {
          stage,
          importId: importRow.id,
          createdCandidateCount: createdStorageKeys.length,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    await Promise.all(createdStorageKeys.map((key) => removeStoryboardImageFile(key)))
    await updateStoryboardImport(importRow.id, {
      status: 'failed',
      metadata_json: JSON.stringify({
        source_filename: args.sourceFilename,
        cleaned_candidate_count: createdStorageKeys.length,
        error: error instanceof Error ? error.message : 'Athena PDF extraction failed',
      }),
    })
    throw error
  }
}
