import { describe, expect, it } from 'vitest'
import {
  buildMainScheduleColumns,
  buildAdvancedScheduleColumns,
  MAIN_SCHEDULE_TABLE_WIDTH,
  MAIN_SCHEDULE_TABLE_WIDTH_WITH_EP,
} from '@/lib/pdf/callSheetScheduleColumns'

describe('buildMainScheduleColumns', () => {
  it('matches legacy headers and width when episodes excluded', () => {
    const cols = buildMainScheduleColumns({ includeEpisodesInSchedule: false })
    expect(cols.map((c) => c.label)).toEqual([
      'LOC',
      'SC/SH',
      'SHOT DESCRIPTION',
      'D/N',
      'PGS',
      'CAST',
      'NOTES',
    ])
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(MAIN_SCHEDULE_TABLE_WIDTH)
    expect(cols.some((c) => c.label === 'EP')).toBe(false)
  })

  it('inserts EP immediately left of SC/SH when episodes included', () => {
    const cols = buildMainScheduleColumns({ includeEpisodesInSchedule: true })
    const labels = cols.map((c) => c.label)
    const iEp = labels.indexOf('EP')
    const iSc = labels.indexOf('SC/SH')
    expect(iEp).toBeGreaterThanOrEqual(0)
    expect(iSc).toBe(iEp + 1)
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(MAIN_SCHEDULE_TABLE_WIDTH_WITH_EP)
  })
})

describe('buildAdvancedScheduleColumns', () => {
  it('includes EP before SC/SH when enabled and hasCast', () => {
    const cols = buildAdvancedScheduleColumns({ includeEpisodesInSchedule: true, hasCast: true })
    const labels = cols.map((c) => c.label)
    expect(labels.indexOf('EP') + 1).toBe(labels.indexOf('SC/SH'))
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(370)
  })

  it('omits EP when disabled', () => {
    const cols = buildAdvancedScheduleColumns({ includeEpisodesInSchedule: false, hasCast: true })
    expect(cols.some((c) => c.label === 'EP')).toBe(false)
  })
})
