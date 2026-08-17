import { describe, expect, it } from 'vitest'

import {
  AES_GCM_BLOB_PREFIX,
  decryptAesGcmBlob,
  encryptAesGcmBlob,
} from './aesGcmBlob'

function key(byte: number): Uint8Array {
  const bytes = new Uint8Array(32)
  bytes.fill(byte)
  return bytes
}

function tamperWithCiphertext(blob: string): string {
  const encoded = blob.slice(AES_GCM_BLOB_PREFIX.length)
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 1
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return AES_GCM_BLOB_PREFIX + btoa(binary)
}

describe('aesGcmBlob', () => {
  it.each(['', 'client@example.test', 'Ångström 🎬'])('round-trips %j', async (plaintext) => {
    const encrypted = await encryptAesGcmBlob(plaintext, key(7))

    expect(encrypted).toMatch(/^wrap1:/)
    await expect(decryptAesGcmBlob(encrypted, key(7))).resolves.toBe(plaintext)
  })

  it('uses a fresh IV so repeated encryption does not reveal equal plaintext', async () => {
    const first = await encryptAesGcmBlob('same sensitive value', key(7))
    const second = await encryptAesGcmBlob('same sensitive value', key(7))

    expect(first).not.toBe(second)
    await expect(decryptAesGcmBlob(first, key(7))).resolves.toBe('same sensitive value')
    await expect(decryptAesGcmBlob(second, key(7))).resolves.toBe('same sensitive value')
  })

  it('rejects a blob decrypted with the wrong key', async () => {
    const encrypted = await encryptAesGcmBlob('sensitive value', key(7))

    await expect(decryptAesGcmBlob(encrypted, key(8))).rejects.toThrow()
  })

  it('rejects ciphertext modified after encryption', async () => {
    const encrypted = await encryptAesGcmBlob('sensitive value', key(7))

    await expect(decryptAesGcmBlob(tamperWithCiphertext(encrypted), key(7))).rejects.toThrow()
  })

  it.each([
    'not-a-wrapped-blob',
    AES_GCM_BLOB_PREFIX,
    AES_GCM_BLOB_PREFIX + btoa('short'),
  ])('rejects malformed input %j', async (blob) => {
    await expect(decryptAesGcmBlob(blob, key(7))).rejects.toThrow('Invalid wrapped blob')
  })

  it('rejects non-AES-256 key material', async () => {
    await expect(encryptAesGcmBlob('sensitive value', new Uint8Array(31))).rejects.toThrow()
  })
})
