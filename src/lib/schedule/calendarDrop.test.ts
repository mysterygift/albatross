import { describe, expect, it } from 'vitest'
import { resolveCalendarDrop, type CalendarDragItem } from './calendarDrop'

const unit: CalendarDragItem = { kind: 'unit', shootDayUnitId: 'u1', shootDayId: 'd1', date: '2026-06-01' }
const day: CalendarDragItem = { kind: 'day', shootDayId: 'd1', date: '2026-06-01' }
const counts = (byDate: Record<string, number>) => (date: string) => byDate[date] ?? 0

describe('resolveCalendarDrop', () => {
  it('moves the whole day when its header is dropped on another date or unit', () => {
    expect(resolveCalendarDrop(day, { kind: 'date', date: '2026-06-04' }, counts({}))).toEqual({
      type: 'move-day',
      shootDayId: 'd1',
      targetDate: '2026-06-04',
    })
    expect(
      resolveCalendarDrop(day, { kind: 'unit', shootDayUnitId: 'u9', shootDayId: 'd9', date: '2026-06-09' }, counts({}))
    ).toEqual({ type: 'move-day', shootDayId: 'd1', targetDate: '2026-06-09' })
    expect(resolveCalendarDrop(day, { kind: 'date', date: '2026-06-01' }, counts({}))).toEqual({ type: 'none' })
  })

  it('swaps ranks when a unit is dropped on another unit of the same day', () => {
    expect(
      resolveCalendarDrop(unit, { kind: 'unit', shootDayUnitId: 'u2', shootDayId: 'd1', date: '2026-06-01' }, counts({}))
    ).toEqual({ type: 'swap-units', shootDayUnitIdA: 'u1', shootDayUnitIdB: 'u2' })
    expect(resolveCalendarDrop(unit, { kind: 'date', date: '2026-06-01' }, counts({}))).toEqual({ type: 'none' })
  })

  it('moves a unit to another date unless that day already has five units', () => {
    expect(resolveCalendarDrop(unit, { kind: 'date', date: '2026-06-02' }, counts({ '2026-06-02': 4 }))).toEqual({
      type: 'move-unit',
      shootDayUnitId: 'u1',
      targetDate: '2026-06-02',
    })
    expect(
      resolveCalendarDrop(unit, { kind: 'unit', shootDayUnitId: 'u7', shootDayId: 'd2', date: '2026-06-02' }, counts({}))
    ).toEqual({ type: 'move-unit', shootDayUnitId: 'u1', targetDate: '2026-06-02' })
    expect(resolveCalendarDrop(unit, { kind: 'date', date: '2026-06-02' }, counts({ '2026-06-02': 5 }))).toEqual({
      type: 'reject',
      reason: 'target-full',
    })
  })
})
