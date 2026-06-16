import { describe, expect, it } from 'vitest'
import {
  buildCallSheetStripFromStripboard,
  formatCallSheetSynopsis,
  resolveSceneAndShotForStripboardStrip,
} from '@/lib/call-sheets/scheduleStripRow'
import type { CallSheetStrip } from '@/lib/pdf/callSheet'

describe('resolveSceneAndShotForStripboardStrip', () => {
  const scenes = [
    {
      id: 'scene-1',
      scene_number: '12',
      heading: 'INT. KITCHEN',
      title: null,
      description: null,
      int_ext: 'INT',
      day_night: 'DAY',
      page_eighths: 4,
      location_id: 'loc-1',
    },
  ]
  const shots = [
    {
      id: 'shot-1',
      shot_number: '3',
      shot_description: 'Hero enters',
      notes: null,
      scene_id: 'scene-1',
    },
  ]

  it('resolves scene via shot when strip has shot_id only', () => {
    const { scene, shot } = resolveSceneAndShotForStripboardStrip(
      { strip_type: 'SHOT', scene_id: null, shot_id: 'shot-1' },
      scenes,
      shots,
    )
    expect(scene?.scene_number).toBe('12')
    expect(shot?.shot_number).toBe('3')
  })
})

describe('buildCallSheetStripFromStripboard', () => {
  it('populates SC/SH and synopsis for SHOT strip without scene_id on strip', () => {
    const scene = {
      id: 'scene-1',
      scene_number: '12',
      heading: 'INT. KITCHEN',
      title: null,
      description: null,
      int_ext: 'INT',
      day_night: 'DAY',
      page_eighths: 4,
      location_id: null,
    }
    const shot = {
      id: 'shot-1',
      scene_id: 'scene-1',
      shot_number: '3',
      shot_description: 'Hero enters',
      notes: null,
    }
    const row = buildCallSheetStripFromStripboard(
      { strip_type: 'SHOT', scene_id: null, shot_id: 'shot-1', title: null, description: null },
      scene,
      shot,
      null,
      { lastLocationId: null },
      [],
      [],
    )
    expect(row.scene_number).toBe('12')
    expect(row.shot_number).toBe('3')
    expect(row.shot_description).toBe('Hero enters')
    expect(row.rowNotes).toBeNull()
  })
})

describe('formatCallSheetSynopsis', () => {
  it('puts scene title on first line and shot description on second for SHOT rows', () => {
    const strip: CallSheetStrip = {
      strip_type: 'SHOT',
      scene_title: 'Kitchen confrontation',
      scene_heading: 'INT. KITCHEN',
      shot_description: 'Hero enters through back door',
    }
    expect(formatCallSheetSynopsis(strip)).toBe(
      'Kitchen confrontation\nHero enters through back door',
    )
  })

  it('uses scene heading when title is missing', () => {
    const strip: CallSheetStrip = {
      strip_type: 'SHOT',
      scene_heading: 'INT. KITCHEN',
      shot_description: 'Wide master',
    }
    expect(formatCallSheetSynopsis(strip)).toBe('INT. KITCHEN\nWide master')
  })

  it('joins scene fields for SCENE rows', () => {
    const strip: CallSheetStrip = {
      strip_type: 'SCENE',
      scene_heading: 'EXT. STREET',
      scene_title: 'Arrival',
      scene_description: 'Taxi pulls up',
    }
    expect(formatCallSheetSynopsis(strip)).toBe('EXT. STREET · Arrival · Taxi pulls up')
  })
})
