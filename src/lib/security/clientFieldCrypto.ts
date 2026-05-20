import {
  CLIENT_FIELD_CIPHER_PREFIX,
  getDataEncryptionKey,
  hasDataEncryptionKey,
} from './dataEncryptionContext'

export type PlainClientContactFields = {
  name: string
  email: string | null
  phone: string | null
}

export type StoredClientContactFields = {
  name: string
  email: string | null
  phone: string | null
  name_sort_key: string
}

function normalizeNameForSort(name: string): string {
  return name.trim().toLowerCase()
}

export function isEncryptedClientField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(CLIENT_FIELD_CIPHER_PREFIX)
}

async function importAesGcmKey(dek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function importHmacKey(dek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', dek, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

function encodePayload(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, iv.length)
  let binary = ''
  for (const byte of combined) binary += String.fromCharCode(byte)
  return CLIENT_FIELD_CIPHER_PREFIX + btoa(binary)
}

function decodePayload(encoded: string): { iv: Uint8Array; ciphertext: Uint8Array } {
  const b64 = encoded.slice(CLIENT_FIELD_CIPHER_PREFIX.length)
  const binary = atob(b64)
  const combined = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i)
  if (combined.length < 13) throw new Error('Invalid encrypted client field')
  return {
    iv: combined.slice(0, 12),
    ciphertext: combined.slice(12),
  }
}

export async function encryptClientField(
  plaintext: string | null,
  dek: Uint8Array
): Promise<string | null> {
  if (plaintext == null || plaintext === '') return null
  const key = await importAesGcmKey(dek)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  )
  return encodePayload(iv, ciphertext)
}

export async function decryptClientField(
  stored: string | null,
  dek: Uint8Array
): Promise<string | null> {
  if (stored == null || stored === '') return null
  if (!isEncryptedClientField(stored)) return stored
  const key = await importAesGcmKey(dek)
  const { iv, ciphertext } = decodePayload(stored)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plain)
}

export async function computeClientNameSortKey(name: string, dek: Uint8Array): Promise<string> {
  const hmacKey = await importHmacKey(dek)
  const normalized = normalizeNameForSort(name)
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(normalized))
  let binary = ''
  for (const byte of new Uint8Array(sig)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function encryptClientFieldsForStorage(
  plain: PlainClientContactFields
): Promise<StoredClientContactFields> {
  const dek = getDataEncryptionKey()
  const [name, email, phone, name_sort_key] = await Promise.all([
    encryptClientField(plain.name, dek),
    encryptClientField(plain.email, dek),
    encryptClientField(plain.phone, dek),
    computeClientNameSortKey(plain.name, dek),
  ])
  return { name: name!, email, phone, name_sort_key }
}

export async function decryptClientRowFields(row: {
  name: unknown
  email: unknown
  phone: unknown
}): Promise<PlainClientContactFields> {
  const dek = getDataEncryptionKey()
  const nameStored = row.name == null ? '' : String(row.name)
  const [name, email, phone] = await Promise.all([
    decryptClientField(nameStored, dek),
    decryptClientField(row.email == null ? null : String(row.email), dek),
    decryptClientField(row.phone == null ? null : String(row.phone), dek),
  ])
  return {
    name: name ?? '',
    email,
    phone,
  }
}

/** Legacy plaintext row (pre-encryption); readable only when encryption is off or during backfill. */
export function readLegacyClientRowFields(row: {
  name: unknown
  email: unknown
  phone: unknown
}): PlainClientContactFields {
  return {
    name: row.name == null ? '' : String(row.name),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
  }
}

export function rowNeedsClientEncryption(row: { name: unknown }): boolean {
  const name = row.name == null ? '' : String(row.name)
  return name.length > 0 && !isEncryptedClientField(name)
}

export async function canDecryptClientRows(): Promise<boolean> {
  return hasDataEncryptionKey()
}
