import { describe, expect, it, beforeEach } from 'vitest'
import {
  computeClientNameSortKey,
  decryptClientField,
  encryptClientField,
  encryptClientFieldsForStorage,
  isEncryptedClientField,
  readLegacyClientRowFields,
  rowNeedsClientEncryption,
} from './clientFieldCrypto'
import { setTestDataEncryptionKeyForTests } from './dataEncryptionContext'

describe('clientFieldCrypto', () => {
  const dek = new Uint8Array(32)
  dek.fill(7)

  beforeEach(() => {
    setTestDataEncryptionKeyForTests(dek)
  })

  it('encrypts and decrypts a field with v1 prefix', async () => {
    const enc = await encryptClientField('hello@client.test', dek)
    expect(enc).toMatch(/^v1:/)
    expect(isEncryptedClientField(enc)).toBe(true)
    const dec = await decryptClientField(enc, dek)
    expect(dec).toBe('hello@client.test')
  })

  it('returns legacy plaintext when not encrypted', async () => {
    const dec = await decryptClientField('Plain Name', dek)
    expect(dec).toBe('Plain Name')
  })

  it('encryptClientFieldsForStorage produces sort key', async () => {
    const stored = await encryptClientFieldsForStorage({
      name: 'Acme Corp',
      email: 'a@acme.test',
      phone: '+441234567890',
    })
    expect(isEncryptedClientField(stored.name)).toBe(true)
    expect(stored.name_sort_key.length).toBeGreaterThan(0)
    const key2 = await computeClientNameSortKey('acme corp', dek)
    expect(stored.name_sort_key).toBe(key2)
  })

  it('detects rows needing encryption', () => {
    expect(rowNeedsClientEncryption({ name: 'Legacy' })).toBe(true)
    expect(rowNeedsClientEncryption({ name: 'v1:abc' })).toBe(false)
    expect(readLegacyClientRowFields({ name: 'X', email: null, phone: null }).name).toBe('X')
  })
})
