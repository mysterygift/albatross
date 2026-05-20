import { invoke } from '@tauri-apps/api/core'
import { appConfigDir, appDataDir, join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { argon2id } from 'hash-wasm'

export const DB_FILE_NAME = 'albatross.db'
export const DB_META_FILENAME = 'albatross.db.meta.json'
export const DB_ENCRYPTION_SETTINGS_KEY = 'db_encryption_version'

export type DbEncryptionMeta = {
  version: 1
  kdf_salt: string
}

export type LocalDbStatus = {
  dbFileExists: boolean
  encryptionMetaExists: boolean
  isPlainSqlite: boolean
}

const FILE_KEY_ARGON2 = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
} as const

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

/** Same directory as `tauri-plugin-sql` (`app_config_dir`). */
export async function getDbMetaPath(): Promise<string> {
  const dir = await appConfigDir()
  return join(dir, DB_META_FILENAME)
}

async function getLegacyDbMetaPath(): Promise<string> {
  const dir = await appDataDir()
  return join(dir, DB_META_FILENAME)
}

export async function readDbEncryptionMeta(): Promise<DbEncryptionMeta | null> {
  const primary = await getDbMetaPath()
  const legacy = await getLegacyDbMetaPath()
  const path = (await exists(primary)) ? primary : (await exists(legacy)) ? legacy : null
  if (!path) return null
  const raw = await readTextFile(path)
  const parsed = JSON.parse(raw) as DbEncryptionMeta
  if (parsed?.version !== 1 || typeof parsed.kdf_salt !== 'string' || !parsed.kdf_salt.trim()) {
    throw new Error('Invalid database encryption metadata')
  }
  return parsed
}

export async function writeDbEncryptionMeta(meta: DbEncryptionMeta): Promise<void> {
  const path = await getDbMetaPath()
  await writeTextFile(path, JSON.stringify(meta, null, 2))
  const legacy = await getLegacyDbMetaPath()
  if (legacy !== path && (await exists(legacy))) {
    const { remove } = await import('@tauri-apps/plugin-fs')
    await remove(legacy)
  }
}

export async function generateInstanceKdfSaltHex(): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return bytesToHex(salt)
}

/**
 * SQLCipher passphrase for PRAGMA key (hex). Derived from password + instance salt — never persisted.
 */
export async function deriveSqlCipherPassphraseFromPassword(
  password: string,
  instanceKdfSaltHex: string
): Promise<string> {
  const raw = await argon2id({
    password,
    salt: hexToBytes(instanceKdfSaltHex),
    ...FILE_KEY_ARGON2,
    outputType: 'binary',
  })
  return bytesToHex(new Uint8Array(raw))
}

export async function resolveDbMetaPathForStatus(): Promise<string> {
  const primary = await getDbMetaPath()
  if (await exists(primary)) return primary
  const legacy = await getLegacyDbMetaPath()
  if (await exists(legacy)) return legacy
  return primary
}

export async function getLocalDbStatus(): Promise<LocalDbStatus> {
  const metaPath = await resolveDbMetaPathForStatus()
  return invoke<LocalDbStatus>('get_local_db_status', { metaPath })
}

export async function probeSqlCipherPassphrase(passphrase: string): Promise<boolean> {
  return invoke<boolean>('probe_sqlcipher_passphrase', { passphrase })
}

export async function migratePlainDbToSqlcipher(passphrase: string): Promise<void> {
  await invoke('migrate_plain_db_to_sqlcipher', { passphrase })
}

export type PreSqlcipherBackupStatus = {
  backupExists: boolean
  backupIsPlainSqlite: boolean
}

export async function getPreSqlcipherBackupStatus(): Promise<PreSqlcipherBackupStatus> {
  return invoke<PreSqlcipherBackupStatus>('get_pre_sqlcipher_backup_status')
}

export async function restoreSqliteFromPreSqlcipherBackup(): Promise<void> {
  await invoke('restore_sqlite_from_pre_sqlcipher_backup')
}

export async function removeDbEncryptionMeta(): Promise<void> {
  const { remove } = await import('@tauri-apps/plugin-fs')
  for (const path of [await getDbMetaPath(), await getLegacyDbMetaPath()]) {
    if (await exists(path)) await remove(path)
  }
}

export function isKeyVerificationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('key verification failed') || msg.includes('(code: 26)')
}

export async function runSqlcipherSelfTest(): Promise<void> {
  await invoke('sqlcipher_self_test')
}

export async function isLocalDbEncryptionEnabled(): Promise<boolean> {
  const meta = await readDbEncryptionMeta()
  return meta != null
}

export async function needsPlainToEncryptedMigration(): Promise<boolean> {
  const status = await getLocalDbStatus()
  return status.dbFileExists && status.isPlainSqlite
}
