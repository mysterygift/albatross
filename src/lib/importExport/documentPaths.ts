import { APF_DOCUMENTS_FILES_PREFIX, APF_STORYBOARD_FILES_PREFIX } from '@/lib/importExport/constants'
import { getManifestFilesPrefix, type ApfManifestV1 } from '@/lib/importExport/manifest'

/**
 * Safe single-segment basename for use inside the zip (not a full host path).
 * Strips path separators and NUL; limits length. Empty input becomes `file`.
 */
export function apfSanitizeDocumentBasename(fileName: string): string {
  const base = fileName
    .replace(/[/\\]/g, '_')
    .replace(/\0/g, '')
    .trim()
    .slice(0, 200)
  return base.length > 0 ? base : 'file'
}

/**
 * Canonical zip entry path for a bundled `documents` row:
 * `files/documents/{documentId}/{safeFileName}` (forward slashes).
 * Collision-safe: one directory per document UUID.
 */
export function apfDocumentBundledZipPath(documentId: string, fileName: string): string {
  return `${APF_DOCUMENTS_FILES_PREFIX}${documentId}/${apfSanitizeDocumentBasename(fileName)}`
}

/**
 * Bundled document path inside the zip using manifest `filesPrefix` (default `files/`).
 * Matches export when `filesPrefix` is default; required for non-default prefixes.
 */
export function apfDocumentBundledZipPathForManifest(
  manifest: ApfManifestV1,
  documentId: string,
  fileName: string
): string {
  const prefix = getManifestFilesPrefix(manifest)
  return `${prefix}documents/${documentId}/${apfSanitizeDocumentBasename(fileName)}`
}

/**
 * Canonical zip entry path for a bundled `storyboard_images` row:
 * `files/storyboards/{imageId}/{safeFileName}` (forward slashes). One directory per image UUID.
 */
export function apfStoryboardBundledZipPath(imageId: string, fileName: string): string {
  return `${APF_STORYBOARD_FILES_PREFIX}${imageId}/${apfSanitizeDocumentBasename(fileName)}`
}

/** Bundled storyboard image path inside the zip using manifest `filesPrefix` (default `files/`). */
export function apfStoryboardBundledZipPathForManifest(
  manifest: ApfManifestV1,
  imageId: string,
  fileName: string
): string {
  const prefix = getManifestFilesPrefix(manifest)
  return `${prefix}storyboards/${imageId}/${apfSanitizeDocumentBasename(fileName)}`
}
