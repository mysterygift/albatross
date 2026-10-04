// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { layoutLinedScript, type LiningElement, type LiningTramline } from '@/lib/script-supervisor/lining'
import { LinedScript, type LiningEditing } from './LinedScript'

const el = (sort_index: number, element_type: LiningElement['element_type'], text: string, character_name: string | null = null): LiningElement => ({
  id: `e${sort_index}`, scene_id: 's23', sort_index, element_type, character_name, text, page_number: '31',
})

const elements = [
  el(0, 'scene_heading', 'INT. EDIT SUITE - NIGHT'),
  el(1, 'action', 'Monitors glow.'),
  el(2, 'dialogue', 'Since lunch.', 'MARCUS'),
  el(3, 'dialogue', 'Every take but one.', 'ELENA'),
]

const master: LiningTramline = {
  id: 't1', slateId: 'sl1', slateLabel: '212', slateCreatedAt: '2026-10-07T10:00', shotType: 'master', shotCode: 'WS',
  description: null, camera: '', printTakeNumbers: [], startElementId: 'e1', endElementId: 'e3', startSortIndex: 1, endSortIndex: 3,
  segments: new Map(),
}

function setup(tramlines: LiningTramline[] = []) {
  const editing: LiningEditing = {
    activeSlateId: 'sl2',
    activeLabel: '213',
    activeShotType: 'single',
    activeHasTramline: false,
    busy: false,
    onDraw: vi.fn(),
    onSetSegment: vi.fn(),
    onCharacterOff: vi.fn(),
    onDeleteTramline: vi.fn(),
  }
  render(
    <MemoryRouter>
      <LinedScript
        layout={layoutLinedScript(elements, tramlines)}
        isLoading={false}
        hasScript
        sceneNumber="23"
        currentSlateId="sl2"
        touch={false}
        editing={editing}
      />
    </MemoryRouter>
  )
  return editing
}

const drawCell = (text: RegExp) => screen.getByRole('button', { name: text })

describe('lining by mouse and touch (SS7)', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('draws a tramline by clicking the first and last lines (mouse)', async () => {
    const user = userEvent.setup()
    const editing = setup()
    await user.click(drawCell(/start at “Monitors glow/))
    await user.click(drawCell(/end at “ELENA: Every take/))
    expect(editing.onDraw).toHaveBeenCalledWith(1, 3)
    // The heading has no draw target.
    expect(screen.queryByRole('button', { name: /INT\. EDIT SUITE/ })).toBeNull()
  })

  it('draws the same tramline by tapping (touch emulation)', () => {
    const editing = setup()
    const tap = (target: HTMLElement, pointerId: number) => {
      fireEvent.pointerDown(target, { pointerType: 'touch', pointerId })
      fireEvent.pointerUp(target, { pointerType: 'touch', pointerId })
      fireEvent.click(target)
    }
    tap(drawCell(/start at “Monitors glow/), 1)
    tap(drawCell(/end at “ELENA: Every take/), 2)
    expect(editing.onDraw).toHaveBeenCalledWith(1, 3)
  })

  it('draws the same tramline by dragging down the lane (touch), without a stray tap afterwards', () => {
    const editing = setup()
    const start = drawCell(/start at “Monitors glow/)
    const end = drawCell(/start at “ELENA: Every take/)
    const original = document.elementFromPoint
    document.elementFromPoint = () => end
    try {
      fireEvent.pointerDown(start, { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 200 })
      fireEvent.pointerMove(start, { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 300 })
      fireEvent.pointerUp(start, { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 300 })
      fireEvent.click(start)
    } finally {
      document.elementFromPoint = original
    }
    expect(editing.onDraw).toHaveBeenCalledTimes(1)
    expect(editing.onDraw).toHaveBeenCalledWith(1, 3)
  })

  it('cycles a segment on tap and opens the menu by long-press or right-click', async () => {
    const editing = setup([master])
    const segment = screen.getByRole('button', { name: /212 WS, ELENA: Every take but one\.: On camera/ })

    fireEvent.click(segment)
    expect(editing.onSetSegment).toHaveBeenCalledWith(0, expect.objectContaining({ element: expect.objectContaining({ id: 'e3' }) }), 'off')

    vi.useFakeTimers()
    fireEvent.pointerDown(segment, { pointerType: 'touch', pointerId: 3, clientX: 50, clientY: 50 })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(segment, { pointerType: 'touch', pointerId: 3 })
    fireEvent.click(segment) // the tap that ends a long-press must not also cycle
    vi.useRealTimers()
    expect(editing.onSetSegment).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menu')).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Off camera for ELENA to the end of this line' }))
    expect(editing.onCharacterOff).toHaveBeenCalledWith(0, expect.objectContaining({ element: expect.objectContaining({ id: 'e3' }) }))
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.contextMenu(segment, { clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Not covered' }))
    expect(editing.onSetSegment).toHaveBeenLastCalledWith(0, expect.anything(), 'not_covered')
  })
})
