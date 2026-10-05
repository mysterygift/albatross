/**
 * iOS file hand-off. iOS has no "Save As" path picker and no "open in default app" for files in the
 * app sandbox, so exports are written to the app's Documents/Exports folder (visible in the Files
 * app under On My iPhone/iPad › Albatross) and then offered through the system share sheet, which covers
 * Quick Look preview, Save to Files, AirDrop, Mail and "Open in…".
 */
import { documentDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, mkdir, readFile } from '@tauri-apps/plugin-fs'
import { toast } from '@/components/ui/sonner'

export const MOBILE_EXPORTS_DIR = 'Exports'

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  json: 'application/json',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  fdx: 'application/xml',
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || 'file'
}

function mimeTypeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

function safeFileName(name: string): string {
  const cleaned = baseName(name).replace(/[\\/:*?"<>|]/g, '-').trim()
  return cleaned.length > 0 ? cleaned : 'export'
}

/** Folder that exports are written to on iOS (absolute path). Created if missing. */
export async function mobileExportsDirectory(): Promise<string> {
  await mkdir(MOBILE_EXPORTS_DIR, { baseDir: BaseDirectory.Document, recursive: true })
  return join(await documentDir(), MOBILE_EXPORTS_DIR)
}

/** Absolute path in the iOS exports folder for a suggested file name (or path; only its name is used). */
export async function mobileExportPath(suggestedName: string): Promise<string> {
  return join(await mobileExportsDirectory(), safeFileName(suggestedName))
}

/**
 * Turns a URL produced by `convertFileSrc` (asset://localhost/…, http(s)://asset.localhost/…) or a
 * file:// URL back into a filesystem path. Returns null for any other URL.
 */
export function localPathFromUrl(url: string): string | null {
  const match = /^(?:asset:\/\/localhost|https?:\/\/asset\.localhost)\/(.*)$/.exec(url)
  if (match) return decodeURIComponent(match[1])
  if (url.startsWith('file://')) return decodeURIComponent(url.slice(7))
  if (url.startsWith('/')) return url
  return null
}

type ShareNavigator = Navigator & {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
}

type ShareFileOptions = {
  /** Shown when the share sheet is unavailable, e.g. "Saved to the Files app". */
  fallbackMessage?: string
}

/**
 * Presents the iOS share sheet for a local file. The share sheet only opens from a user gesture, so
 * when the file took a while to produce (PDF generation, export) and the gesture has expired, a toast
 * with a Share button is shown instead and the sheet opens from that tap.
 */
export async function shareLocalFile(path: string, options: ShareFileOptions = {}): Promise<void> {
  const name = baseName(path)
  const nav = navigator as ShareNavigator
  const fallback = () => {
    if (options.fallbackMessage) toast.success(options.fallbackMessage)
    else toast.error('Sharing is not available on this device.')
  }
  if (typeof nav.share !== 'function') {
    fallback()
    return
  }
  const bytes = await readFile(path)
  const data: ShareData = { files: [new File([bytes as BlobPart], name, { type: mimeTypeFor(name) })] }
  if (nav.canShare && !nav.canShare(data)) {
    fallback()
    return
  }
  const share = nav.share.bind(nav)
  try {
    await share(data)
  } catch (err) {
    const errName = (err as { name?: string } | null)?.name
    if (errName === 'AbortError') return // dismissed by the user
    if (errName === 'NotAllowedError') {
      toast(`"${name}" is ready`, {
        description: options.fallbackMessage,
        duration: 15_000,
        action: { label: 'Share…', onClick: () => void share(data).catch(() => {}) },
      })
      return
    }
    throw err
  }
}

/** The Files app's name for local storage on this device ("On My iPhone" / "On My iPad"). */
function onMyDeviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return /iPhone|iPod/.test(ua) ? 'On My iPhone' : 'On My iPad'
}

/** Shares a file just written to the iOS exports folder, telling the user where it was saved. */
export async function shareMobileExport(path: string): Promise<void> {
  await shareLocalFile(path, {
    fallbackMessage: `Saved "${baseName(path)}" to Files › ${onMyDeviceLabel()} › Albatross › ${MOBILE_EXPORTS_DIR}.`,
  })
}
