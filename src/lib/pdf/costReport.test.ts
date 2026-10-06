import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { generateCostReportPDF, type CostReportData, type CostReportRow } from '@/lib/pdf/costReport'
import { PAPER_SIZES } from '@/lib/pdf/layoutKit'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'

const gbp = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)

const row = (over: Partial<CostReportRow>): CostReportRow => ({
  kind: 'account',
  code: '1000',
  name: 'Story and rights',
  depth: 0,
  isRollup: false,
  archived: false,
  bandHex: '#9DBBAA',
  detail: null,
  budget: 1000,
  actual: 400,
  variance: 600,
  percentSpent: 0.4,
  ...over,
})

function report(over: Partial<CostReportData> = {}): CostReportData {
  return {
    productionName: 'The Long Production Title',
    revisionLabel: 'Revision 2 | Live',
    generatedAt: '2026-10-13T18:40:00',
    layout: 'chart',
    currency: 'GBP',
    openAllowCount: 0,
    totalEstimated: 125000,
    totalActual: 40000,
    variance: 85000,
    uncodedTotal: 0,
    sections: [
      {
        title: 'Chart of accounts',
        rows: [
          row({ code: '1000', name: 'Above the line', isRollup: true, budget: 50000, actual: 20000 }),
          row({ code: '1100', name: 'Writers', depth: 1, detail: '(2 line items)' }),
          row({ code: '1200', name: 'Overspent account', depth: 1, budget: 100, actual: 250, variance: -150, percentSpent: 2.5 }),
        ],
      },
    ],
    emptyMessage: 'No accounts yet.',
    subtotals: [{ name: 'Above the line', budget: 50000, actual: 20000, variance: 30000 }],
    subtotalBeforeDerived: { name: 'Subtotal before derived', budget: 50000, actual: 20000, variance: 30000 },
    derived: { fringes: 5000, contingency: 2500 },
    taxCredits: null,
    vatReclaim: null,
    totals: {
      budgetInclDerived: 132500,
      actual: 40000,
      variance: 85000,
      netCostAfterCredits: null,
      totalVat: null,
    },
    ...over,
  }
}

const generate = (data: CostReportData, paperSize?: 'a4' | 'letter') =>
  generateCostReportPDF(data, { formatAmount: gbp, paperSize })

