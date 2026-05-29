/** AES-256-GCM blob encoding for recovery-sidecar wrap material (not client field crypto). */
export const AES_GCM_BLOB_PREFIX = 'wrap1:'

async function importAesGcmKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

function encodeBlob(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, iv.length)
  let binary = ''
  for (const byte of combined) binary += String.fromCharCode(byte)
  return AES_GCM_BLOB_PREFIX + btoa(binary)
}

function decodeBlob(encoded: string): { iv: Uint8Array; ciphertext: Uint8Array } {
  if (!encoded.startsWith(AES_GCM_BLOB_PREFIX)) {
    throw new Error('Invalid wrapped blob')
  }
  const b64 = encoded.slice(AES_GCM_BLOB_PREFIX.length)
  const binary = atob(b64)
  const combined = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i)
  if (combined.length < 13) throw new Error('Invalid wrapped blob')
  return {
    iv: combined.slice(0, 12),
    ciphertext: combined.slice(12),
  }
}

export async function encryptAesGcmBlob(plaintext: string, keyBytes: Uint8Array): Promise<string> {
  const key = await importAesGcmKey(keyBytes)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  )
  return encodeBlob(iv, ciphertext)
}

export async function decryptAesGcmBlob(blob: string, keyBytes: Uint8Array): Promise<string> {
  const { iv, ciphertext } = decodeBlob(blob)
  const key = await importAesGcmKey(keyBytes)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as BufferSource)
  return new TextDecoder().decode(plain)
}
