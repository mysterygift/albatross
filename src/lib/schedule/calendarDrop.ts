/**
 * Schedule Calendar drag and drop: what a drop means.
 *
 * Two things can be dragged: a whole shoot day (its header) or one unit on it. Drop targets are a
 * date cell or a unit card. The calendar page turns the action into repository calls.
 */
import { MAX_UNITS_PER_DAY } from './unitKey'

export type CalendarDragItem =
  | { kind: 'day'; shootDayId: string; date: string }
  | { kind: 'unit'; shootDayUnitId: string; shootDayId: string; date: string }

export type CalendarDropTarget =
  | { kind: 'date'; date: string }
  | { kind: 'unit'; shootDayUnitId: string; shootDayId: string; date: string }

export type CalendarDropAction =
  | { type: 'none' }
  /** Move the whole shoot day; the caller offers a swap when the date is taken. */
  | { type: 'move-day'; shootDayId: string; targetDate: string }
  /** Move one unit to another date; it takes the next free rank there. */
  | { type: 'move-unit'; shootDayUnitId: string; targetDate: string }
  /** Two units on the same day trade ranks (e.g. Second Unit becomes Main Unit). */
  | { type: 'swap-units'; shootDayUnitIdA: string; shootDayUnitIdB: string }
  | { type: 'reject'; reason: 'target-full' }

export const CALENDAR_DATE_DROP_PREFIX = 'date-'
export const CALENDAR_UNIT_DROP_PREFIX = 'unit-slot:'
export const CALENDAR_DAY_DRAG_PREFIX = 'day:'
export const CALENDAR_UNIT_DRAG_PREFIX = 'unit:'

export function resolveCalendarDrop(
  item: CalendarDragItem,
  target: CalendarDropTarget,
  unitCountOnDate: (date: string) => number
): CalendarDropAction {
  if (item.kind === 'day') {
    if (target.date === item.date) return { type: 'none' }
    return { type: 'move-day', shootDayId: item.shootDayId, targetDate: target.date }
  }

  if (target.date === item.date) {
    if (target.kind === 'unit' && target.shootDayUnitId !== item.shootDayUnitId) {
      return { type: 'swap-units', shootDayUnitIdA: item.shootDayUnitId, shootDayUnitIdB: target.shootDayUnitId }
    }
    return { type: 'none' }
  }

  if (unitCountOnDate(target.date) >= MAX_UNITS_PER_DAY) return { type: 'reject', reason: 'target-full' }
  return { type: 'move-unit', shootDayUnitId: item.shootDayUnitId, targetDate: target.date }
}
