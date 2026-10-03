// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Toaster, toast } from '@/components/ui/sonner'

afterEach(cleanup)

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
})

describe('Toaster', () => {
  it('shows a toast message', async () => {
    render(<Toaster />)
    act(() => {
      toast('Saved it')
    })
    expect(await screen.findByText('Saved it')).toBeTruthy()
  })
})
