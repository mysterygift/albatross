import { open, save } from '@tauri-apps/plugin-dialog'

/**
 * Ensure the path ends with `.apf` (some save dialogs omit the extension).
 */
export function normalizeApfSavePath(path: string): string {
  const t = path.trim()
  if (!t.toLowerCase().endsWith('.apf')) {
    return `${t}.apf`
  }
  return t
}

/** Safe basename for a suggested export filename (no path separators). */
export function sanitizeProductionExportBasename(name: string): string {
  const s = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
  return s.length > 0 ? s : 'production'
}

/**
 * Native save dialog for `.apf`. Returns absolute path or null if cancelled.
 */
export async function pickApfSavePath(suggestedProductionName: string): Promise<string | null> {
  const base = sanitizeProductionExportBasename(suggestedProductionName)
  const defaultPath = `${base}.apf`
  const selected = await save({
    title: 'Export project',
    defaultPath,
    filters: [{ name: 'Albatross Project File', extensions: ['apf'] }],
  })
  if (selected == null) return null
  return normalizeApfSavePath(selected)
}

/**
 * Native open dialog for `.apf`. Returns absolute path or null if cancelled.
 */
export async function pickApfFileForImport(): Promise<string | null> {
  const selected = await open({
    title: 'Import project',
    multiple: false,
    directory: false,
    filters: [{ name: 'Albatross Project File', extensions: ['apf'] }],
  })
  if (selected == null) return null
  if (Array.isArray(selected)) return selected[0] ?? null
  if (typeof selected === 'string') return selected
  return null
}

/**
 * Native open dialog for CSV equipment import. Returns absolute path or null if cancelled.
 */
export async function pickCsvFileForImport(): Promise<string | null> {
  const selected = await open({
    title: 'Import equipment CSV',
    multiple: false,
    directory: false,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (selected == null) return null
  if (Array.isArray(selected)) return selected[0] ?? null
  if (typeof selected === 'string') return selected
  return null
}
