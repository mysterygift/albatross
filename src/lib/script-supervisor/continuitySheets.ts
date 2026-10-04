/**
 * Continuity sheets and the editor's log (SS9). Pure: builds the data for one shoot day from its slates,
 * takes, script notes and photo counts. `pdf/continuitySheets.ts` lays the sheets out; the editor's log is CSV.
 */
import type { Slate, SlateShotType, SlateSoundMode, Take } from '@/lib/db/types'
import { ANNOTATION_KIND_LABEL, CONTINUITY_TAG_LABEL, parseContinuityTags, type AnnotationView } from './annotations'
import { NG_REASON_LABEL, TAKE_STATUS_LABEL, formatDuration } from './slatePanel'

export const SHOT_TYPE_LABEL: Record<SlateShotType, string> = {
  master: 'Master / wide',
  single: 'Single',
  multiple: 'Multiple',
  insert: 'Insert / cutaway',
  other: 'Other',
}

export const SOUND_MODE_LABEL: Record<SlateSoundMode, string> = {
  sync: 'Sync',
  mute: 'Mute',
  wild_track: 'Wild track',
}

/** A script note with the line it sits on (dialogue as 'CHARACTER: line'). */
export type SheetNote = AnnotationView & { excerpt: string | null }

export type ContinuitySlateInput = {
  slate: Slate
  label: string
  sceneNumber: string | null
  takes: Take[]
  notes: SheetNote[]
  photos: Array<{ takeNumber: number | null; tags: string | null }>
}

export type ContinuityDayInput = {
  productionName: string
  shootDate: string
  dayNumber: number | null
  totalShootDays: number | null
  scriptSupervisorName?: string | null
  slates: ContinuitySlateInput[]
}

export type ContinuityTakeRow = { take: string; duration: string; status: string; ngReason: string; remarks: string }

export type ContinuitySheet = {
  slateId: string
  heading: string
  subheading: string | null
  fields: Array<{ label: string; value: string }>
  takes: ContinuityTakeRow[]
  printed: string
  scriptNotes: Array<{ line: string | null; text: string }>
  slateNotes: string | null
  photos: string
}

export type ContinuitySheetsData = {
  productionName: string
  heading: string
  dateLabel: string
  scriptSupervisorName: string | null
  sheets: ContinuitySheet[]
}

const DASH = '—'

function value(v: string | null | undefined): string {
  const s = (v ?? '').trim()
  return s || DASH
}

function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Note text without the slate (the sheet is already per slate): 'T3 · Ad-lib: + "Nobody ever does."'. */
function noteText(n: Pick<AnnotationView, 'kind' | 'text' | 'takeNumbers'>): string {
  const takes = n.takeNumbers.length > 0 ? `T${[...n.takeNumbers].sort((a, b) => a - b).join(',')} · ` : ''
  return `${takes}${ANNOTATION_KIND_LABEL[n.kind]}: ${n.text}`
}

function photoSummary(photos: ContinuitySlateInput['photos']): string {
  if (photos.length === 0) return 'None'
  const tags = new Set<string>()
  for (const p of photos) for (const t of parseContinuityTags(p.tags)) tags.add(CONTINUITY_TAG_LABEL[t])
  const count = `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`
  return tags.size > 0 ? `${count} (${[...tags].join(', ')})` : count
}

function dayHeading(input: Pick<ContinuityDayInput, 'dayNumber' | 'totalShootDays'>, title: string): string {
  if (input.dayNumber == null) return title
  return `${title} · Day ${input.dayNumber}${input.totalShootDays ? ` of ${input.totalShootDays}` : ''}`
}

/** One sheet per slate, in shot order. */
export function buildContinuitySheets(input: ContinuityDayInput): ContinuitySheetsData {
  const slates = [...input.slates].sort(
    (a, b) => a.slate.created_at.localeCompare(b.slate.created_at) || a.slate.slate_number - b.slate.slate_number
  )
  const sheets = slates.map((s): ContinuitySheet => {
    const sl = s.slate
    const takes = [...s.takes].sort((a, b) => a.take_number - b.take_number)
    const prints = takes.filter((t) => t.status === 'print').map((t) => t.take_number)
    const sub = [sl.shot_code, sl.description].map((x) => (x ?? '').trim()).filter(Boolean).join(' ')
    return {
      slateId: sl.id,
      heading: `Slate ${s.label}${s.sceneNumber ? ` · Sc ${s.sceneNumber}` : ''}`,
      subheading: sub || null,
      fields: [
        { label: 'Shot type', value: sl.shot_type ? SHOT_TYPE_LABEL[sl.shot_type] : DASH },
        { label: 'Camera', value: value(sl.camera) },
        { label: 'Lens', value: value(sl.lens) },
        { label: 'Stop', value: value(sl.stop) },
        { label: 'Filter', value: value(sl.filter) },
        { label: 'Sound', value: SOUND_MODE_LABEL[sl.sound_mode] },
        { label: 'Int / Ext', value: value(sl.int_ext) },
        { label: 'Day / Night', value: value(sl.day_night) },
        { label: 'Camera roll', value: value(sl.camera_roll) },
        { label: 'Sound roll', value: value(sl.sound_roll) },
      ],
      takes: takes.map((t) => ({
        take: String(t.take_number),
        duration: formatDuration(t.duration_ms),
        status: TAKE_STATUS_LABEL[t.status],
        ngReason: t.status === 'ng' && t.ng_reason ? NG_REASON_LABEL[t.ng_reason] : '',
        remarks: [t.end_board ? 'End board' : null, t.remarks?.trim() || null].filter(Boolean).join('. '),
      })),
      printed: takes.length === 0 ? 'No takes' : prints.length > 0 ? `Print ${prints.join(', ')}` : 'No takes printed',
      scriptNotes: [...s.notes]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((n) => ({ line: n.excerpt ? shorten(n.excerpt, 70) : null, text: noteText(n) })),
      slateNotes: sl.notes?.trim() || null,
      photos: photoSummary(s.photos),
    }
  })
  return {
    productionName: input.productionName,
    heading: dayHeading(input, 'Continuity sheets'),
    dateLabel: input.shootDate,
    scriptSupervisorName: input.scriptSupervisorName?.trim() || null,
    sheets,
  }
}

