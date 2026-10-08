/**
 * Personalised day packs on disk: each selected document is rendered once, then a copy watermarked
 * with the recipient's name is written for every recipient under
 * `AppData/day-packs/<productionId>/<date>-<unit>/<person>/`. The `<date>-<unit>` folder is
 * cleared first, so a pack never mixes old and new copies. Nothing is added to Documents.
 */
import { BaseDirectory, exists, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'
import type { DayRecipient } from '@/lib/call-sheets/recipients'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'
import type { DayPackBaseFile, DayPackContext, DayPackSource } from './loadDayPackSources'

export const DAY_PACK_ROOT = 'day-packs'

export type DayPackFileIo = {
  exists: (path: string) => Promise<boolean>
  removeDir: (path: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>
}

/** Tauri fs under AppData. */
export const appDataDayPackIo: DayPackFileIo = {
  exists: (path) => exists(path, { baseDir: BaseDirectory.AppData }),
  removeDir: (path) => remove(path, { baseDir: BaseDirectory.AppData, recursive: true }),
  mkdir: (path) => mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true }),
  writeFile: (path, bytes) => writeFile(path, bytes, { baseDir: BaseDirectory.AppData }),
}

export type DayPackPersonFiles = {
  recipient: DayRecipient
  /** Relative to AppData. */
  folder: string
  files: Array<{ fileName: string; path: string }>
}

export type DayPackBuildResult = {
  /** Relative to AppData: `day-packs/<productionId>/<date>-<unit>`. */
  folder: string
  people: DayPackPersonFiles[]
}

/** `day-packs/<productionId>/<date>-<unit>`. */
export function dayPackFolder(context: Pick<DayPackContext, 'productionId' | 'shootDate' | 'unitName'>): string {
  return [
    DAY_PACK_ROOT,
    sanitizeForFilename(context.productionId),
    `${sanitizeForFilename(context.shootDate)}-${sanitizeForFilename(context.unitName)}`,
  ].join('/')
}

/** `call-sheet-2026-10-14-main-unit-ada-lovelace.pdf` (exact form follows `sanitizeForFilename`). */
export function dayPackFileName(stem: string, context: Pick<DayPackContext, 'shootDate' | 'unitName'>, fullName: string): string {
  return `${[stem, context.shootDate, context.unitName, fullName].map(sanitizeForFilename).join('-')}.pdf`
}

/** One folder name per recipient; people who share a name are told apart by their id. */
export function personFolderNames(recipients: DayRecipient[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const r of recipients) {
    const base = sanitizeForFilename(r.fullName)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  return new Map(
    recipients.map((r) => {
      const base = sanitizeForFilename(r.fullName)
      return [r.id, (counts.get(base) ?? 0) > 1 ? `${base}-${r.personId.slice(0, 8)}` : base]
    })
  )
}

export async function buildDayPackFiles(args: {
  context: DayPackContext
  /** The documents ticked for sending. */
  sources: DayPackSource[]
  recipients: DayRecipient[]
  /** Called before each step; `phase` says whether documents are rendering or copies are being written. */
  onProgress?: (progress: { phase: 'render' | 'write'; done: number; total: number }) => void
  io?: DayPackFileIo
}): Promise<DayPackBuildResult> {
  const io = args.io ?? appDataDayPackIo
  const { context, sources, recipients, onProgress } = args

  const base: DayPackBaseFile[] = []
  for (let i = 0; i < sources.length; i++) {
    onProgress?.({ phase: 'render', done: i, total: sources.length })
    base.push(...(await sources[i]!.render()))
  }
  if (base.length === 0) throw new Error('None of the selected documents has anything to send.')

  const folder = dayPackFolder(context)
  if (await io.exists(folder)) await io.removeDir(folder)
  await io.mkdir(folder)

  const folderNames = personFolderNames(recipients)
  const total = recipients.length * base.length
  let done = 0
  const people: DayPackPersonFiles[] = []
  for (const recipient of recipients) {
    const personFolder = `${folder}/${folderNames.get(recipient.id)!}`
    await io.mkdir(personFolder)
    const files: DayPackPersonFiles['files'] = []
    for (const file of base) {
      onProgress?.({ phase: 'write', done, total })
      const fileName = dayPackFileName(file.stem, context, recipient.fullName)
      const path = `${personFolder}/${fileName}`
      await io.writeFile(
        path,
        await applyRecipientNameWatermarkToPDF(file.bytes, { recipientFullName: recipient.fullName })
      )
      files.push({ fileName, path })
      done += 1
    }
    people.push({ recipient, folder: personFolder, files })
  }
  onProgress?.({ phase: 'write', done: total, total })
  return { folder, people }
}
