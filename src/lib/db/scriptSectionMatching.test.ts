import { describe, expect, it } from 'vitest'
import {
  buildPageHighlightSegments,
  classifySectionPair,
  conflictingSectionIds,
  contentFingerprint,
  crossVersionSectionKey,
  findOverlappingSectionPairs,
  intersectTextSlices,
  rangeSliceOnPage,
  rangesOverlap,
  sectionSignature,
} from '@/lib/db/scriptSectionMatching'

describe('scriptSectionMatching', () => {
  it('sectionSignature is stable for scene + type + label', () => {
    expect(sectionSignature('scene-1', 'dialogue', 'Opening')).toBe(
      sectionSignature('scene-1', 'dialogue', 'Opening')
    )
    expect(sectionSignature('scene-1', 'dialogue', 'Opening')).not.toBe(
      sectionSignature('scene-2', 'dialogue', 'Opening')
    )
  })

  it('rangesOverlap detects shared page/eighth spans', () => {
    expect(
      rangesOverlap(
        { start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4 } as never,
        { start_page: '1', start_eighth: 2, end_page: '2', end_eighth: 0 }
      )
    ).toBe(true)
    expect(
      rangesOverlap(
        { start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 2 } as never,
        { start_page: '3', start_eighth: 0, end_page: '3', end_eighth: 4 }
      )
    ).toBe(false)
  })

  it('classifySectionPair marks identical fingerprints as exact', () => {
    const fp = contentFingerprint('Same dialogue text.')
    expect(classifySectionPair(fp, fp)).toBe('exact')
    expect(classifySectionPair(fp, contentFingerprint('Different text.'))).toBe('changed')
  })

  it('crossVersionSectionKey includes scene number and range', () => {
    expect(
      crossVersionSectionKey({
        sceneNumber: '12',
        sectionType: 'dialogue',
        label: 'Beat',
        rangeSignature: '1/0–2/4',
      })
    ).toBe('12|dialogue|Beat|1/0–2/4')
  })

  it('findOverlappingSectionPairs detects same-scene overlaps only', () => {
    const sections = [
      { id: 'a', scene_id: 'scene-1' },
      { id: 'b', scene_id: 'scene-1' },
      { id: 'c', scene_id: 'scene-2' },
    ]
    const ranges = new Map([
      ['a', { start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4 } as never],
      ['b', { start_page: '1', start_eighth: 2, end_page: '1', end_eighth: 6 } as never],
      ['c', { start_page: '1', start_eighth: 2, end_page: '1', end_eighth: 6 } as never],
    ])
    const pairs = findOverlappingSectionPairs(sections, ranges)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ sectionAId: 'a', sectionBId: 'b', sceneId: 'scene-1' })
    expect(conflictingSectionIds(pairs)).toEqual(new Set(['a', 'b']))
  })

  it('rangeSliceOnPage uses full page when offsets are missing', () => {
    const slice = rangeSliceOnPage(
      { start_page: '2', start_eighth: 0, end_page: '2', end_eighth: 4 } as never,
      2,
      100
    )
    expect(slice).toEqual({ start: 0, end: 100 })
  })

  it('buildPageHighlightSegments marks overlap between selected and conflict slices', () => {
    const segments = buildPageHighlightSegments(
      100,
      { start: 10, end: 50 },
      [{ start: 30, end: 70 }]
    )
    expect(segments.some((s) => s.kind === 'overlap' && s.start === 30 && s.end === 50)).toBe(true)
    expect(segments.some((s) => s.kind === 'selected' && s.start === 10 && s.end === 30)).toBe(true)
    expect(segments.some((s) => s.kind === 'conflict' && s.start === 50 && s.end === 70)).toBe(true)
  })

  it('intersectTextSlices returns shared span', () => {
    expect(
      intersectTextSlices({ start: 10, end: 50 }, { start: 30, end: 70 })
    ).toEqual({ start: 30, end: 50 })
  })
})
