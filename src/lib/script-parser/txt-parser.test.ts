import { describe, expect, it } from 'vitest'

import { estimateSceneEighths, extractCharacterCues, parseTxtScript } from './txt-parser'

describe('estimateSceneEighths', () => {
  it('returns at least one eighth for empty bodies', () => {
    expect(estimateSceneEighths(0)).toBe(1)
    expect(estimateSceneEighths(-5)).toBe(1)
  })

  it('scales line count to eighths (8 per ~56 lines)', () => {
    expect(estimateSceneEighths(56)).toBe(8)
    expect(estimateSceneEighths(28)).toBe(4)
    expect(estimateSceneEighths(7)).toBe(1)
  })
})

describe('extractCharacterCues', () => {
  it('detects uppercase cues and ignores action/dialogue', () => {
    const body = ['JANE walks in slowly.', 'JANE', 'Hello there.', 'JOHN', 'Hi.'].join('\n')
    expect(extractCharacterCues(body)).toEqual(['JANE', 'JOHN'])
  })

  it('strips parentheticals and de-duplicates case-insensitively', () => {
    const body = ['JANE', 'Line one.', "JANE (CONT'D)", 'Line two.'].join('\n')
    expect(extractCharacterCues(body)).toEqual(['JANE'])
  })

  it('ignores transitions and scene headings', () => {
    const body = ['CUT TO:', 'INT. KITCHEN - DAY', 'FADE OUT', 'BOB', 'Yo.'].join('\n')
    expect(extractCharacterCues(body)).toEqual(['BOB'])
  })
})

describe('parseTxtScript', () => {
  const script = [
    'INT. KITCHEN - DAY',
    '',
    'JANE walks in.',
    '',
    'JANE',
    'Hello?',
    '',
    'EXT. STREET - NIGHT',
    '',
    'A car passes.',
    '',
    "JOHN (CONT'D)",
    'Over here.',
  ].join('\n')

  it('keeps existing base fields for each scene', () => {
    const scenes = parseTxtScript(script)
    expect(scenes).toHaveLength(2)
    expect(scenes[0]).toMatchObject({
      scene_number: '1',
      title: 'KITCHEN - DAY',
      location: 'KITCHEN',
      int_ext: 'INT',
      day_night: 'DAY',
    })
    expect(scenes[1]).toMatchObject({
      scene_number: '2',
      title: 'STREET - NIGHT',
      location: 'STREET',
      int_ext: 'EXT',
      day_night: 'NIGHT',
    })
  })

  it('captures content, eighths, page spans, offsets, and character cues', () => {
    const scenes = parseTxtScript(script)
    const [first, second] = scenes

    expect(first!.content).toContain('INT. KITCHEN - DAY')
    expect(first!.page_eighths).toBeGreaterThanOrEqual(1)
    expect(first!.start_page).toBe('1')
    expect(first!.end_page).toBeTruthy()
    expect(first!.start_offset).toBe(0)
    expect(first!.end_offset).toBeGreaterThan(0)
    expect(first!.characters).toEqual(['JANE'])

    expect(second!.characters).toEqual(['JOHN'])
    expect(second!.start_offset).toBeGreaterThan(first!.start_offset!)
  })

  it('parses broadened heading prefixes (INT/EXT, no trailing period, EST)', () => {
    const script = [
      'INT/EXT CAR - DAY',
      'Driving.',
      '',
      'EST CITY SKYLINE - DAWN',
      'The sun rises.',
    ].join('\n')
    const scenes = parseTxtScript(script)
    expect(scenes).toHaveLength(2)
    expect(scenes[0]).toMatchObject({ title: 'CAR - DAY', location: 'CAR', int_ext: 'MIXED', day_night: 'DAY' })
    expect(scenes[1]).toMatchObject({ title: 'CITY SKYLINE - DAWN', location: 'CITY SKYLINE', int_ext: 'EXT' })
  })

  it('strips continuation tags from scene titles', () => {
    const script = ['INT. OFFICE - DAY (CONTINUED)', 'Work continues.'].join('\n')
    const scenes = parseTxtScript(script)
    expect(scenes[0]!.title).toBe('OFFICE - DAY')
    expect(scenes[0]!.day_night).toBe('DAY')
  })
})
