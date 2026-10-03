// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardHero } from './DashboardHero'
import { buildAttentionItems } from './attentionItems'
import type { DashboardNextShootDayData } from '@/lib/dashboard/nextShootDay'

afterEach(cleanup)

const today = '2026-10-03'
const risk = (id: string, severity: 'warning' | 'critical') => ({ id, severity, title: `Risk ${id}`, href: `/budget/vendors?r=${id}` })

describe('buildAttentionItems', () => {
  it('returns nothing when everything is fine', () => {
    expect(buildAttentionItems({ requiredTasks: [], riskItems: [], deliverables: [], today })).toEqual([])
  })

  it('orders critical risks, overdue deliverables, required tasks, then other risks and caps at 3', () => {
    const items = buildAttentionItems({
      requiredTasks: [{ id: 't1', description: 'Insurance' }],
      riskItems: [risk('w', 'warning'), risk('c', 'critical')],
      deliverables: [
        { id: 'd1', name: 'Trailer', due_date: '2026-09-01', status: 'pending' },
        { id: 'd2', name: 'Done', due_date: '2026-09-01', status: 'delivered' },
        { id: 'd3', name: 'Future', due_date: '2026-12-01', status: 'pending' },
      ],
      today,
    })
    expect(items.map((i) => i.id)).toEqual(['risk-c', 'deliverable-d1', 'task-t1'])
    expect(items[0].href).toBe('/budget/vendors?r=c')
    expect(items[1].href).toBe('/deliverables')
    expect(items[2].href).toBe('/tasks')
  })

  it('falls back to the vendors page when a risk has no href', () => {
    const [item] = buildAttentionItems({
      requiredTasks: [],
      riskItems: [{ id: 'x', severity: 'critical', title: 'X', href: null }],
      deliverables: [],
      today,
    })
    expect(item.href).toBe('/budget/vendors')
  })
})

function renderHero(props: Partial<React.ComponentProps<typeof DashboardHero>>) {
  return render(
    <MemoryRouter>
      <DashboardHero nextShootDay={null} nextShootDayLoading={false} attentionItems={[]} {...props} />
    </MemoryRouter>
  )
}

describe('DashboardHero', () => {
  it('shows an empty state with a stripboard link and "All clear"', () => {
    renderHero({})
    expect(screen.getByText('No upcoming shoot days')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open stripboard' }).getAttribute('href')).toBe('/schedule/stripboard')
    expect(screen.getByText('All clear')).toBeTruthy()
  })

  it('shows a skeleton while loading', () => {
    renderHero({ nextShootDayLoading: true })
    expect(screen.getByTestId('dashboard-hero-loading')).toBeTruthy()
  })

  it('renders the next shoot day and attention links', () => {
    const data = {
      shootDay: { shoot_date: '2026-10-10', day_number: 4, call_time: '07:00', wrap_time: '18:00' },
      events: [{ shotCount: 5 }, { shotCount: 2 }],
      strips: [],
      scenes: [],
      shots: [],
    } as unknown as DashboardNextShootDayData
    renderHero({
      nextShootDay: data,
      attentionItems: [{ id: 'task-1', label: 'Required task: Insurance', href: '/tasks', severity: 'warning' }],
    })
    expect(screen.getByText('Shoot Day 4')).toBeTruthy()
    expect(screen.getByText('7 shots')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View in calendar' }).getAttribute('href')).toBe('/schedule/calendar')
    expect(screen.getByRole('link', { name: /Insurance/ }).getAttribute('href')).toBe('/tasks')
    expect(screen.queryByText('All clear')).toBeNull()
  })
})
