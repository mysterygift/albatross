// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEditHistory } from './useEditHistory'

describe('useEditHistory', () => {
  it('records a drag as one step and undoes back to before it', () => {
    const { result } = renderHook(() => useEditHistory(0))
    act(() => result.current.set(1, true))
    act(() => result.current.set(2, true))
    expect(result.current.dragging).toBe(true)
    act(() => result.current.set(3))
    expect(result.current).toMatchObject({ value: 3, dragging: false, canUndo: true })

    act(() => result.current.undo())
    expect(result.current.value).toBe(0)
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.redo())
    expect(result.current.value).toBe(3)
  })

  it('a new change clears redo, and an unchanged commit adds no step', () => {
    const { result } = renderHook(() => useEditHistory('a'))
    act(() => result.current.set('b'))
    act(() => result.current.undo())
    act(() => result.current.set('c'))
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.set('c'))
    act(() => result.current.undo())
    expect(result.current.value).toBe('a')
  })
})
