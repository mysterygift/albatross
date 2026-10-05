import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'

describe('applyRecipientNameWatermarkToPDF', () => {
  it('watermarks a recipient whose name has letters outside WinAnsi', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const base = await doc.save()
    // Distributing to this recipient used to fail with "WinAnsi cannot encode "Č" (0x010c)".
    const out = await applyRecipientNameWatermarkToPDF(base, { recipientFullName: 'Tomáš Čech' })
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })
})
