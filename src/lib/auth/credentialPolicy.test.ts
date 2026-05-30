import { describe, expect, it } from 'vitest'

import {
  MIN_PASSWORD_LENGTH,
  assertInitialAdminCredentialShape,
  validateInitialAdminCredentials,
} from '@/lib/auth/credentialPolicy'

describe('credentialPolicy', () => {
  it('requires username, password, and matching confirmation', () => {
    const validation = validateInitialAdminCredentials({
      username: '',
      password: '',
      confirmPassword: '',
    })

    expect(validation.ok).toBe(false)
    expect(validation.fieldErrors.username).toBe('Username is required')
    expect(validation.fieldErrors.password).toBe('Password is required')
    expect(validation.fieldErrors.confirmPassword).toBe('Password confirmation is required')
  })

  it('enforces minimum password length', () => {
    const validation = validateInitialAdminCredentials({
      username: 'admin',
      password: 'short',
      confirmPassword: 'short',
    })

    expect(validation.ok).toBe(false)
    expect(validation.checklist.minLength).toBe(false)
    expect(validation.fieldErrors.password).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    )
  })

  it('requires password confirmation to match', () => {
    const validation = validateInitialAdminCredentials({
      username: 'admin',
      password: 'validpass123',
      confirmPassword: 'different123',
    })

    expect(validation.ok).toBe(false)
    expect(validation.checklist.passwordsMatch).toBe(false)
    expect(validation.fieldErrors.confirmPassword).toBe('Passwords do not match')
  })

  it('normalizes username in assertInitialAdminCredentialShape', () => {
    const credentials = assertInitialAdminCredentialShape({
      username: '  Admin  ',
      password: 'validpass123',
      confirmPassword: 'validpass123',
    })

    expect(credentials.username).toBe('admin')
  })
})
