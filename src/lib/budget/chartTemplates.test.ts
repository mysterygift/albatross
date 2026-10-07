import { describe, expect, it } from 'vitest'
import type { BudgetAccount } from '@/lib/db/types'
import { BBC_CHART_TEMPLATE } from './bbcChartTemplate'
import { CHART_TEMPLATES, planChartTemplate, type ChartTemplate } from './chartTemplates'

function account(id: string, code: string, opts: Partial<BudgetAccount> = {}): BudgetAccount {
  return {
    id,
    production_id: 'p1',
    code,
    name: `Account ${code}`,
    parent_account_id: null,
    sort_order: 0,
    is_postable: false,
    color_hex: null,
    archived_at: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...opts,
  }
}

const TINY: ChartTemplate = {
  id: 'standard',
  name: 'Tiny',
  description: '',
  accounts: [
    { code: '100', name: 'ATL', parentCode: null, isPostable: false },
    { code: '110', name: 'Producers', parentCode: '100', isPostable: false },
    { code: '1101', name: 'Producer', parentCode: '110', isPostable: true },
    { code: '200', name: 'BTL', parentCode: null, isPostable: false },
    { code: '2001', name: 'Crew', parentCode: '200', isPostable: true },
  ],
  totals: [],
  fringes: [],
}

describe.each(CHART_TEMPLATES)('$name template structure', (template) => {
  it('has unique codes, integer codes and parents defined before children as headers', () => {
    const seen = new Map<string, boolean>()
    for (const t of template.accounts) {
      expect(seen.has(t.code), `duplicate ${t.code}`).toBe(false)
      expect(t.code).toMatch(/^\d+$/)
      if (t.parentCode != null) {
        expect(seen.get(t.parentCode), `${t.code} parent ${t.parentCode}`).toBe(false)
      }
      seen.set(t.code, t.isPostable)
    }
  })

  it('points totals at header accounts and fringes at postable accounts', () => {
    const byCode = new Map(template.accounts.map((t) => [t.code, t]))
    for (const total of template.totals) {
      for (const code of total.headerCodes) expect(byCode.get(code)?.isPostable).toBe(false)
    }
    for (const fringe of template.fringes) {
      expect(fringe.accountCodes.length).toBeGreaterThan(0)
      for (const code of fringe.accountCodes) expect(byCode.get(code)?.isPostable).toBe(true)
    }
  })
})

describe('BBC template', () => {
  const byCode = new Map(BBC_CHART_TEMPLATE.accounts.map((t) => [t.code, t]))
  const namesUnder = (sectionName: string) => {
    const section = BBC_CHART_TEMPLATE.accounts.find((t) => t.name === sectionName)!
    return BBC_CHART_TEMPLATE.accounts.filter((t) => t.parentCode === section.code).map((t) => t.name)
  }

  it('has the 100–600 series at the top level', () => {
    const roots = BBC_CHART_TEMPLATE.accounts.filter((t) => t.parentCode == null).map((t) => t.code)
    expect(roots).toEqual(['100', '200', '300', '400', '500', '600'])
  })

  it('codes lines inside their section range', () => {
    for (const t of BBC_CHART_TEMPLATE.accounts.filter((a) => a.isPostable)) {
      const section = Number(t.parentCode)
      expect(Number(t.code)).toBeGreaterThan(section * 10)
      expect(Number(t.code)).toBeLessThan(section * 10 + 100)
    }
  })

  it('names the BBC TX deliverables and the BFI Archive Copy', () => {
    expect(namesUnder('BBC TX Deliverables')).toEqual(
      expect.arrayContaining(['Quality Assessment Reviews', 'WGBH Deliverables', 'Textless Title Prints', 'BFI Archive Copy'])
    )
    expect(byCode.get(BBC_CHART_TEMPLATE.accounts.find((t) => t.name === 'BBC TX Deliverables')!.parentCode!)?.code).toBe('600')
  })

  it('splits camera, lighting and sound into crew and equipment sections', () => {
    for (const dept of ['Camera', 'Lighting', 'Sound']) {
      expect(namesUnder(`${dept} Crew`).length).toBeGreaterThan(0)
      expect(namesUnder(`${dept} Equipment`).length).toBeGreaterThan(0)
    }
    expect(BBC_CHART_TEMPLATE.accounts.find((t) => t.name === 'Foreign Unit Crew & Equipment')?.parentCode).toBe('400')
  })

  it('applies NI per category to pay lines only', () => {
    const fringeNames = BBC_CHART_TEMPLATE.fringes.map((f) => f.name)
    expect(fringeNames).toEqual(expect.arrayContaining(['Producer NI', 'Artists NI', 'Camera Crew NI', 'Lighting Crew NI', 'Sound Crew NI']))
    const niCodes = new Set(BBC_CHART_TEMPLATE.fringes.flatMap((f) => f.accountCodes))
    const nameOf = (code: string) => byCode.get(code)!.name
    const niNames = [...niCodes].map(nameOf)
    expect(niNames).toEqual(expect.arrayContaining(['Producer', 'Lead Artists', 'Director of Photography', 'Gaffer', 'Production Designer']))
    for (const notPay of ['Camera Package', 'Lighting Package', 'Set Construction', 'Costume Purchase & Hire', 'BFI Archive Copy']) {
      expect(niNames).not.toContain(notPay)
    }
    // Every NI'd line belongs to exactly one rule.
    const total = BBC_CHART_TEMPLATE.fringes.reduce((n, f) => n + f.accountCodes.length, 0)
    expect(total).toBe(niCodes.size)
  })
})

