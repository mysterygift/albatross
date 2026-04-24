/**
 * Attachments: pick file via dialog, copy into app data directory, return path.
 * Open file in OS default app via Tauri opener (local paths) or shell (URLs).
 * Save file via native save dialog (user chooses location).
 */
import { appDataDir } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { BaseDirectory, copyFile, mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { openPath as openerOpenPath } from '@tauri-apps/plugin-opener'
import { open as shellOpen } from '@tauri-apps/plugin-shell'

const ATTACHMENTS_DIR = 'attachments'

/** Get the app data directory path for attachments (for storing in DB). */
export async function getAttachmentsDir(): Promise<string> {
  const base = await appDataDir()
  return `${base}/${ATTACHMENTS_DIR}`
}

/** Resolve a path relative to AppData (e.g. attachments/uuid-filename). */
export async function resolveAppDataPath(relativePath: string): Promise<string> {
  const base = await appDataDir()
  return `${base}/${relativePath}`
}

/**
 * Open a file picker and copy the selected file into app data/attachments.
 * Returns the relative path (for DB) and the chosen file name.
 */
export async function pickAndSaveAttachment(
  suggestedName?: string
): Promise<{ relativePath: string; fileName: string } | null> {
  const selected = await open({
    multiple: false,
    directory: false,
  })
  if (typeof selected !== 'string' || !selected) return null

  await mkdir(ATTACHMENTS_DIR, { baseDir: BaseDirectory.AppData, recursive: true })

  const fileName = suggestedName ?? selected.split(/[/\\]/).pop() ?? `file-${Date.now()}`
  const ext = selected.split('.').pop() ?? ''
  const baseName = fileName.replace(/\.[^.]+$/, '') || fileName
  const uniqueName = `${baseName}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  const relativePath = `${ATTACHMENTS_DIR}/${uniqueName}`

  await copyFile(selected, relativePath, { toPathBaseDir: BaseDirectory.AppData })
  return { relativePath, fileName: uniqueName }
}

/** Open a file or URL in the OS default application. Uses opener for file:// paths (shell does not allow file:// by default). */
export async function openInSystem(pathOrUrl: string): Promise<void> {
  if (pathOrUrl.startsWith('file://')) {
    const path = pathOrUrl.slice(7)
    await openerOpenPath(decodeURIComponent(path))
    return
  }
  await shellOpen(pathOrUrl)
}

export interface SaveFileDialogOptions {
  /** Suggested file path (directory + filename). */
  defaultPath?: string
  /** File type filters, e.g. [{ name: 'PDF', extensions: ['pdf'] }]. */
  filters?: { name: string; extensions: string[] }[]
  /** Dialog window title (desktop). */
  title?: string
}

/**
 * Show native "Save As" dialog and write content to the chosen path.
 * The selected path is added to the fs scope by the dialog plugin.
 * @returns The chosen path if saved, null if cancelled.
 */
export async function saveFileWithDialog(
  options: SaveFileDialogOptions,
  data: Uint8Array | string,
  isText = false
): Promise<string | null> {
  const selected = await save({
    defaultPath: options.defaultPath,
    filters: options.filters,
    title: options.title,
  })
  if (selected == null) return null
  if (isText && typeof data === 'string') {
    await writeTextFile(selected, data)
  } else {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    await writeFile(selected, bytes)
  }
  return selected
}

/** Get a file URL for a path stored in DB (relative to AppData). */
export async function getFileUrl(relativePath: string): Promise<string> {
  const full = await resolveAppDataPath(relativePath)
  const decodedPath = full.startsWith('file://') ? decodeURIComponent(full.slice(7)) : full
  const url = convertFileSrc(decodedPath)
  if (relativePath.startsWith('storyboards/')) {
    // #region agent log
    fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '72cc09' },
      body: JSON.stringify({
        sessionId: '72cc09',
        runId: 'pre-fix',
        hypothesisId: 'H11',
        location: 'src/lib/files/index.ts:getFileUrl',
        message: 'Generated storyboard file URL',
        data: {
          relativePath,
          url,
          hasWhitespace: /\s/.test(url),
          usesConvertFileSrc: true,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }
  return url
}

export {
  normalizeApfSavePath,
  pickApfFileForImport,
  pickApfSavePath,
  sanitizeProductionExportBasename,
} from '@/lib/files/apfProjectDialogs'

export {
  assertAthenaPdfFilename,
  buildStoryboardImportCandidateStorageKey,
  buildStoryboardImageStorageKey,
  createStoryboardImageObjectUrl,
  pickAthenaGalleryPdfForImport,
  pickStoryboardImageForManualImport,
  removeStoryboardImageFile,
  resolveStoryboardImagePath,
  saveStoryboardImportCandidatePng,
  saveStoryboardImageFromLocalPath,
  type PickedStoryboardPdf,
  type PickedStoryboardImage,
  type StoryboardSourceType,
} from '@/lib/files/storyboard'