describe('generateCostReportPDF', () => {
  it('prints the masthead, headline strip, ledger, subtotals, derived and final totals', async () => {
    const text = await extractPdfText(await generate(report()))
    expect(text).toContain('COST REPORT')
    expect(text).toContain('The Long Production Title')
    expect(text).toContain('Revision 2 | Live | Chart of accounts | Amounts in GBP')
    expect(text).toContain('Generated 13 Oct 2026 18:40')
    expect(text).toContain('£125,000.00')
    expect(text).toContain('Above the line')
    expect(text).toContain('Writers')
    expect(text).toContain('(2 line items)')
    expect(text).toContain('40%')
    expect(text).toContain('Subtotal before derived')
    expect(text).toContain('Fringes (derived)')
    expect(text).toContain('Contingency (derived)')
    expect(text).toContain('Total budget incl. derived')
    expect(text).toContain('£132,500.00')
    expect(text).toContain('Variance vs estimated')
    expect(text).toContain('CONFIDENTIAL - DO NOT SHARE.')
    expect(text).toContain('Page 1 of 1')
  })

  it('draws real text rather than a rasterised page', async () => {
    const doc = await PDFDocument.load(await generate(report()))
    expect(doc.getPageCount()).toBe(1)
    const text = await extractPdfText(await doc.save())
    expect(text.length).toBeGreaterThan(200)
  })

  it('uses A4 by default and US Letter on request', async () => {
    const a4 = await PDFDocument.load(await generate(report()))
    expect(a4.getPage(0).getSize()).toEqual({ width: PAPER_SIZES.a4.width, height: PAPER_SIZES.a4.height })
    const letter = await PDFDocument.load(await generate(report(), 'letter'))
    expect(letter.getPage(0).getSize()).toEqual({
      width: PAPER_SIZES.letter.width,
      height: PAPER_SIZES.letter.height,
    })
  })

  it('wraps long account names instead of cutting them off', async () => {
    const name =
      'Supporting artists and background action including crowd extras for the carnival sequence'
    const text = await extractPdfText(
      await generate(report({ sections: [{ title: 'Chart of accounts', rows: [row({ name })] }] }))
    )
    for (const word of name.split(' ')) expect(text).toContain(word)
    expect(text).not.toContain('...')
  })

  it('paginates long ledgers with a repeated header, running header and page numbers', async () => {
    const rows = Array.from({ length: 150 }, (_, i) =>
      row({ code: String(2000 + i), name: `Account number ${i}` })
    )
    const bytes = await generate(report({ sections: [{ title: 'Chart of accounts', rows }] }))
    const pages = (await PDFDocument.load(bytes)).getPageCount()
    expect(pages).toBeGreaterThan(2)
    const text = await extractPdfText(bytes)
    expect(text).toContain(`Page ${pages} of ${pages}`)
    expect(text).toContain('Account number 149')
    // The running header appears on every continuation page.
    expect(text.split('COST REPORT | Revision 2 | Live').length - 1).toBe(pages - 1)
  })

  it('shows group blocks with a group total and uncoded spend', async () => {
    const data = report({
      layout: 'groups',
      uncodedTotal: 120,
      sections: [
        {
          title: 'A - Story',
          rows: [
            row({ code: '1100', name: 'Writers' }),
            row({ kind: 'total', code: '', name: 'Group total', budget: 1000, actual: 400, variance: 600 }),
          ],
        },
        { title: 'Uncoded spend', rows: [row({ code: '-', name: 'Uncoded spend', budget: null, actual: 120, variance: null, percentSpent: null })] },
      ],
    })
    const text = await extractPdfText(await generate(data))
    expect(text).toContain('By groups')
    expect(text).toContain('A - STORY')
    expect(text).toContain('Group total')
    expect(text).toContain('UNCODED SPEND')
    expect(text).toContain('Uncoded spend £120.00')
  })

  it('lists expanded line items with only their estimate', async () => {
    const data = report({
      sections: [
        {
          title: 'Chart of accounts',
          rows: [
            row({ detail: '(1 line item)' }),
            row({ kind: 'lineItem', code: '', name: 'Option fee', budget: 750, actual: null, variance: null, percentSpent: null }),
          ],
        },
      ],
    })
    const text = await extractPdfText(await generate(data))
    expect(text).toContain('Option fee')
    expect(text).toContain('£750.00')
  })

  it('prints tax credits, warnings, VAT reclaim and the net cost lines when present', async () => {
    const data = report({
      taxCredits: {
        schemes: [{ name: 'AVEC', qualifyingSpend: 30000, creditAmount: 7500 }],
        warnings: ['Below minimum UK spend'],
        totalQualifyingSpend: 30000,
        totalTaxCredits: 7500,
        netCostAfterCredits: 32500,
      },
      vatReclaim: { paid: 8000, reclaimable: 6000, reclaimed: 2000, outstanding: 4000 },
      totals: {
        budgetInclDerived: 132500,
        actual: 40000,
        variance: 85000,
        netCostAfterCredits: 32500,
        totalVat: 8000,
      },
    })
    const text = await extractPdfText(await generate(data))
    expect(text).toContain('TAX CREDITS & RELIEF')
    expect(text).toContain('AVEC')
    expect(text).toContain('Below minimum UK spend')
    expect(text).toContain('VAT RECLAIM')
    expect(text).toContain('£4,000.00')
    expect(text).toContain('Net cost after tax credits')
    expect(text).toContain('Total VAT (informational)')
  })

  it('omits the optional sections when there is nothing to show', async () => {
    const data = report({
      subtotals: [],
      subtotalBeforeDerived: null,
      derived: { fringes: 0, contingency: 0 },
    })
    const text = await extractPdfText(await generate(data))
    expect(text).not.toContain('SUBTOTALS')
    expect(text).not.toContain('DERIVED')
    expect(text).not.toContain('TAX CREDITS')
    expect(text).not.toContain('VAT RECLAIM')
    expect(text).not.toContain('Open allows')
  })

  it('shows open allows and the empty message when no accounts exist', async () => {
    const text = await extractPdfText(
      await generate(report({ openAllowCount: 3, sections: [] }))
    )
    expect(text).toContain('OPEN ALLOWS')
    expect(text).toContain('No accounts yet.')
  })

  it('keeps euro amounts readable', async () => {
    const eur = (n: number) =>
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
    const text = await extractPdfText(
      await generateCostReportPDF(report({ currency: 'EUR' }), { formatAmount: eur })
    )
    expect(text).toContain('125.000,00 EUR')
    expect(text).not.toContain('125.000,00 .')
  })
})
