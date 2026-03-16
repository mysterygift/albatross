import { open } from '@tauri-apps/plugin-dialog'
import { readDir, writeFile } from '@tauri-apps/plugin-fs'

/**
 * Prompt the user to select a target directory for batch export.
 * Returns the absolute directory path, or null if the user cancels.
 */
export async function pickExportDirectory(title = 'Select export directory'): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
    title,
  })
  if (typeof selected !== 'string' || !selected) return null
  return selected
}

const normalizeDirectory = (directory: string) => directory.replace(/[/\\]+$/, '')

/**
 * Returns a filename that does not already exist in the directory, appending a numeric suffix
 * (-2, -3, …) before the extension when necessary. Also considers names already claimed in
 * the current batch (pass existingNamesFromBatch so multiple recipients that sanitize to the
 * same base name get unique filenames).
 *
 * Example: "call-sheet-2026-06-14-main-unit-jane-smith.pdf" →
 *   "call-sheet-2026-06-14-main-unit-jane-smith-2.pdf" if the base already exists.
 */
export async function ensureUniqueFilenameInDirectory(
  directory: string,
  desiredFileName: string,
  existingNamesFromBatch?: Set<string>,
): Promise<string> {
  const dir = normalizeDirectory(directory)
  const existingOnDisk = new Set<string>()
  try {
    const entries = await readDir(dir)
    for (const e of entries) if (!e.isDirectory) existingOnDisk.add(e.name)
  } catch {
    // Directory may be empty or newly created; treat as no existing files
  }
  const taken = new Set<string>([...existingOnDisk, ...(existingNamesFromBatch ?? [])])
  if (!taken.has(desiredFileName)) return desiredFileName
  const lastDot = desiredFileName.lastIndexOf('.')
  const base = lastDot > 0 ? desiredFileName.slice(0, lastDot) : desiredFileName
  const ext = lastDot > 0 ? desiredFileName.slice(lastDot) : ''
  let n = 2
  while (taken.has(`${base}-${n}${ext}`)) n += 1
  return `${base}-${n}${ext}`
}

/**
 * Write a binary file into a user-selected directory.
 * Assumes the directory path came from a dialog plugin call (already in fs scope).
 */
export async function writeFileInDirectory(directory: string, fileName: string, data: Uint8Array): Promise<string> {
  const normalizedDir = normalizeDirectory(directory)
  const fullPath = `${normalizedDir}/${fileName}`
  await writeFile(fullPath, data)
  return fullPath
}

