import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { experimentalNavLabels, findNavTrail, isNavGroup, navGroups, navItems, visibleNavGroups } from '@/app/navigation'

const routerSource = readFileSync(resolve(__dirname, 'router.tsx'), 'utf8')
const routePaths = [...routerSource.matchAll(/path: '([^']*)'/g)]
  .map((m) => m[1])
  .filter((p) => p !== '/' && p !== '*')
  .map((p) => '/' + p)
routePaths.push('/')

function routeExists(to: string): boolean {
  return routePaths.some((p) => {
    if (p === to) return true
    const re = new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$')
    return re.test(to)
  })
}

describe('navigation config', () => {
  it('every nav target matches a route', () => {
    for (const item of navItems) {
      expect(routeExists(item.to), item.to).toBe(true)
      if (isNavGroup(item)) {
        expect(routeExists(item.defaultChild), item.defaultChild).toBe(true)
        for (const s of item.sub) expect(routeExists(s.to), s.to).toBe(true)
      }
    }
  })

  it('has no duplicate top-level targets or sub targets', () => {
    const tops = navItems.map((i) => i.to)
    expect(new Set(tops).size).toBe(tops.length)
    const subs = navItems.flatMap((i) => (isNavGroup(i) ? i.sub.map((s) => s.to) : []))
    expect(new Set(subs).size).toBe(subs.length)
  })

  it('has unique group ids and distinct Tasks/Deliverables icons', () => {
    const ids = navGroups.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    const tasks = navItems.find((i) => i.to === '/tasks')
    const deliverables = navItems.find((i) => i.to === '/deliverables')
    expect(tasks?.icon).toBeDefined()
    expect(tasks?.icon).not.toBe(deliverables?.icon)
  })
})

describe('Risk Assessments nav', () => {
  it('sits in the Plan group with the list and editor routes registered', () => {
    const plan = navGroups.find((g) => g.id === 'plan')
    expect(plan?.items.map((i) => i.to)).toContain('/risk-assessments')
    expect(routeExists('/risk-assessments')).toBe(true)
    expect(routeExists('/risk-assessments/some-id')).toBe(true)
  })
})

describe('findNavTrail', () => {
  it('matches top-level and sub routes', () => {
    expect(findNavTrail('/')?.item.label).toBe('Dashboard')
    expect(findNavTrail('/tasks')?.group.label).toBe('Tasks')
    const t = findNavTrail('/schedule/stripboard')
    expect(t?.group.label).toBe('Plan')
    expect(t?.item.label).toBe('Schedule')
    expect(t?.sub?.label).toBe('Stripboard')
    expect(t?.isDetail).toBe(false)
  })

  it('attributes script routes to Script, not Schedule', () => {
    const t = findNavTrail('/schedule/script-sections')
    expect(t?.item.label).toBe('Script')
    expect(t?.sub?.label).toBe('Script Sections')
  })

  it('falls back to the nearest parent for detail routes', () => {
    const cast = findNavTrail('/people/abc')
    expect(cast?.item.label).toBe('People')
    expect(cast?.sub).toBeUndefined()
    expect(cast?.isDetail).toBe(true)
    expect(findNavTrail('/people/crew/abc')?.item.label).toBe('People')
    const vendor = findNavTrail('/budget/vendors/v1')
    expect(vendor?.sub?.label).toBe('Vendors')
    expect(vendor?.isDetail).toBe(true)
    expect(findNavTrail('/documents/contracts')?.item.label).toBe('Documents')
    const rams = findNavTrail('/risk-assessments/abc')
    expect(rams?.group.label).toBe('Plan')
    expect(rams?.item.label).toBe('Risk Assessments')
    expect(rams?.isDetail).toBe(true)
  })

  it('returns null for unknown paths', () => {
    expect(findNavTrail('/nope')).toBeNull()
  })
})

describe('experimental features', () => {
  const subTargets = (groups: ReturnType<typeof visibleNavGroups>) =>
    groups.flatMap((g) => g.items.flatMap((i) => (isNavGroup(i) ? i.sub.map((s) => s.to) : [i.to])))

  it('marks Receipt Capture, Overtime and Script Supervisor as experimental', () => {
    expect(experimentalNavLabels()).toEqual(['Script: Script Supervisor', 'People: Overtime', 'Budget: Receipt Capture'])
  })

  it('hides experimental entries unless they are shown', () => {
    const hidden = subTargets(visibleNavGroups(false))
    expect(hidden).not.toContain('/schedule/script-supervisor')
    expect(hidden).not.toContain('/people/overtime')
    expect(hidden).not.toContain('/budget/receipt-capture')
    expect(hidden).toContain('/schedule/script-sections')
    expect(hidden).toContain('/budget/vendors')

    const shown = subTargets(visibleNavGroups(true))
    expect(shown).toContain('/schedule/script-supervisor')
    expect(shown).toContain('/people/overtime')
    expect(shown).toContain('/budget/receipt-capture')
  })

  it('keeps experimental routes reachable for breadcrumbs and links', () => {
    expect(findNavTrail('/people/overtime')?.sub?.label).toBe('Overtime')
    expect(findNavTrail('/budget/receipt-capture')?.sub?.label).toBe('Receipt Capture')
    expect(findNavTrail('/schedule/script-supervisor')?.sub?.label).toBe('Script Supervisor')
  })

  it('drops parents and groups left empty, and moves a hidden default child to the first visible one', () => {
    const Icon = navItems[0]!.icon
    const groups = visibleNavGroups(false, [
      {
        id: 'lab',
        label: 'Lab',
        items: [
          { to: '/lab', label: 'Lab', icon: Icon, defaultChild: '/lab/a', sub: [{ to: '/lab/a', label: 'A', experimental: true }] },
        ],
      },
      {
        id: 'mixed',
        label: 'Mixed',
        items: [
          {
            to: '/m',
            label: 'M',
            icon: Icon,
            defaultChild: '/m/x',
            sub: [
              { to: '/m/x', label: 'X', experimental: true },
              { to: '/m/y', label: 'Y' },
            ],
          },
          { to: '/z', label: 'Z', icon: Icon, experimental: true },
        ],
      },
    ])
    expect(groups.map((g) => g.id)).toEqual(['mixed'])
    const m = groups[0]!.items[0]!
    expect(isNavGroup(m) && m.defaultChild).toBe('/m/y')
    expect(groups[0]!.items).toHaveLength(1)
  })
})
