// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardCard } from '@/components/dashboard-card'

afterEach(cleanup)

describe('DashboardCard', () => {
  it('loading shows 3 skeleton rows and hides children', () => {
    const { container } = render(<DashboardCard title="T" status="loading"><p>kids</p></DashboardCard>)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
    expect(screen.queryByText('kids')).toBeNull()
  })

  it('error shows message and retry', async () => {
    const onRetry = vi.fn()
    render(<DashboardCard title="T" status="error" errorMessage="Failed" onRetry={onRetry}><p>kids</p></DashboardCard>)
    expect(screen.getByText('Failed')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('kids')).toBeNull()
  })

  it('empty shows message', () => {
    render(<DashboardCard title="T" status="empty" emptyMessage="Nada"><p>kids</p></DashboardCard>)
    expect(screen.getByText('Nada')).toBeTruthy()
    expect(screen.queryByText('kids')).toBeNull()
  })

  it('ready shows children and action', () => {
    render(<DashboardCard title="T" status="ready" action={<a href="#x">More</a>}><p>kids</p></DashboardCard>)
    expect(screen.getByText('kids')).toBeTruthy()
    expect(screen.getByText('More')).toBeTruthy()
  })
})
