// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwipeToDeleteRow } from './SwipeToDeleteRow'

function Harness({ onDelete, onSelect }: { onDelete: () => void; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <SwipeToDeleteRow open={open} onOpenChange={setOpen} onDelete={onDelete} deleteLabel="Delete slate 1A">
      <button type="button" onClick={onSelect}>
        Slate 1A
      </button>
    </SwipeToDeleteRow>
  )
}

function swipe(el: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(el, { clientX: from, clientY: 10, pointerId: 1, pointerType: 'touch' })
  fireEvent.pointerMove(el, { clientX: to, clientY: 12, pointerId: 1, pointerType: 'touch' })
  fireEvent.pointerUp(el, { clientX: to, clientY: 12, pointerId: 1, pointerType: 'touch' })
}

describe('SwipeToDeleteRow', () => {
  afterEach(cleanup)

  it('reveals Delete on a left swipe without selecting the row, and closes on a tap', () => {
    const onDelete = vi.fn()
    const onSelect = vi.fn()
    const { container } = render(<Harness onDelete={onDelete} onSelect={onSelect} />)
    const row = container.querySelector('[data-slot="swipe-row"]') as HTMLElement
    expect(screen.queryByRole('button', { name: 'Delete slate 1A' })).toBeNull()

    swipe(row, 200, 80)
    fireEvent.click(screen.getByText('Slate 1A'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(row.style.transform).toBe('translateX(-96px)')

    fireEvent.click(screen.getByText('Slate 1A'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(row.style.transform).toBe('translateX(0px)')

    fireEvent.click(screen.getByText('Slate 1A'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete from the revealed action and ignores short or vertical drags', () => {
    const onDelete = vi.fn()
    const { container } = render(<Harness onDelete={onDelete} onSelect={vi.fn()} />)
    const row = container.querySelector('[data-slot="swipe-row"]') as HTMLElement

    swipe(row, 200, 190)
    expect(row.style.transform).toBe('translateX(0px)')

    swipe(row, 200, 80)
    fireEvent.click(screen.getByRole('button', { name: 'Delete slate 1A' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
