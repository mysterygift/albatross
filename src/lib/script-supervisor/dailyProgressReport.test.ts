import { describe, expect, it } from 'vitest'

import type { DayProgress } from '@/lib/db/scriptSupervisorProgressService'
import { buildDailyProgressReport, dailyProgressReportFileName, type DprInput } from './dailyProgressReport'
import { buildSceneProgressRows, type SceneProgressMark, type SceneSlateAggregate } from './progress'

const scene = (id: string, page_eighths: number, duration_minutes: number) => ({
  id, scene_number: id, title: `Scene ${id}`, page_eighths, episode_id: null, duration_minutes,
})
const agg = (lastShootDate: string): SceneSlateAggregate => ({ slates: 1, takes: 1, prints: 1, lastShootDate, lastDayNumber: null })
const mark = (over: Partial<SceneProgressMark>): SceneProgressMark => ({
  marked_status: null, completed_shoot_day_id: null, credited_eighths: null, timed_seconds: null, notes: null, ...over,
})
const day = (id: string, shootDate: string, slates: number, takes: number): DayProgress => ({
  shootDayId: id, shootDate, dayNumber: null, scheduledEighths: 0, completedEighths: 0, slates, takes,
})

function input(over: Partial<DprInput> = {}): DprInput {
  const rows = buildSceneProgressRows(
    [scene('10', 6, 1.5), scene('23', 11, 2), scene('24', 4, 0.5), scene('31', 10, 1), scene('32', 5, 1)],
    new Map([
      ['10', agg('2026-10-06')],
      ['23', agg('2026-10-07')],
      ['31', agg('2026-10-07')],
    ]),
    new Map([
      ['10', mark({ marked_status: 'complete', completed_shoot_day_id: 'd13', timed_seconds: 80 })],
      ['23', mark({ marked_status: 'complete', completed_shoot_day_id: 'd14' })],
      ['31', mark({ credited_eighths: 3 })],
      ['32', mark({ marked_status: 'omitted' })],
    ])
  )
  return {
    productionName: 'The Pier',
    shootDayId: 'd14',
    shootDate: '2026-10-07',
    dayNumber: 14,
    totalShootDays: 32,
    plannedCallTime: '07:30',
    plannedWrapTime: '19:30',
    dayLog: {
      call_time: null, first_shot_time: '08:10', lunch_start_time: '13:00', lunch_end_time: '14:00',
      first_shot_after_lunch_time: null, camera_wrap_time: null, wrap_time: '19:45', remarks: 'Rain delay',
    },
    rows,
    days: [day('d13', '2026-10-06', 2, 3), day('d14', '2026-10-07', 3, 2)],
    scheduledSceneIds: ['23', '24'],
    wildTracks: ['Slate 5 · Sc 23 · Room tone'],
    ...over,
  }
}

describe('daily progress report (SS5)', () => {
  it('fills the UK progress grid from completions, part-shot credit and slates', () => {
    const dpr = buildDailyProgressReport(input())
    const g = Object.fromEntries(dpr.grid.map((r) => [r.label, [r.script, r.previously, r.today, r.toDate, r.toDo]]))
    expect(g.Scenes).toEqual(['4', '1', '1', '2', '2'])
    // 31 eighths in script; 6 before; 11 completed + 3 part-shot credit today; 20 to date
    expect(g.Pages).toEqual(['3 7/8', '6/8', '1 6/8', '2 4/8', '1 3/8'])
    // timed 1:20 for 10; 23 untimed falls back to its 2:00 estimate
    expect(g.Minutes).toEqual(['5:00', '1:20', '2:00', '3:20', '1:40'])
    expect(g.Setups).toEqual(['—', '2', '3', '5', '—'])
    expect(g.Takes).toEqual(['—', '3', '2', '5', '—'])
    expect(dpr.footnotes).toHaveLength(2)
  })

  it('uses actual times, falling back to planned call and wrap', () => {
    const dpr = buildDailyProgressReport(input())
    expect(dpr.times.map((t) => t.value)).toEqual(['07:30 (planned)', '08:10', '13:00 – 14:00', '—', '—', '19:45'])
    expect(dpr.heading).toBe('Daily Progress Report · Day 14 of 32')
    expect(dpr.remarks).toBe('Rain delay')
  })

  it('lists the day’s scenes with their status and leaves later work out of earlier days', () => {
    const dpr = buildDailyProgressReport(input())
    expect(dpr.scenes.map((s) => [s.sceneNumber, s.status])).toEqual([
      ['23', 'Completed today'],
      ['24', 'Not shot'],
    ])
    expect(dpr.completedToday).toEqual(['23'])

    const earlier = buildDailyProgressReport(input({ shootDayId: 'd13', shootDate: '2026-10-06', dayNumber: 13, scheduledSceneIds: ['10'] }))
    const pages = earlier.grid.find((r) => r.label === 'Pages')!
    expect([pages.today, pages.toDate]).toEqual(['6/8', '6/8'])
    expect(earlier.grid.find((r) => r.label === 'Setups')!.toDate).toBe('2')
  })

  it('names the file by day and date', () => {
    expect(dailyProgressReportFileName(14, '2026-10-07')).toBe('dpr-day-14-2026-10-07.pdf')
    expect(dailyProgressReportFileName(null, '2026-10-07')).toBe('dpr-2026-10-07.pdf')
  })
})
