import { open } from '@tauri-apps/plugin-dialog'
import { BaseDirectory, copyFile, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs'
import { resolveAppDataPath } from './index'

const STORYBOARD_ROOT = 'storyboards'

export type StoryboardSourceType = 'manual' | 'athena_pdf_import'
export type PickedStoryboardImage = {
  sourcePath: string
  originalFilename: string
  mimeType: string
}

export type PickedStoryboardPdf = {
  sourcePath: string
  originalFilename: string
  mimeType: 'application/pdf'
}

function sanitizeSegment(input: string): string {
  const cleaned = input.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return cleaned.replace(/^-+|-+$/g, '') || 'file'
}

function extractFileExtension(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/)
  return match ? `.${match[1]!.toLowerCase()}` : ''
}

function mimeTypeFromFileName(fileName: string): string | null {
  const ext = extractFileExtension(fileName)
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff'
  if (ext === '.heic') return 'image/heic'
  if (ext === '.heif') return 'image/heif'
  return null
}

function fileNameHasPdfExtension(fileName: string): boolean {
  return extractFileExtension(fileName) === '.pdf'
}

export function assertAthenaPdfFilename(fileName: string): void {
  if (!fileNameHasPdfExtension(fileName)) {
    throw new Error('Please select a PDF file.')
  }
}

export async function pickStoryboardImageForManualImport(): Promise<PickedStoryboardImage | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif'],
      },
    ],
  })
  if (typeof selected !== 'string' || !selected) return null
  const originalFilename = selected.split(/[/\\]/).pop() ?? `storyboard-${Date.now()}.jpg`
  const mimeType = mimeTypeFromFileName(originalFilename)
  if (!mimeType) throw new Error('Unsupported file type. Please select an image.')
  return { sourcePath: selected, originalFilename, mimeType }
}

export async function pickAthenaGalleryPdfForImport(): Promise<PickedStoryboardPdf | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (typeof selected !== 'string' || !selected) return null
  const originalFilename = selected.split(/[/\\]/).pop() ?? `storyboard-${Date.now()}.pdf`
  assertAthenaPdfFilename(originalFilename)
  return { sourcePath: selected, originalFilename, mimeType: 'application/pdf' }
}

export function buildStoryboardImageStorageKey(args: {
  productionId: string
  shotId: string
  sourceType: StoryboardSourceType
  originalFilename: string
}): string {
  const safeBaseName = sanitizeSegment(args.originalFilename.replace(/\.[^.]+$/, ''))
  const ext = extractFileExtension(args.originalFilename)
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${STORYBOARD_ROOT}/${args.productionId}/shots/${args.shotId}/${args.sourceType}/${token}-${safeBaseName}${ext}`
}

export function buildStoryboardImportCandidateStorageKey(args: {
  productionId: string
  sourceImportId: string
  pageNumber: number
  panelIndex: number
}): string {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  return `${STORYBOARD_ROOT}/${args.productionId}/imports/${args.sourceImportId}/candidates/page-${String(args.pageNumber).padStart(3, '0')}-panel-${String(args.panelIndex).padStart(4, '0')}-${token}.png`
}

export async function saveStoryboardImageFromLocalPath(args: {
  sourcePath: string
  productionId: string
  shotId: string
  sourceType: StoryboardSourceType
  originalFilename: string
}): Promise<{ storageKey: string; originalFilename: string }> {
  const storageKey = buildStoryboardImageStorageKey({
    productionId: args.productionId,
    shotId: args.shotId,
    sourceType: args.sourceType,
    originalFilename: args.originalFilename,
  })
  const directory = storageKey.split('/').slice(0, -1).join('/')
  await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true })
  await copyFile(args.sourcePath, storageKey, { toPathBaseDir: BaseDirectory.AppData })
  return {
    storageKey,
    originalFilename: args.originalFilename,
  }
}

export async function resolveStoryboardImagePath(storageKey: string): Promise<string> {
  return resolveAppDataPath(storageKey)
}

export async function removeStoryboardImageFile(storageKey: string): Promise<void> {
  try {
    await remove(storageKey, { baseDir: BaseDirectory.AppData })
  } catch {
    // Missing file should not block archive/delete operations.
  }
}

export async function saveStoryboardImportCandidatePng(args: {
  pngBytes: Uint8Array
  productionId: string
  sourceImportId: string
  pageNumber: number
  panelIndex: number
}): Promise<string> {
  const storageKey = buildStoryboardImportCandidateStorageKey({
    productionId: args.productionId,
    sourceImportId: args.sourceImportId,
    pageNumber: args.pageNumber,
    panelIndex: args.panelIndex,
  })
  const directory = storageKey.split('/').slice(0, -1).join('/')
  await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true })
  await writeFile(storageKey, args.pngBytes, { baseDir: BaseDirectory.AppData })
  return storageKey
}

function mimeTypeForStoryboardStorageKey(storageKey: string): string {
  const lower = storageKey.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

export async function createStoryboardImageObjectUrl(
  storageKey: string,
  mimeType?: string | null
): Promise<string> {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return resolveStoryboardImagePath(storageKey)
  }
  const bytes = await readFile(storageKey, { baseDir: BaseDirectory.AppData })
  const blob = new Blob([bytes], { type: mimeType ?? mimeTypeForStoryboardStorageKey(storageKey) })
  return URL.createObjectURL(blob)
}
