import { describe, expect, it } from 'vitest'

import { pruneOrphanedApfRows } from '@/lib/importExport/pruneOrphanedRows'
import { emptyApfTables } from '@/test/apf/fixtures'

describe('pruneOrphanedApfRows', () => {
  it('drops rows whose required parent was not exported, cascading to children', () => {
    const t = emptyApfTables()
    t.scenes = [{ id: 'sc1' }]
    t.shoot_days = [{ id: 'd1' }]
    t.slates = [
      { id: 'live', shoot_day_id: 'd1', scene_id: 'sc1' },
      { id: 'orphan', shoot_day_id: 'gone-day', scene_id: 'sc1' },
    ]
    t.takes = [
      { id: 't-live', slate_id: 'live' },
      { id: 't-orphan', slate_id: 'orphan' },
    ]
    t.script_annotations = [{ id: 'a1', slate_id: 'orphan', script_version_id: 'v', element_id: 'e' }]
    t.script_annotation_takes = [{ annotation_id: 'a1', take_id: 't-orphan' }]

    const out = pruneOrphanedApfRows(t)
    expect(out.slates.map((r) => r.id)).toEqual(['live'])
    expect(out.takes.map((r) => r.id)).toEqual(['t-live'])
    expect(out.script_annotations).toEqual([])
    expect(out.script_annotation_takes).toEqual([])
  })

  it('clears optional links (SET NULL) instead of dropping the row', () => {
    const t = emptyApfTables()
    t.shoot_days = [{ id: 'd1' }]
    t.documents = [{ id: 'doc1' }]
    t.slates = [{ id: 's1', shoot_day_id: 'd1', unit_id: 'gone-unit', scene_id: 'gone-scene', shot_id: 'gone-shot' }]
    t.shoot_day_sides_exports = [
      { id: 'x1', shoot_day_id: 'd1', document_id: 'doc1', script_version_id: 'gone-version' },
      { id: 'x2', shoot_day_id: 'd1', document_id: 'gone-doc', script_version_id: null },
    ]

    const out = pruneOrphanedApfRows(t)
    expect(out.slates[0]).toMatchObject({ unit_id: null, scene_id: null, shot_id: null, shoot_day_id: 'd1' })
    expect(out.shoot_day_sides_exports).toEqual([
      { id: 'x1', shoot_day_id: 'd1', document_id: 'doc1', script_version_id: null },
      { id: 'x2', shoot_day_id: 'd1', document_id: null, script_version_id: null },
    ])
  })

  it('turns a booking whose unit was not exported into a whole-day booking', () => {
    const t = emptyApfTables()
    t.shoot_day_units = [{ id: 'sdu1' }]
    t.bookings = [
      { id: 'b1', shoot_day_id: 'd1', shoot_day_unit_id: 'sdu1' },
      { id: 'b2', shoot_day_id: 'd1', shoot_day_unit_id: 'gone-unit' },
    ]

    const out = pruneOrphanedApfRows(t)
    expect(out.bookings.map((r) => r.shoot_day_unit_id)).toEqual(['sdu1', null])
  })

  it('clears self-links to rows that were not exported or were themselves dropped', () => {
    const t = emptyApfTables()
    t.script_versions = [
      { id: 'v1', previous_script_version_id: null },
      { id: 'v2', previous_script_version_id: 'v1' },
      { id: 'v3', previous_script_version_id: 'deleted-version' },
    ]
    t.slates = [{ id: 's-gone', shoot_day_id: 'missing' }, { id: 's-ok', shoot_day_id: 'd1' }]
    t.shoot_days = [{ id: 'd1' }]
    t.script_elements = [{ id: 'e1', script_version_id: 'v1', scene_id: null }]
    t.tramlines = [
      { id: 'tl-ok', slate_id: 's-ok', script_version_id: 'v1', start_element_id: 'e1', end_element_id: 'e1', carried_from_id: null },
      { id: 'tl-gone', slate_id: 's-gone', script_version_id: 'v1', start_element_id: 'e1', end_element_id: 'e1', carried_from_id: null },
      { id: 'tl-carried', slate_id: 's-ok', script_version_id: 'v2', start_element_id: 'e1', end_element_id: 'e1', carried_from_id: 'tl-gone' },
    ]

    const out = pruneOrphanedApfRows(t)
    expect(out.script_versions.map((r) => r.previous_script_version_id)).toEqual([null, 'v1', null])
    expect(out.tramlines.map((r) => r.id)).toEqual(['tl-ok', 'tl-carried'])
    expect(out.tramlines.find((r) => r.id === 'tl-carried')!.carried_from_id).toBeNull()
  })

  it('does not mutate its input', () => {
    const t = emptyApfTables()
    t.slates = [{ id: 's1', shoot_day_id: 'missing' }]
    pruneOrphanedApfRows(t)
    expect(t.slates).toHaveLength(1)
  })
})
