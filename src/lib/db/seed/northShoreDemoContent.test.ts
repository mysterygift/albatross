import { describe, expect, it } from 'vitest'
import { makeDemoSeedIdSourceFromEpisodicIDS } from '@/lib/db/seed/demoSeedContext'
import {
  buildNorthShoreShotRows,
  NORTH_SHORE_DEMO_PRODUCTION_NAME,
  NORTH_SHORE_LOCATION_COUNT,
  NORTH_SHORE_LOCATIONS,
  NORTH_SHORE_SCENE_COUNT,
  NORTH_SHORE_SCENES,
  NORTH_SHORE_SHOT_BEATS,
  NORTH_SHORE_SHOTS_PER_SCENE,
  northShoreGlobalShotIndex,
} from '@/lib/db/seed/northShoreDemoContent'

/** Legacy seed phrasing and obvious camera-operation lines we no longer want in shot action copy. */
const CAMERA_OR_TEMPLATE_JUNK = /\b(slow push|dolly\b|handheld follow|whip pan|establish geography|over-shoulder proofing|lock wide for reset|insert on hands|profile cu)\b/i

const SCREENPLAY_LOCATION_LINE = /^\s*(INT|EXT)\./i

describe('North Shore demo content quality', () => {
  it('uses the prefixed episodic demo production display name', () => {
    expect(NORTH_SHORE_DEMO_PRODUCTION_NAME).toBe('Demo: North Shore')
  })

  it('keeps location records as plain place names (no INT/EXT or time-of-day slug)', () => {
    expect(NORTH_SHORE_LOCATIONS).toHaveLength(NORTH_SHORE_LOCATION_COUNT)
    for (const loc of NORTH_SHORE_LOCATIONS) {
      expect(loc.name, loc.name).not.toMatch(SCREENPLAY_LOCATION_LINE)
      expect(loc.name).not.toMatch(/\bDAY\b|\bNIGHT\b/i)
      expect(loc.name.trim()).toBe(loc.name)
    }
  })

  it('aligns shot beat packages with scenes', () => {
    expect(NORTH_SHORE_SHOT_BEATS).toHaveLength(NORTH_SHORE_SCENES.length)
    expect(NORTH_SHORE_SCENES.length).toBe(NORTH_SHORE_SCENE_COUNT)
    for (let i = 0; i < NORTH_SHORE_SHOT_BEATS.length; i++) {
      expect(NORTH_SHORE_SHOT_BEATS[i]!.length).toBe(NORTH_SHORE_SHOTS_PER_SCENE)
    }
  })

  it('varies shot subjects within every scene (no single repeated subject across all eight shots)', () => {
    for (let si = 0; si < NORTH_SHORE_SHOT_BEATS.length; si++) {
      const beats = NORTH_SHORE_SHOT_BEATS[si]!
      const subjects = beats.map((b) => b.subject.trim().toLowerCase())
      expect(new Set(subjects).size, `scene index ${si}`).toBe(NORTH_SHORE_SHOTS_PER_SCENE)
    }
  })

  it('writes shot descriptions as action/story beats, not camera-move templates', () => {
    for (let si = 0; si < NORTH_SHORE_SHOT_BEATS.length; si++) {
      for (let ti = 0; ti < NORTH_SHORE_SHOT_BEATS[si]!.length; ti++) {
        const { description } = NORTH_SHORE_SHOT_BEATS[si]![ti]!
        expect(description.length).toBeGreaterThan(12)
        expect(description, `scene ${si} shot ${ti}`).not.toMatch(CAMERA_OR_TEMPLATE_JUNK)
        expect(description.toLowerCase().startsWith('coverage beat'), `scene ${si} shot ${ti}`).toBe(false)
      }
    }
  })

  it('buildNorthShoreShotRows maps beats into shot_description and subject', () => {
    const rows = buildNorthShoreShotRows({ idSource: makeDemoSeedIdSourceFromEpisodicIDS(), ts: 't' })
    expect(rows).toHaveLength(NORTH_SHORE_SCENE_COUNT * NORTH_SHORE_SHOTS_PER_SCENE)
    const byScene = new Map<string, Set<string>>()
    for (const row of rows) {
      expect(row.shot_description?.trim()).toBeTruthy()
      expect(row.subject?.trim()).toBeTruthy()
      expect(row.shot_description ?? '').not.toMatch(CAMERA_OR_TEMPLATE_JUNK)
      const sid = row.scene_id
      if (!byScene.has(sid)) byScene.set(sid, new Set())
      byScene.get(sid)!.add(row.subject!.trim().toLowerCase())
    }
    expect(byScene.size).toBe(NORTH_SHORE_SCENE_COUNT)
    for (const subs of byScene.values()) {
      expect(subs.size).toBe(NORTH_SHORE_SHOTS_PER_SCENE)
    }
  })

  it('northShoreGlobalShotIndex stays consistent with row order', () => {
    const idSource = makeDemoSeedIdSourceFromEpisodicIDS()
    const rows = buildNorthShoreShotRows({ idSource, ts: 't' })
    let i = 0
    for (let sceneNum = 1; sceneNum <= NORTH_SHORE_SCENE_COUNT; sceneNum++) {
      for (let shotNum = 1; shotNum <= NORTH_SHORE_SHOTS_PER_SCENE; shotNum++) {
        const g = northShoreGlobalShotIndex(sceneNum, shotNum)
        expect(rows[i]!.id).toBe(idSource.shot(g))
        i++
      }
    }
  })
})
