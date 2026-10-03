// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inbox } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

afterEach(cleanup)

describe('EmptyState', () => {
  it('renders title, description and handles action click', async () => {
    const onClick = vi.fn()
    render(
      <EmptyState icon={Inbox} title="Nothing here" description="Add something" action={<button onClick={onClick}>Add</button>} />
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Nothing here')).toBeTruthy()
    expect(screen.getByText('Add something')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
