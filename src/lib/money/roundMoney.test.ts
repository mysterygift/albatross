import { describe, expect, it } from 'vitest'
import {
  moneyEquals,
  moneyExceeds,
  roundMoney,
  roundMoneyOrNull,
  sumMoney,
} from '@/lib/money/roundMoney'

describe('roundMoney', () => {
  it('rounds half away from zero, even where the float is just below the half', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(2.675)).toBe(2.68)
    expect(roundMoney(1.255)).toBe(1.26)
    expect(roundMoney(10.075)).toBe(10.08)
  })

  it('rounds negatives away from zero', () => {
    expect(roundMoney(-1.005)).toBe(-1.01)
    expect(roundMoney(-2.5)).toBe(-2.5)
    expect(roundMoney(-0.125)).toBe(-0.13)
  })

  it('removes float artifacts', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(1.1 * 3)).toBe(3.3)
    expect(roundMoney(0.7 + 0.1)).toBe(0.8)
    expect(roundMoney(4.35 * 100)).toBe(435)
  })

  it('keeps already-2dp values and integers untouched', () => {
    expect(roundMoney(12.34)).toBe(12.34)
    expect(roundMoney(1250)).toBe(1250)
    expect(roundMoney(0)).toBe(0)
  })

  it('never returns negative zero', () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true)
    expect(Object.is(roundMoney(-0), 0)).toBe(true)
  })

  it('handles tiny and large values', () => {
    expect(roundMoney(1e-7)).toBe(0)
    expect(roundMoney(123456789.125)).toBe(123456789.13)
  })

  it('passes non-finite values through', () => {
    expect(roundMoney(Number.NaN)).toBeNaN()
    expect(roundMoney(Infinity)).toBe(Infinity)
  })
})

describe('money helpers', () => {
  it('moneyEquals / moneyExceeds compare at 2dp', () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true)
    expect(moneyEquals(10.004, 10)).toBe(true)
    expect(moneyEquals(10.01, 10)).toBe(false)
    expect(moneyExceeds(10.004, 10)).toBe(false)
    expect(moneyExceeds(10.01, 10)).toBe(true)
  })

  it('roundMoneyOrNull keeps null', () => {
    expect(roundMoneyOrNull(null)).toBeNull()
    expect(roundMoneyOrNull(undefined)).toBeNull()
    expect(roundMoneyOrNull(1.005)).toBe(1.01)
  })

  it('sumMoney rounds the total', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney([])).toBe(0)
  })
})
