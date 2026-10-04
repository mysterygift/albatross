// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'

afterEach(cleanup)

function Harness({
  initial = null,
  mode = 'positive',
  onEmit,
}: {
  initial?: number | null
  mode?: 'positive' | 'nonNegative'
  onEmit?: (v: number | null) => void
}) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <MoneyAmountInput
      aria-label="amount"
      mode={mode}
      value={value}
      onValueChange={(v) => {
        setValue(v)
        onEmit?.(v)
      }}
    />
  )
}

function input(): HTMLInputElement {
  return screen.getByLabelText('amount') as HTMLInputElement
}

describe('MoneyAmountInput', () => {
  it('shows an initial value as fixed 2dp', () => {
    render(<Harness initial={1250} />)
    expect(input().value).toBe('1250.00')
  })

  it('formats to fixed 2dp on blur', () => {
    const onEmit = vi.fn()
    render(<Harness onEmit={onEmit} />)
    fireEvent.change(input(), { target: { value: '1250' } })
    expect(input().value).toBe('1250')
    expect(onEmit).toHaveBeenLastCalledWith(1250)
    fireEvent.blur(input())
    expect(input().value).toBe('1250.00')
    fireEvent.change(input(), { target: { value: '12.5' } })
    fireEvent.blur(input())
    expect(input().value).toBe('12.50')
    expect(onEmit).toHaveBeenLastCalledWith(12.5)
  })

  it('does not reformat while typing', () => {
    render(<Harness />)
    fireEvent.change(input(), { target: { value: '1' } })
    fireEvent.change(input(), { target: { value: '12' } })
    expect(input().value).toBe('12')
  })

  it('rounds pasted values with more than 2 decimals instead of rejecting them', () => {
    const onEmit = vi.fn()
    render(<Harness onEmit={onEmit} />)
    fireEvent.paste(input(), { clipboardData: { getData: () => '1,250.456' } })
    expect(input().value).toBe('1250.46')
    expect(onEmit).toHaveBeenLastCalledWith(1250.46)
  })

  it('rounds half away from zero on paste (1.005 -> 1.01)', () => {
    const onEmit = vi.fn()
    render(<Harness onEmit={onEmit} />)
    fireEvent.paste(input(), { clipboardData: { getData: () => '1.005' } })
    expect(onEmit).toHaveBeenLastCalledWith(1.01)
  })

  it('emits null for empty and for non-positive amounts in positive mode', () => {
    const onEmit = vi.fn()
    render(<Harness onEmit={onEmit} />)
    fireEvent.change(input(), { target: { value: '0' } })
    expect(onEmit).toHaveBeenLastCalledWith(null)
    fireEvent.change(input(), { target: { value: '' } })
    expect(onEmit).toHaveBeenLastCalledWith(null)
  })

  it('allows 0 in nonNegative mode', () => {
    const onEmit = vi.fn()
    render(<Harness mode="nonNegative" onEmit={onEmit} />)
    fireEvent.change(input(), { target: { value: '0' } })
    expect(onEmit).toHaveBeenLastCalledWith(0)
    fireEvent.blur(input())
    expect(input().value).toBe('0.00')
  })

  it('syncs an external value change into the text', () => {
    function Ext() {
      const [v, setV] = useState<number | null>(5)
      return (
        <>
          <button type="button" onClick={() => setV(99.5)}>
            set
          </button>
          <MoneyAmountInput aria-label="amount" mode="positive" value={v} onValueChange={setV} />
        </>
      )
    }
    render(<Ext />)
    fireEvent.click(screen.getByText('set'))
    expect(input().value).toBe('99.50')
  })
})
