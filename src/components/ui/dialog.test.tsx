// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

describe('DialogContent dismissOnOutsideInteraction', () => {
  it('does not close when pointer-down occurs outside by default', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Test dialog</DialogTitle>
          <p>Form content</p>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByText('Form content')).toBeTruthy()

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).toBeTruthy()
    await user.pointer({ keys: '[MouseLeft>]', target: overlay! })

    expect(onOpenChange).not.toHaveBeenCalled()
    cleanup()
  })

  it('closes on outside pointer-down when dismissOnOutsideInteraction is enabled', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent dismissOnOutsideInteraction aria-describedby={undefined}>
          <DialogTitle>Palette</DialogTitle>
          <p>Search</p>
        </DialogContent>
      </Dialog>
    )

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).toBeTruthy()
    await user.pointer({ keys: '[MouseLeft>]', target: overlay! })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    cleanup()
  })
})
