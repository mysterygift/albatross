import { describe, expect, it } from 'vitest'
import {
  buildMainScheduleColumns,
  buildAdvancedScheduleColumns,
  MAIN_SCHEDULE_TABLE_WIDTH,
} from '@/lib/pdf/callSheetScheduleColumns'

describe('buildMainScheduleColumns', () => {
  it('uses the standard column order and fills the width when episodes excluded', () => {
    const cols = buildMainScheduleColumns({ includeEpisodesInSchedule: false })
    expect(cols.map((c) => c.label)).toEqual([
      'SC/SH',
      'SET / DESCRIPTION',
      'CAST',
      'D/N',
      'PGS',
      'LOC',
      'NOTES',
    ])
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(MAIN_SCHEDULE_TABLE_WIDTH)
    expect(cols.some((c) => c.label === 'EP')).toBe(false)
  })

  it('inserts EP immediately left of SC/SH when episodes included', () => {
    const cols = buildMainScheduleColumns({ includeEpisodesInSchedule: true })
    const labels = cols.map((c) => c.label)
    expect(labels.indexOf('SC/SH')).toBe(labels.indexOf('EP') + 1)
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(MAIN_SCHEDULE_TABLE_WIDTH)
  })

  it('adds a TIME column only when requested, and fills a custom width', () => {
    const cols = buildMainScheduleColumns({ showTime: true }, 540)
    expect(cols.some((c) => c.label === 'TIME')).toBe(true)
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(540)
  })
})

describe('buildAdvancedScheduleColumns', () => {
  it('includes EP before SC/SH when enabled and hasCast, filling the width', () => {
    const cols = buildAdvancedScheduleColumns({ includeEpisodesInSchedule: true, hasCast: true })
    const labels = cols.map((c) => c.label)
    expect(labels.indexOf('EP') + 1).toBe(labels.indexOf('SC/SH'))
    expect(cols.reduce((s, c) => s + c.w, 0)).toBe(MAIN_SCHEDULE_TABLE_WIDTH)
  })

  it('omits EP when disabled', () => {
    const cols = buildAdvancedScheduleColumns({ includeEpisodesInSchedule: false, hasCast: true })
    expect(cols.some((c) => c.label === 'EP')).toBe(false)
  })
})
