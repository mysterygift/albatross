// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog, useConfirm } from '@/components/ui/confirm-dialog'

afterEach(cleanup)

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onOpenChange = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog open onOpenChange={onOpenChange} title="Delete?" description="Cannot undo" onConfirm={onConfirm} {...props} />
  )
  return { onOpenChange, onConfirm }
}

describe('ConfirmDialog', () => {
  it('confirms and closes', async () => {
    const { onOpenChange, onConfirm } = setup()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancels without confirming', async () => {
    const { onOpenChange, onConfirm } = setup({ cancelLabel: 'Nope' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nope' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('uses destructive variant', () => {
    setup({ destructive: true, confirmLabel: 'Delete' })
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.className).toContain('destructive')
  })

  it('disables buttons while pending', async () => {
    let release!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = r }))
    const { onOpenChange } = setup({ onConfirm })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }))
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('stays open when onConfirm throws', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('boom')))
    const { onOpenChange } = setup({ onConfirm })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false))
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('useConfirm', () => {
  function Harness({ onResult }: { onResult: (v: boolean) => void }) {
    const { confirm, dialog } = useConfirm()
    return (
      <>
        <button onClick={() => void confirm({ title: 'Sure?' }).then(onResult)}>ask</button>
        {dialog}
      </>
    )
  }

  it('resolves true on confirm', async () => {
    const onResult = vi.fn()
    const user = userEvent.setup()
    render(<Harness onResult={onResult} />)
    await user.click(screen.getByText('ask'))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
  })

  it('resolves false on cancel', async () => {
    const onResult = vi.fn()
    const user = userEvent.setup()
    render(<Harness onResult={onResult} />)
    await user.click(screen.getByText('ask'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
  })
})
