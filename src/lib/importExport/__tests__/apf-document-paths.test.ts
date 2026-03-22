import { describe, expect, it } from 'vitest'

import { apfDocumentBundledZipPath, apfSanitizeDocumentBasename } from '@/lib/importExport/documentPaths'
import { importedDocumentRelativePath } from '@/lib/importExport/extractApfDocumentsForImport'
import { TEST_DOCUMENT_ID, TEST_PRODUCTION_ID } from '@/test/apf/fixtures'

describe('apfSanitizeDocumentBasename', () => {
  it('strips path segments from file name', () => {
    expect(apfSanitizeDocumentBasename('../../etc/passwd')).toBe('.._.._etc_passwd')
  })
})

describe('apfDocumentBundledZipPath', () => {
  it('uses files/documents prefix', () => {
    expect(apfDocumentBundledZipPath('abc', 'x.pdf')).toBe('files/documents/abc/x.pdf')
  })
})

describe('importedDocumentRelativePath', () => {
  it('matches attachments/<productionId>/<documentId>-<basename> layout', () => {
    expect(importedDocumentRelativePath(TEST_PRODUCTION_ID, TEST_DOCUMENT_ID, 'spec.pdf')).toBe(
      `attachments/${TEST_PRODUCTION_ID}/${TEST_DOCUMENT_ID}-spec.pdf`
    )
  })
})
