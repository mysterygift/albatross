import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_ENTITY_TYPES,
  getDocumentCategoryId,
  getDocumentTypeLabel,
  getManualUploadEntityType,
  isDocumentCategorySlug,
} from '@/lib/documents/catalog'

describe('document catalog', () => {
  it('maps entity types to categories', () => {
    expect(getDocumentCategoryId(null)).toBe('general')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.script)).toBe('schedule')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.sidesExport)).toBe('schedule')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.callSheet)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.movementOrderPersonalized)).toBe(
      'set-paperwork'
    )
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.contributorForm)).toBe('people-locations')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.deliverable)).toBe('deliverables')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.cueSheet)).toBe('music')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.budgetCsv)).toBe('finance')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.doodPdf)).toBe('production-lists')
  })

  it('provides human-readable type labels', () => {
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.sidesExport)).toBe('Shoot-day sides')
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.budgetCsv)).toBe('Budget CSV')
    expect(getDocumentTypeLabel(null)).toBe('General upload')
  })

  it('validates category slugs', () => {
    expect(isDocumentCategorySlug('schedule')).toBe(true)
    expect(isDocumentCategorySlug('not-a-category')).toBe(false)
    expect(DOCUMENT_CATEGORIES.length).toBe(8)
  })

  it('maps manual upload entity types to categories', () => {
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.manualUploadSchedule)).toBe('schedule')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.manualUploadFinance)).toBe('finance')
    expect(getManualUploadEntityType('general')).toBe(null)
    expect(getManualUploadEntityType('deliverables')).toBe(
      DOCUMENT_ENTITY_TYPES.manualUploadDeliverable
    )
  })
})
