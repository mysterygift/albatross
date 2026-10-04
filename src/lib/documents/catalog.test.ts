import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_ENTITY_TYPES,
  getDocumentCategoryId,
  getDocumentSourceRoute,
  getDocumentTypeLabel,
  getManualUploadEntityType,
  isDeletableDocument,
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
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.riskAssessment)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.dailyProgressReport)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.continuityPhoto)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.continuitySheets)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.editorsLog)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.markedUpScript)).toBe('set-paperwork')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.contributorForm)).toBe('people-locations')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.permit)).toBe('people-locations')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.locationRelease)).toBe('people-locations')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.deliverable)).toBe('deliverables')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.cueSheet)).toBe('music')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.budgetCsv)).toBe('finance')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.expenseReceipt)).toBe('finance')
    expect(getDocumentCategoryId(DOCUMENT_ENTITY_TYPES.doodPdf)).toBe('production-lists')
  })

  it('provides human-readable type labels', () => {
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.sidesExport)).toBe('Shoot-day sides')
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.budgetCsv)).toBe('Budget CSV')
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.expenseReceipt)).toBe('Expense receipt')
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.permit)).toBe('Permit')
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.riskAssessment)).toBe('Risk assessment')
    expect(getDocumentTypeLabel(DOCUMENT_ENTITY_TYPES.markedUpScript)).toBe('Marked-up script')
    expect(getDocumentTypeLabel(null)).toBe('General upload')
  })

  it('links location documents back to the locations page', () => {
    expect(getDocumentSourceRoute(DOCUMENT_ENTITY_TYPES.permit)).toBe('/locations')
    expect(getDocumentSourceRoute(DOCUMENT_ENTITY_TYPES.locationRelease)).toBe('/locations')
    expect(getDocumentSourceRoute(DOCUMENT_ENTITY_TYPES.contributorForm)).toBe('/people/cast-manager')
  })

  it('links risk assessment documents back to the risk assessments page', () => {
    expect(getDocumentSourceRoute(DOCUMENT_ENTITY_TYPES.riskAssessment)).toBe('/risk-assessments')
    expect(getDocumentSourceRoute(DOCUMENT_ENTITY_TYPES.callSheet)).toBe('/call-sheets')
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

  it('allows deleting general uploads, manual uploads, and finance, music and set paperwork documents', () => {
    const T = DOCUMENT_ENTITY_TYPES
    const deletable = [
      null,
      T.budgetCsv,
      T.costReportPdf,
      T.vendorInvoice,
      T.vendorPurchaseOrder,
      T.expenseReceipt,
      T.cueSheet,
      T.callSheet,
      T.callSheetPersonalized,
      T.movementOrder,
      T.movementOrderPersonalized,
      T.riskAssessment,
      T.manualUploadSchedule,
      T.manualUploadDeliverable,
    ]
    for (const entityType of deletable) expect(isDeletableDocument(entityType)).toBe(true)
  })

  it('keeps other generated documents and unknown types non-deletable', () => {
    const T = DOCUMENT_ENTITY_TYPES
    const kept = [T.script, T.sidesExport, T.deliverable, T.locationRelease, T.permit, T.doodPdf]
    for (const entityType of kept) expect(isDeletableDocument(entityType)).toBe(false)
    expect(isDeletableDocument('something_new')).toBe(false)
  })
})
