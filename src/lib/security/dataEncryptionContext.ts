import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { argon2id } from 'hash-wasm'

import { sqlUsersTableExists } from '@/lib/auth/authSql'

/** Prefix for AES-GCM ciphertext stored in client TEXT columns. */
export const CLIENT_FIELD_CIPHER_PREFIX = 'v1:'

const DEK_ARGON2 = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
} as const

let activeDek: Uint8Array | null = null
let testDekOverride: Uint8Array | null = null

export class EncryptionKeyUnavailableError extends Error {
  constructor(message = 'Sign in required to access encrypted client data') {
    super(message)
    this.name = 'EncryptionKeyUnavailableError'
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export async function isClientEncryptionEnabled(db: DatabaseAdapter): Promise<boolean> {
  if (testDekOverride != null) return true
  return sqlUsersTableExists(db)
}

export function hasDataEncryptionKey(): boolean {
  return testDekOverride != null || activeDek != null
}

export function getDataEncryptionKey(): Uint8Array {
  const key = testDekOverride ?? activeDek
  if (!key) throw new EncryptionKeyUnavailableError()
  return key
}

/** Export active DEK as 64-char hex for recovery-sidecar wrapping only. */
export function exportDataEncryptionKeyHex(): string {
  return dekBytesToHex(getDataEncryptionKey())
}

export function dekBytesToHex(dek: Uint8Array): string {
  return bytesToHex(dek)
}

/** Parse DEK hex into bytes (recovery / re-encryption flows). */
export function dataEncryptionKeyFromHex(dekHex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(dekHex)) {
    throw new Error('Invalid DEK material')
  }
  return hexToBytes(dekHex)
}

/** Import DEK hex into memory (recovery / re-encryption flows). */
export function importDataEncryptionKeyFromHex(dekHex: string): void {
  activeDek = dataEncryptionKeyFromHex(dekHex)
}

/** Test-only: bypass login-derived DEK for repository tests. */
export function setTestDataEncryptionKeyForTests(key: Uint8Array | null): void {
  testDekOverride = key
}

export function clearDataEncryptionKey(): void {
  activeDek = null
}

async function generateDekSaltHex(): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return bytesToHex(salt)
}

export async function deriveDekFromPassword(password: string, dekSaltHex: string): Promise<Uint8Array> {
  const raw = await argon2id({
    password,
    salt: hexToBytes(dekSaltHex),
    ...DEK_ARGON2,
    outputType: 'binary',
  })
  return new Uint8Array(raw)
}

async function loadOrCreateUserDekSalt(db: DatabaseAdapter, userId: string): Promise<string> {
  const rows = await db.select<Array<{ dek_salt: string | null }>>(
    `SELECT dek_salt FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  )
  const existing = rows[0]?.dek_salt?.trim()
  if (existing) return existing
  const dekSalt = await generateDekSaltHex()
  await db.execute(`UPDATE users SET dek_salt = $1 WHERE id = $2`, [dekSalt, userId])
  return dekSalt
}

/**
 * Derive DEK from the user's password and hold it in memory until logout.
 * Never persist the DEK.
 */
export async function establishDataEncryptionKey(
  db: DatabaseAdapter,
  userId: string,
  password: string
): Promise<void> {
  if (!password) throw new Error('Password is required to unlock encrypted data')
  const dekSalt = await loadOrCreateUserDekSalt(db, userId)
  activeDek = await deriveDekFromPassword(password, dekSalt)
}

export async function requireDataEncryptionKey(db: DatabaseAdapter): Promise<Uint8Array> {
  if (!(await isClientEncryptionEnabled(db))) {
    throw new EncryptionKeyUnavailableError('Client encryption is not configured for this database')
  }
  return getDataEncryptionKey()
}

export { deriveSqlCipherPassphraseFromPassword } from './dbFileEncryption'
