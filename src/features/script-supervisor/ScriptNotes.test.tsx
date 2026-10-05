// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import type { Take } from '@/lib/db/types'
import { layoutLinedScript, type LiningElement } from '@/lib/script-supervisor/lining'
import { annotationsByElement, type AnnotationView } from '@/lib/script-supervisor/annotations'
import { AnnotationDialog, type AnnotationDialogState } from './AnnotationDialog'
import { LinedScript } from './LinedScript'

const elements: LiningElement[] = [
  { id: 'e0', scene_id: 's', sort_index: 0, element_type: 'scene_heading', character_name: null, text: 'INT. EDIT SUITE - NIGHT', page_number: '31' },
  { id: 'e1', scene_id: 's', sort_index: 1, element_type: 'dialogue', character_name: 'ELENA', text: 'There is no cutaway.', page_number: '31' },
]

const adLib: AnnotationView = {
  id: 'a1', elementId: 'e1', kind: 'ad_lib', text: '+ “Nobody ever does.”', slateId: 'sl', slateLabel: '217',
  takeIds: ['t3'], takeNumbers: [3], createdAt: '2026-10-07T10:00',
}

const take = (id: string, n: number): Take => ({
  id, slate_id: 'sl', take_number: n, status: 'pending', ng_reason: null, duration_ms: null, end_board: 0, remarks: null,
  created_at: 't', updated_at: 't', deleted_at: null,
})

// The note dialog's Radix checkbox measures itself; jsdom has no ResizeObserver.
beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
})

describe('script notes (SS8)', () => {
  afterEach(() => cleanup())

  it('shows a line change on the marked-up page and opens it for editing', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onAnnotate = vi.fn()
    render(
      <MemoryRouter>
        <LinedScript
          layout={layoutLinedScript(elements, [])}
          isLoading={false}
          hasScript
          sceneNumber="23"
          currentSlateId={null}
          touch={false}
          annotations={annotationsByElement([adLib])}
          onAnnotate={onAnnotate}
          onEditAnnotation={onEdit}
        />
      </MemoryRouter>
    )
    const chip = screen.getByRole('button', { name: 'Edit note: T3 | 217 | Ad-lib: + “Nobody ever does.”' })
    await user.click(chip)
    expect(onEdit).toHaveBeenCalledWith(adLib, expect.objectContaining({ element: expect.objectContaining({ id: 'e1' }) }))

    await user.click(screen.getByRole('button', { name: 'Add a note to “ELENA: There is no cutaway.”' }))
    expect(onAnnotate).toHaveBeenCalledTimes(1)
    // Headings take no notes.
    expect(screen.queryByRole('button', { name: /Add a note to “INT\./ })).toBeNull()
  })

  it('adds a line change against the selected take of the current slate', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const state: AnnotationDialogState = { mode: 'create', elementId: 'e1', excerpt: 'ELENA: There is no cutaway.', character: 'ELENA' }
    render(
      <AnnotationDialog
        state={state}
        slate={{ id: 'sl', label: '217' }}
        takes={[take('t1', 1), take('t2', 2), take('t3', 3)]}
        defaultTakeId="t3"
        busy={false}
        error={null}
        onClose={vi.fn()}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText('What was said'), '“So use it.” for “So use the one.”')
    await user.click(screen.getByRole('checkbox', { name: 'Take 2' }))
    await user.click(screen.getByRole('button', { name: 'Add note' }))
    expect(onCreate).toHaveBeenCalledWith({
      elementId: 'e1',
      kind: 'line_change',
      text: '“So use it.” for “So use the one.”',
      slateId: 'sl',
      takeIds: ['t3', 't2'],
    })
  })
})
