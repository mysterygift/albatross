import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildShootingScheduleData } from '@/lib/schedule/shootingScheduleExport'
import { generateShootingSchedulePdf } from '@/lib/pdf/shootingSchedule'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
import type { Person, Scene, ShootDay, ShootDayUnit, Shot, StripboardStrip, Unit } from '@/lib/db/types'

const ts = { created_at: 't', updated_at: 't', deleted_at: null }

function scene(id: string, number: string, over: Partial<Scene> = {}): Scene {
  return {
    id,
    production_id: 'p1',
    scene_number: number,
    title: `Scene ${number} title`,
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 3,
    location_id: 'loc1',
    ...ts,
    ...over,
  } as Scene
}

function shot(id: string, sceneId: string, number: string, over: Partial<Shot> = {}): Shot {
  return {
    id,
    scene_id: sceneId,
    shot_number: number,
    shot_description: null,
    subject: null,
    shot_size: 'CU',
    support: null,
    lens: null,
    duration_seconds: null,
    estimated_shoot_minutes: 30,
    camera_movement: null,
    notes: null,
    ...ts,
    ...over,
  }
}

function strip(id: string, over: Partial<StripboardStrip>): StripboardStrip {
  return {
    id,
    production_id: 'p1',
    shoot_day_id: 'd1',
    shoot_day_unit_id: 'sdu-main',
    strip_type: 'SHOT',
    scene_id: null,
    shot_id: null,
    title: null,
    description: null,
    estimated_minutes: null,
    sort_index: 0,
    color_tag: null,
    strip_status: 'SCHEDULED',
    origin_location_id: null,
    destination_location_id: null,
    ...ts,
    ...over,
  }
}

const units: Unit[] = [
  { id: 'u-main', production_id: 'p1', name: 'Main Unit', ...ts } as Unit,
  { id: 'u-second', production_id: 'p1', name: 'Second Unit', ...ts } as Unit,
  { id: 'u-third', production_id: 'p1', name: 'Third Unit', ...ts } as Unit,
]
const shootDays = [
  { id: 'd2', production_id: 'p1', shoot_date: '2026-10-15', day_number: 2, ...ts },
  { id: 'd1', production_id: 'p1', shoot_date: '2026-10-14', day_number: 1, ...ts },
] as ShootDay[]
// Deliberately out of rank order: the export must put Main Unit first.
const shootDayUnits = [
  { id: 'sdu-third', shoot_day_id: 'd1', unit_id: 'u-third', ...ts },
  { id: 'sdu-main', shoot_day_id: 'd1', unit_id: 'u-main', ...ts },
  { id: 'sdu-second', shoot_day_id: 'd1', unit_id: 'u-second', ...ts },
  { id: 'sdu-d2', shoot_day_id: 'd2', unit_id: 'u-main', ...ts },
] as ShootDayUnit[]

const scenes = [scene('sc1', '1'), scene('sc2', '2', { int_ext: 'EXT', day_night: 'NIGHT' })]
const shots = [
  shot('sh1', 'sc1', '1A', { shot_description: 'Wide on the door' }),
  shot('sh2', 'sc1', '1B'),
  shot('sh3', 'sc2', '2A'),
]
const cast = [{ id: 'c1', name: 'Ada Lovelace', is_cast: 1, cast_number: '1' } as Person]

const strips = [
  strip('s-call', { strip_type: 'CALL', title: '07:00', sort_index: 0 }),
  strip('s2', { shot_id: 'sh2', sort_index: 2 }),
  strip('s1', { shot_id: 'sh1', sort_index: 1 }),
  strip('s-lunch', { strip_type: 'LUNCH', title: '13:00', sort_index: 3 }),
  strip('s3', { shot_id: 'sh3', shoot_day_unit_id: 'sdu-third', sort_index: 0 }),
  strip('s-second', { shot_id: 'sh3', shoot_day_unit_id: 'sdu-second', sort_index: 0 }),
  strip('s-unsched', { shot_id: 'sh3', strip_status: 'UNSCHEDULED', shoot_day_id: null, shoot_day_unit_id: null }),
  strip('s-d2', { shot_id: 'sh3', shoot_day_id: 'd2', shoot_day_unit_id: 'sdu-d2' }),
]

function input(over: Partial<Parameters<typeof buildShootingScheduleData>[0]> = {}) {
  return {
    productionName: 'The Albatross',
    scopeLabel: 'Whole schedule',
    shootDays,
    shootDayUnits,
    units,
    strips,
    scenes,
    shots,
    locations: [{ id: 'loc1', name: 'Kitchen' }],
    castPeople: cast,
    castBySceneId: new Map([['sc1', ['c1']]]),
    castByShotId: new Map<string, string[]>(),
    ...over,
  }
}

describe('buildShootingScheduleData', () => {
  it('orders days by date and units by rank, with strips in sort order', () => {
    const data = buildShootingScheduleData(input())
    expect(data.sections.map((s) => [s.shootDate, s.unitName])).toEqual([
      ['2026-10-14', 'Main Unit'],
      ['2026-10-14', 'Second Unit'],
      ['2026-10-14', 'Third Unit'],
      ['2026-10-15', 'Main Unit'],
    ])
    const main = data.sections[0]!
    expect(main.rows.map((r) => r.strip_type)).toEqual(['CALL', 'SHOT', 'SHOT', 'LUNCH'])
    expect(main.rows.map((r) => r.shot_number ?? null)).toEqual([null, '1A', '1B', null])
    expect(main.rows[1]!.castCompact).toBe('1')
    expect(main.totalsLine).toBe('2 shots | 6/8 pages | est. 1h 0m')
    expect(data.totalShootDays).toBe(2)
  })

  it('narrows to one day and one unit', () => {
    const data = buildShootingScheduleData(input({ shootDayIds: ['d1'], shootDayUnitId: 'sdu-third' }))
    expect(data.sections).toHaveLength(1)
    expect(data.sections[0]!.unitName).toBe('Third Unit')
    expect(data.sections[0]!.rows.map((r) => r.shot_number)).toEqual(['2A'])
  })
})

describe('generateShootingSchedulePdf', () => {
  it('prints each day + unit with its strips and banners', async () => {
    const bytes = await generateShootingSchedulePdf(buildShootingScheduleData(input()), {
      issuedAt: new Date(2026, 9, 13, 18, 40),
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
    const text = await extractPdfText(bytes)
    expect(text).toContain('SHOOTING SCHEDULE')
    expect(text).toContain('DAY 1 OF 2 | WEDNESDAY, 14 OCTOBER 2026 | MAIN UNIT')
    expect(text).toContain('THIRD UNIT')
    expect(text).toContain('LUNCH - 13:00')
    expect(text).toContain('Wide on the door')
    expect(text).toContain('EXT/N')
  })

  it('says so when nothing is scheduled', async () => {
    const bytes = await generateShootingSchedulePdf(buildShootingScheduleData(input({ strips: [] })))
    expect(await extractPdfText(bytes)).toContain('Nothing is scheduled for this selection yet.')
  })
})
