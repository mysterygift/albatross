import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findNavTrail, isNavGroup, navGroups, navItems } from '@/app/navigation'

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
  })

  it('returns null for unknown paths', () => {
    expect(findNavTrail('/nope')).toBeNull()
  })
})
