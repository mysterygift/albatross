// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PageHeader } from '@/components/page-header'

afterEach(cleanup)

describe('PageHeader', () => {
  it('renders a single h1 with description, actions and tabs', () => {
    const { container } = render(
      <PageHeader title="Budget" description="All costs" actions={<button>Add</button>} tabs={<div>Tabs here</div>} />
    )
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Budget')
    expect(screen.getByText('All costs')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(screen.getByText('Tabs here')).toBeTruthy()
    expect(container.querySelector('[data-slot="page-header"]')).toBeTruthy()
  })

  it('omits optional parts', () => {
    const { container } = render(<PageHeader title="Only" />)
    expect(container.querySelector('p')).toBeNull()
  })
})
