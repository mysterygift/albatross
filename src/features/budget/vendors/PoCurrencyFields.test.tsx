// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'

const getRate = vi.fn<(base: string, quote: string) => Promise<number | null>>()
vi.mock('@/lib/money/exchangeRates', () => ({ getRate: (b: string, q: string) => getRate(b, q) }))

import { PoCurrencyFields } from '@/features/budget/vendors/PoCurrencyFields'

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

afterEach(() => {
  cleanup()
  getRate.mockReset()
})

function Harness({ initialCurrency = 'GBP', initialRate = '', amount = 1000 }: { initialCurrency?: string; initialRate?: string; amount?: number | null }) {
  const [currency, setCurrency] = useState(initialCurrency)
  const [rate, setRate] = useState(initialRate)
  return (
    <PoCurrencyFields
      idPrefix="po"
      productionCurrency="GBP"
      currency={currency}
      rate={rate}
      amount={amount}
      onCurrencyChange={setCurrency}
      onRateChange={setRate}
    >
      <div>amount field</div>
    </PoCurrencyFields>
  )
}

async function pickCurrency(code: string) {
  fireEvent.click(screen.getByRole('combobox'))
  const option = await screen.findByRole('option', { name: new RegExp(`^${code}`) })
  await act(async () => {
    fireEvent.click(option)
  })
}

describe('PoCurrencyFields', () => {
  it('shows no rate field for the production currency', () => {
    render(<Harness />)
    expect(screen.queryByLabelText(/Exchange rate/)).toBeNull()
    expect(screen.queryByTestId('po-conversion')).toBeNull()
  })

  it('prefills the rate from getRate when a foreign currency is picked, with a live conversion line', async () => {
    getRate.mockResolvedValue(0.79)
    render(<Harness />)
    await pickCurrency('USD')
    expect(getRate).toHaveBeenCalledWith('USD', 'GBP')
    const rate = (await screen.findByLabelText(/Exchange rate/)) as HTMLInputElement
    await waitFor(() => expect(rate.value).toBe('0.79'))
    expect(screen.getByTestId('po-conversion').textContent).toContain('1 USD = 0.7900 GBP')
    expect(screen.getByTestId('po-conversion').textContent).toContain('790.00')
  })

  it('leaves the rate blank with a manual-entry hint when no rate is available, then accepts a typed rate', async () => {
    getRate.mockResolvedValue(null)
    render(<Harness />)
    await pickCurrency('EUR')
    const rate = (await screen.findByLabelText(/Exchange rate/)) as HTMLInputElement
    await screen.findByTestId('po-rate-hint')
    expect(rate.value).toBe('')
    expect(screen.queryByTestId('po-conversion')).toBeNull()
    fireEvent.change(rate, { target: { value: '0.8512345678' } })
    // capped at 6 decimals
    expect(rate.value).toBe('0.851234')
    expect(screen.getByTestId('po-conversion').textContent).toContain('1 EUR = 0.851234 GBP')
  })

  it('re-prefills when the currency changes again and clears the rate when back to production currency', async () => {
    getRate.mockResolvedValueOnce(0.79).mockResolvedValueOnce(0.85)
    render(<Harness />)
    await pickCurrency('USD')
    await waitFor(() => expect((screen.getByLabelText(/Exchange rate/) as HTMLInputElement).value).toBe('0.79'))
    await pickCurrency('EUR')
    await waitFor(() => expect((screen.getByLabelText(/Exchange rate/) as HTMLInputElement).value).toBe('0.85'))
    await pickCurrency('GBP')
    expect(screen.queryByLabelText(/Exchange rate/)).toBeNull()
  })

  it('keeps a stored (locked) rate when editing an existing foreign PO', () => {
    render(<Harness initialCurrency="USD" initialRate="0.7812" />)
    expect((screen.getByLabelText(/Exchange rate/) as HTMLInputElement).value).toBe('0.7812')
    expect(getRate).not.toHaveBeenCalled()
  })
})
