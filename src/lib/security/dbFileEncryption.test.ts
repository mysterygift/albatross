import { describe, expect, it } from 'vitest'

import {
  deriveSqlCipherPassphraseFromPassword,
  generateInstanceKdfSaltHex,
} from './dbFileEncryption'

describe('dbFileEncryption', () => {
  it('derives stable SQLCipher passphrase for fixed password and salt', async () => {
    const salt = '0123456789abcdef0123456789abcdef'
    const a = await deriveSqlCipherPassphraseFromPassword('test-password', salt)
    const b = await deriveSqlCipherPassphraseFromPassword('test-password', salt)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates random instance salts', async () => {
    const a = await generateInstanceKdfSaltHex()
    const b = await generateInstanceKdfSaltHex()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })
})
