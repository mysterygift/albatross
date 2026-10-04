import { describe, expect, it } from 'vitest'

import {
  annotationsByElement,
  continuityPhotoFileName,
  formatAnnotationChip,
  formatContinuityTags,
  parseContinuityTags,
  type AnnotationView,
} from './annotations'

const note = (over: Partial<AnnotationView>): AnnotationView => ({
  id: 'a', elementId: 'e1', kind: 'ad_lib', text: '+ “Nobody ever does.”', slateId: 's', slateLabel: '217',
  takeIds: [], takeNumbers: [], createdAt: '2026-10-07T10:00', ...over,
})

describe('annotations and continuity tags (SS8)', () => {
  it('writes chips the way a script supervisor writes the margin', () => {
    expect(formatAnnotationChip(note({ takeNumbers: [3, 1] }))).toBe('T1,3 · 217 · Ad-lib: + “Nobody ever does.”')
    expect(formatAnnotationChip(note({ kind: 'vfx', text: 'Screen replacement', slateLabel: null }))).toBe('VFX: Screen replacement')
  })

  it('groups notes by line, oldest first', () => {
    const grouped = annotationsByElement([
      note({ id: 'b', createdAt: '2026-10-07T11:00' }),
      note({ id: 'a', createdAt: '2026-10-07T10:00' }),
      note({ id: 'c', elementId: 'e2' }),
    ])
    expect(grouped.get('e1')!.map((n) => n.id)).toEqual(['a', 'b'])
    expect(grouped.get('e2')!.map((n) => n.id)).toEqual(['c'])
  })

  it('keeps only known continuity tags, in a fixed order', () => {
    expect(parseContinuityTags('Set, props ,nonsense')).toEqual(['props', 'set'])
    expect(formatContinuityTags(['Hair', 'wardrobe'])).toBe('wardrobe,hair')
    expect(formatContinuityTags([])).toBeNull()
  })

  it('names stored photos by slate and take', () => {
    expect(continuityPhotoFileName('IMG_0042.HEIC', '217', 3)).toBe('continuity-slate-217-t3.heic')
    expect(continuityPhotoFileName('photo', null, null)).toBe('continuity.jpg')
  })
})
