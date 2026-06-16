import { describe, expect, it } from 'vitest'

import type { Document } from '@/lib/db/types'
import {
  groupEnrichedDocuments,
  partitionDocumentsByCategory,
  type EnrichedDocument,
} from '@/lib/documents/enrichDocuments'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'

function doc(partial: Partial<Document> & Pick<Document, 'id' | 'entity_type'>): EnrichedDocument {
  return {
    id: partial.id,
    production_id: partial.production_id ?? 'prod-1',
    entity_type: partial.entity_type,
    entity_id: partial.entity_id ?? null,
    file_name: partial.file_name ?? `${partial.id}.pdf`,
    file_path: partial.file_path ?? `attachments/${partial.id}.pdf`,
    mime_type: partial.mime_type ?? 'application/pdf',
    created_at: partial.created_at ?? '2026-06-01T12:00:00Z',
    updated_at: partial.updated_at ?? '2026-06-01T12:00:00Z',
    deleted_at: partial.deleted_at ?? null,
    categoryId: 'general',
    typeLabel: 'General upload',
    contextLabel: null,
    groupKey: 'ungrouped',
    groupTitle: 'Other',
    groupSortKey: partial.created_at ?? '2026-06-01T12:00:00Z',
  }
}

describe('enrichDocuments grouping helpers', () => {
  it('partitions documents by category', () => {
    const docs: EnrichedDocument[] = [
      { ...doc({ id: 'a', entity_type: null }), categoryId: 'general' },
      { ...doc({ id: 'b', entity_type: DOCUMENT_ENTITY_TYPES.script }), categoryId: 'schedule' },
      { ...doc({ id: 'c', entity_type: DOCUMENT_ENTITY_TYPES.deliverable }), categoryId: 'deliverables' },
    ]
    const map = partitionDocumentsByCategory(docs)
    expect(map.get('general')).toHaveLength(1)
    expect(map.get('schedule')).toHaveLength(1)
    expect(map.get('deliverables')).toHaveLength(1)
  })

  it('groups enriched documents by groupKey', () => {
    const docs: EnrichedDocument[] = [
      {
        ...doc({ id: '1', entity_type: DOCUMENT_ENTITY_TYPES.sidesExport }),
        categoryId: 'schedule',
        groupKey: 'day-1',
        groupTitle: 'Day 1 — 2026-06-01',
        groupSortKey: '2026-06-01',
      },
      {
        ...doc({ id: '2', entity_type: DOCUMENT_ENTITY_TYPES.sidesExport }),
        categoryId: 'schedule',
        groupKey: 'day-1',
        groupTitle: 'Day 1 — 2026-06-01',
        groupSortKey: '2026-06-01',
      },
      {
        ...doc({ id: '3', entity_type: DOCUMENT_ENTITY_TYPES.script }),
        categoryId: 'schedule',
        groupKey: 'script',
        groupTitle: 'Scripts',
        groupSortKey: '2026-06-01T12:00:00Z',
      },
    ]
    const groups = groupEnrichedDocuments(docs)
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.groupKey === 'day-1')?.documents).toHaveLength(2)
  })
})
