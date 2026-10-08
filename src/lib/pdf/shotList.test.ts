import { describe, expect, it } from 'vitest'
import { buildShotListPdfData, formatShotDuration, generateShotListPdf } from '@/lib/pdf/shotList'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
import type { Person, Scene, Shot } from '@/lib/db/types'

const ts = { created_at: 't', updated_at: 't', deleted_at: null }

function scene(id: string, number: string): Scene {
  return {
    id,
    production_id: 'p1',
    scene_number: number,
    title: null,
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 2,
    location_id: 'loc1',
    ...ts,
  } as Scene
}

function shot(id: string, sceneId: string, number: string, over: Partial<Shot> = {}): Shot {
  return {
    id,
    scene_id: sceneId,
    shot_number: number,
    shot_description: null,
    subject: null,
    shot_size: null,
    support: null,
    lens: null,
    duration_seconds: null,
    estimated_shoot_minutes: null,
    camera_movement: null,
    notes: null,
    ...ts,
    ...over,
  }
}

const scenes = [scene('sc10', '10'), scene('sc2', '2')]
const shots = [
  shot('a', 'sc10', '10A'),
  shot('b', 'sc2', '2B'),
  shot('c', 'sc2', '2A', {
    subject: 'Ada',
    shot_description: 'Push in as she reads',
    shot_size: 'MCU',
    camera_movement: 'Track In',
    lens: '50mm',
    support: 'Dolly',
    duration_seconds: 75,
    estimated_shoot_minutes: 40,
    notes: 'Practical lamp on',
  }),
  shot('gone', 'sc2', '2C', { deleted_at: 'x' }),
]
const base = {
  productionName: 'The Albatross',
  scopeLabel: 'All scenes',
  scenes,
  shots,
  locations: [{ id: 'loc1', name: 'Library' }],
  castPeople: [{ id: 'c1', name: 'Ada Lovelace', is_cast: 1, cast_number: '1' } as Person],
  castBySceneId: new Map([['sc2', ['c1']]]),
  castByShotId: new Map<string, string[]>(),
}

describe('buildShotListPdfData', () => {
  it('sorts scenes and shots by number and skips deleted shots', () => {
    const data = buildShotListPdfData(base)
    expect(data.scenes.map((s) => s.sceneNumber)).toEqual(['2', '10'])
    expect(data.scenes[0]!.shots.map((s) => s.shotNumber)).toEqual(['2A', '2B'])
    expect(data.scenes[0]!.heading).toBe('INT. Library - DAY')
    expect(data.scenes[0]!.shots[0]).toMatchObject({ duration: '1:15', cast: '1', size: 'MCU' })
  })

  it('follows an explicit shot order, grouping shots under their scene', () => {
    const data = buildShotListPdfData({ ...base, shotOrder: ['a', 'c', 'b'] })
    expect(data.scenes.map((s) => [s.sceneNumber, s.shots.map((h) => h.shotNumber)])).toEqual([
      ['10', ['10A']],
      ['2', ['2A', '2B']],
    ])
  })

  it('formats durations like the Shot List page', () => {
    expect(formatShotDuration(null)).toBe('—')
    expect(formatShotDuration(5)).toBe('0:05')
  })
})

describe('generateShotListPdf', () => {
  it('prints every shot with its camera details', async () => {
    const text = await extractPdfText(await generateShotListPdf(buildShotListPdfData(base)))
    expect(text).toContain('SHOT LIST')
    expect(text).toContain('SCENE 2 | INT. LIBRARY - DAY')
    for (const value of ['2A', 'Push in as she reads', 'MCU', 'Track In', '50mm', 'Dolly', '1:15', '40', 'Practical lamp on']) {
      expect(text).toContain(value)
    }
  })
})
