import { describe, expect, it } from 'vitest'
import {
  optionalContactEmailField,
  optionalContactPhoneField,
  validateOptionalContactEmail,
  validateOptionalContactPhone,
} from './contactFieldValidation'

describe('validateOptionalContactEmail', () => {
  it.each(['', '   ', 'john@gmail.org', 'John.Smith+crew@mail.example.co.uk', '  a_b-c@x.io  '])(
    'accepts %j',
    (value) => {
      expect(validateOptionalContactEmail(value).ok).toBe(true)
    }
  )

  it.each(['jasdkj@poe', 'john', 'john@', '@gmail.org', 'john@gmail.', 'jo hn@gmail.org', 'john@@gmail.org', 'john@gmail.c'])(
    'rejects %j',
    (value) => {
      expect(validateOptionalContactEmail(value).ok).toBe(false)
    }
  )
})

describe('validateOptionalContactPhone', () => {
  it.each(['', '07700900123', '+447700900123', ' +15551234567 '])('accepts %j', (value) => {
    expect(validateOptionalContactPhone(value).ok).toBe(true)
  })

  it.each(['07700 900123', '(555) 123-4567', '+44-7700', '44+7700', '++44', 'call me', '+', '123456789012345678'])(
    'rejects %j',
    (value) => {
      expect(validateOptionalContactPhone(value).ok).toBe(false)
    }
  )
})

describe('optional contact zod fields', () => {
  it('treat empty and undefined as valid', () => {
    expect(optionalContactEmailField.safeParse(undefined).success).toBe(true)
    expect(optionalContactPhoneField.safeParse('').success).toBe(true)
  })

  it('surface the validator message', () => {
    const result = optionalContactPhoneField.safeParse('555-1234')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Phone may only contain + and numbers')
  })
})
