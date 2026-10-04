// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RiskMatrix, type RiskRating } from '@/features/risk-assessments/RiskMatrix'

afterEach(cleanup)

function Harness({ initial, onChange }: { initial: RiskRating; onChange?: (v: RiskRating) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <RiskMatrix
      label="Risk before controls"
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

describe('RiskMatrix', () => {
  it('renders 25 cells with the selected one checked and the factor + band as text', () => {
    render(<RiskMatrix label="Risk before controls" value={{ severity: 4, probability: 3 }} />)
    const group = screen.getByRole('radiogroup', { name: 'Risk before controls' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(25)
    const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]!.getAttribute('aria-label')).toBe('Severity 4, probability 3: risk 12, Severe')
    expect(screen.getByText('12 | Severe')).toBeTruthy()
  })

  it('fills each cell with its band colour (selected at full strength, others dimmed)', () => {
    render(<RiskMatrix label="m" value={{ severity: 4, probability: 3 }} />)
    const selected = screen.getByRole('radio', { name: /Severity 4, probability 3/ })
    expect((selected as HTMLElement).style.background).toBe('rgb(224, 43, 32)') // severe red
    expect(selected.className).toContain('opacity-100')
    const tolerable = screen.getByRole('radio', { name: /Severity 1, probability 1:/ })
    expect((tolerable as HTMLElement).style.background).toBe('rgb(31, 163, 74)') // tolerable green
    expect(tolerable.className).toContain('opacity-50')
    const moderate = screen.getByRole('radio', { name: /Severity 3, probability 3:/ })
    expect((moderate as HTMLElement).style.background).toBe('rgb(255, 180, 0)') // 9 is amber
  })

  it('selects a cell on click and updates the summary', async () => {
    const onChange = vi.fn()
    render(<Harness initial={{ severity: 4, probability: 3 }} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: /Severity 2, probability 2/ }))
    expect(onChange).toHaveBeenCalledWith({ severity: 2, probability: 2 })
    expect(screen.getByText('4 | Tolerable')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Severity 2, probability 2/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('moves the selection with the arrow keys (up = higher probability)', async () => {
    const onChange = vi.fn()
    render(<Harness initial={{ severity: 3, probability: 3 }} onChange={onChange} />)
    const user = userEvent.setup()
    const start = screen.getByRole('radio', { name: /Severity 3, probability 3/ })
    start.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith({ severity: 4, probability: 3 })
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith({ severity: 4, probability: 4 })
    await user.keyboard('{ArrowLeft}{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith({ severity: 3, probability: 3 })
  })

  it('clamps at the edges of the 1-5 scale', async () => {
    const onChange = vi.fn()
    render(<Harness initial={{ severity: 5, probability: 5 }} onChange={onChange} />)
    screen.getByRole('radio', { name: /Severity 5, probability 5/ }).focus()
    await userEvent.setup().keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith({ severity: 5, probability: 5 })
  })

  it('only the selected cell is in the tab order', () => {
    render(<RiskMatrix label="m" value={{ severity: 2, probability: 4 }} />)
    const tabbable = screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]!.getAttribute('aria-label')).toContain('Severity 2, probability 4')
  })

  it('does not change when read-only', async () => {
    const onChange = vi.fn()
    render(<RiskMatrix label="m" value={{ severity: 3, probability: 3 }} onChange={onChange} readOnly />)
    await userEvent.setup().click(screen.getByRole('radio', { name: /Severity 1, probability 1/ }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