describe('planChartTemplate', () => {
  it('merge adds only missing accounts and keeps everything else', () => {
    const existing = [account('a100', '100'), account('a9', '900'), account('a91', '9001', { parent_account_id: 'a9', is_postable: true })]
    const plan = planChartTemplate(existing, new Set(), TINY, 'merge')
    expect(plan.add.map((t) => t.code)).toEqual(['110', '1101', '200', '2001'])
    expect(plan.remove).toEqual([])
    expect(plan.rename).toEqual([])
    expect(plan.keep.map((a) => a.code)).toEqual(['900', '9001'])
  })

  it('replace removes unused accounts outside the template, children first, and keeps posted ones', () => {
    const existing = [
      account('a9', '900'),
      account('a91', '9001', { parent_account_id: 'a9', is_postable: true }),
      account('a8', '800'),
      account('a81', '8001', { parent_account_id: 'a8', is_postable: true }),
      account('a7', '700'),
    ]
    const plan = planChartTemplate(existing, new Set(['a81']), TINY, 'replace')
    expect(plan.remove.map((a) => a.code)).toEqual(['9001', '900', '700'])
    expect(plan.keep.map((a) => a.code)).toEqual(['800', '8001'])
    expect(plan.add.map((t) => t.code)).toEqual(['100', '110', '1101', '200', '2001'])
  })

  it('replace keeps and renames accounts that already sit where the template puts them', () => {
    const existing = [
      account('a1', '100', { name: 'Old ATL' }),
      account('a11', '110', { parent_account_id: 'a1', name: 'Producers' }),
    ]
    const plan = planChartTemplate(existing, new Set(), TINY, 'replace')
    expect(plan.remove).toEqual([])
    expect(plan.rename).toEqual([{ account: existing[0], name: 'ATL' }])
    expect(plan.add.map((t) => t.code)).toEqual(['1101', '200', '2001'])
  })

  it('replace removes a same-code account in the wrong place when it is unused', () => {
    const existing = [account('a5', '500'), account('a1', '100', { parent_account_id: 'a5' })]
    const plan = planChartTemplate(existing, new Set(), TINY, 'replace')
    expect(plan.remove.map((a) => a.code)).toEqual(['100', '500'])
    expect(plan.add.map((t) => t.code)).toContain('100')
  })

  it('skips a template code already used elsewhere in the chart, and everything under it', () => {
    const existing = [account('a1', '100'), account('a11', '110', { parent_account_id: 'a1', is_postable: true, name: 'Misc' })]
    const plan = planChartTemplate(existing, new Set(['a11']), TINY, 'merge')
    expect(plan.skipped.map((s) => [s.account.code, s.reason])).toEqual([
      ['110', 'Code 110 is already used by your account “Misc”'],
      ['1101', 'Its parent 110 was skipped'],
    ])
    expect(plan.add.map((t) => t.code)).toEqual(['200', '2001'])
    expect(plan.keep.map((a) => a.code)).toEqual(['110'])
  })
})
