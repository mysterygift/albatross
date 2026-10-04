import { describe, expect, it } from 'vitest'

import type { Slate, Take } from '@/lib/db/types'
import {
  EDITORS_LOG_HEADERS,
  buildContinuitySheets,
  buildEditorsLogCsv,
  continuitySheetsFileName,
  csvField,
  editorsLogFileName,
  type ContinuityDayInput,
  type SheetNote,
} from './continuitySheets'

const slate = (over: Partial<Slate>): Slate => ({
  id: 'sl', production_id: 'p', slating_system: 'uk', shoot_day_id: 'd', unit_id: null, scene_id: 'sc23', shot_id: null,
  slate_prefix: '', slate_number: 217, shot_type: 'single', shot_code: 'MS', description: 'Elena', camera: 'A', lens: '50mm',
  stop: 'T2.8', filter: null, sound_mode: 'sync', int_ext: 'INT', day_night: 'NIGHT', camera_roll: 'A014', sound_roll: 'S007',
  notes: null, created_at: '2026-10-07T10:00', updated_at: 't', deleted_at: null, ...over,
})

const take = (n: number, over: Partial<Take> = {}): Take => ({
  id: `t${n}`, slate_id: 'sl', take_number: n, status: 'pending', ng_reason: null, duration_ms: null, end_board: 0, remarks: null,
  created_at: 't', updated_at: 't', deleted_at: null, ...over,
})

const note = (over: Partial<SheetNote>): SheetNote => ({
  id: 'a', elementId: 'e2', kind: 'ad_lib', text: '+ “Nobody ever does.”', slateId: 'sl', slateLabel: '217', takeIds: ['t3'],
  takeNumbers: [3], createdAt: '2026-10-07T10:05', excerpt: 'ELENA: There is no cutaway.', ...over,
})

function day(over: Partial<ContinuityDayInput> = {}): ContinuityDayInput {
  return {
    productionName: 'The Pier',
    shootDate: '2026-10-07',
    dayNumber: 14,
    totalShootDays: 32,
    slates: [
      {
        slate: slate({ id: 'sl2', slate_number: 218, created_at: '2026-10-07T11:00', shot_type: null, shot_code: null, description: null, sound_mode: 'wild_track', notes: 'Room tone, 30s' }),
        label: '218',
        sceneNumber: '23',
        takes: [],
        notes: [],
        photos: [],
      },
      {
        slate: slate({}),
        label: '217',
        sceneNumber: '23',
        takes: [
          take(3, { status: 'print', duration_ms: 95_000, remarks: 'Best for performance' }),
          take(1, { status: 'ng', ng_reason: 'focus', duration_ms: 12_000 }),
          take(2, { status: 'hold', end_board: 1 }),
        ],
        notes: [note({}), note({ id: 'b', kind: 'note', text: 'Use the pause', takeIds: [], takeNumbers: [], createdAt: '2026-10-07T10:01', excerpt: null })],
        photos: [{ takeNumber: 3, tags: 'wardrobe,props' }, { takeNumber: null, tags: 'props' }],
      },
    ],
    ...over,
  }
}

describe('continuity sheets (SS9)', () => {
  it('builds one sheet per slate in shot order with fields, takes, notes and photos', () => {
    const data = buildContinuitySheets(day())
    expect(data.heading).toBe('Continuity sheets · Day 14 of 32')
    expect(data.sheets.map((s) => s.heading)).toEqual(['Slate 217 · Sc 23', 'Slate 218 · Sc 23'])
    const [s217, s218] = data.sheets
    expect(s217!.subheading).toBe('MS Elena')
    expect(s217!.printed).toBe('Print 3')
    expect(s217!.fields.find((f) => f.label === 'Lens')!.value).toBe('50mm')
    expect(s217!.fields.find((f) => f.label === 'Filter')!.value).toBe('—')
    expect(s217!.takes).toEqual([
      { take: '1', duration: '0:12', status: 'NG', ngReason: 'Focus', remarks: '' },
      { take: '2', duration: '—', status: 'Hold', ngReason: '', remarks: 'End board' },
      { take: '3', duration: '1:35', status: 'Print', ngReason: '', remarks: 'Best for performance' },
    ])
    // Line changes and ad-libs carry the line they were said on (SS8 acceptance, on paper).
    expect(s217!.scriptNotes).toEqual([
      { line: null, text: 'Note: Use the pause' },
      { line: 'ELENA: There is no cutaway.', text: 'T3 · Ad-lib: + “Nobody ever does.”' },
    ])
    expect(s217!.photos).toBe('2 photos (Wardrobe, Props)')
    expect(s218!.printed).toBe('No takes')
    expect(s218!.fields.find((f) => f.label === 'Sound')!.value).toBe('Wild track')
    expect(s218!.slateNotes).toBe('Room tone, 30s')
    expect(s218!.photos).toBe('None')
  })

  it('names the files by day', () => {
    expect(continuitySheetsFileName(14, '2026-10-07')).toBe('continuity-sheets-day-14-2026-10-07.pdf')
    expect(editorsLogFileName(null, '2026-10-07')).toBe('editors-log-2026-10-07.csv')
  })
})

describe("editor's log CSV (SS9)", () => {
  it('writes one row per take in shot order, with notes for that take and the whole slate', () => {
    const csv = buildEditorsLogCsv(day())
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe(EDITORS_LOG_HEADERS.join(','))
    expect(lines).toHaveLength(1 + 3 + 1)
    const cols = (i: number) => lines[i]!.split(',')
    expect(cols(1).slice(0, 9)).toEqual(['2026-10-07', '14', '217', '23', '1', 'NG', 'Focus', '0:12', ''])
    expect(lines[1]).toContain('Note: Use the pause')
    expect(lines[1]).not.toContain('Ad-lib')
    expect(lines[3]).toContain('Note: Use the pause | Ad-lib: + “Nobody ever does.” (ELENA: There is no cutaway.)')
    // A slate without takes still gets a row.
    expect(cols(4).slice(2, 6)).toEqual(['218', '23', '', ''])
    expect(lines[4]).toContain('Wild track')
  })

  it('quotes awkward fields and defuses spreadsheet formulas', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('+ “Nobody ever does.”')).toBe("'+ “Nobody ever does.”")
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
  })
})