export function continuitySheetsFileName(dayNumber: number | null, shootDate: string): string {
  return `continuity-sheets-${dayNumber != null ? `day-${dayNumber}-` : ''}${shootDate}.pdf`
}

// ─── Editor's log ────────────────────────────────────────────────────────────

export const EDITORS_LOG_HEADERS = [
  'Date',
  'Day',
  'Slate',
  'Scene',
  'Take',
  'Status',
  'NG reason',
  'Duration',
  'End board',
  'Shot type',
  'Shot',
  'Description',
  'Camera',
  'Lens',
  'Stop',
  'Filter',
  'Sound',
  'Camera roll',
  'Sound roll',
  'Take remarks',
  'Script notes',
  'Slate notes',
] as const

/**
 * Quotes a field when needed and defuses spreadsheet formulas: an ad-lib written '+ "Nobody ever does."' would
 * otherwise be read as a formula, so cells starting with = + - @ get a leading apostrophe.
 */
export function csvField(raw: string): string {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function notesForTake(notes: readonly SheetNote[], takeId: string | null): string {
  return notes
    .filter((n) => n.takeIds.length === 0 || (takeId != null && n.takeIds.includes(takeId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((n) => {
      const line = n.excerpt ? ` (${shorten(n.excerpt, 40)})` : ''
      return `${ANNOTATION_KIND_LABEL[n.kind]}: ${n.text.replace(/\s+/g, ' ').trim()}${line}`
    })
    .join(' | ')
}

/**
 * One row per take (a slate without takes gets one row), in shot order. Script notes on a row are those for that
 * take plus notes for the whole slate. Starts with a UTF-8 BOM so Excel reads curly quotes correctly.
 */
export function buildEditorsLogCsv(input: ContinuityDayInput): string {
  const slates = [...input.slates].sort(
    (a, b) => a.slate.created_at.localeCompare(b.slate.created_at) || a.slate.slate_number - b.slate.slate_number
  )
  const rows: string[][] = []
  for (const s of slates) {
    const sl = s.slate
    const base = (take: Take | null): string[] => [
      input.shootDate,
      input.dayNumber != null ? String(input.dayNumber) : '',
      s.label,
      s.sceneNumber ?? '',
      take ? String(take.take_number) : '',
      take ? TAKE_STATUS_LABEL[take.status] : '',
      take && take.status === 'ng' && take.ng_reason ? NG_REASON_LABEL[take.ng_reason] : '',
      take && take.duration_ms != null ? formatDuration(take.duration_ms) : '',
      take?.end_board ? 'Yes' : '',
      sl.shot_type ? SHOT_TYPE_LABEL[sl.shot_type] : '',
      sl.shot_code ?? '',
      sl.description ?? '',
      sl.camera ?? '',
      sl.lens ?? '',
      sl.stop ?? '',
      sl.filter ?? '',
      SOUND_MODE_LABEL[sl.sound_mode],
      sl.camera_roll ?? '',
      sl.sound_roll ?? '',
      take?.remarks ?? '',
      notesForTake(s.notes, take?.id ?? null),
      sl.notes ?? '',
    ]
    const takes = [...s.takes].sort((a, b) => a.take_number - b.take_number)
    if (takes.length === 0) rows.push(base(null))
    else for (const t of takes) rows.push(base(t))
  }
  const lines = [EDITORS_LOG_HEADERS.join(','), ...rows.map((r) => r.map(csvField).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}

export function editorsLogFileName(dayNumber: number | null, shootDate: string): string {
  return `editors-log-${dayNumber != null ? `day-${dayNumber}-` : ''}${shootDate}.csv`
}
