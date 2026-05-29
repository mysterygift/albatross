import { invoke } from '@tauri-apps/api/core'
import { appConfigDir, appDataDir, join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { argon2id } from 'hash-wasm'

export const DB_FILE_NAME = 'albatross.db'
export const DB_META_FILENAME = 'albatross.db.meta.json'
export const DB_ENCRYPTION_SETTINGS_KEY = 'db_encryption_version'

export type DbEncryptionMetaV1 = {
  version: 1
  kdf_salt: string
}

export type DbEncryptionMetaV2 = {
  version: 2
  key_mode: 'instance_key'
  legacy_kdf_salt?: string
  migrated_at?: string
}

export type DbEncryptionMeta = DbEncryptionMetaV1 | DbEncryptionMetaV2

export const FILE_KEY_ARGON2_PARAMS = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
} as const

export function isLegacyPasswordDerivedMode(
  meta: DbEncryptionMeta
): meta is DbEncryptionMetaV1 {
  return meta.version === 1
}

export function usesInstanceKeyMode(meta: DbEncryptionMeta): meta is DbEncryptionMetaV2 {
  return meta.version === 2 && meta.key_mode === 'instance_key'
}

export type LocalDbStatus = {
  dbFileExists: boolean
  encryptionMetaExists: boolean
  isPlainSqlite: boolean
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

/** Same directory as `tauri-plugin-sql` (`app_config_dir`). */
export async function getDbMetaPath(): Promise<string> {
  const dir = await appConfigDir()
  return join(dir, DB_META_FILENAME)
}

async function getLegacyDbMetaPath(): Promise<string> {
  const dir = await appDataDir()
  return join(dir, DB_META_FILENAME)
}

function parseDbEncryptionMeta(raw: unknown): DbEncryptionMeta {
  const parsed = raw as DbEncryptionMeta
  if (parsed?.version === 1) {
    if (typeof parsed.kdf_salt !== 'string' || !parsed.kdf_salt.trim()) {
      throw new Error('Invalid database encryption metadata')
    }
    return parsed
  }
  if (parsed?.version === 2) {
    if (parsed.key_mode !== 'instance_key') {
      throw new Error('Invalid database encryption metadata')
    }
    if (
      parsed.legacy_kdf_salt !== undefined &&
      (typeof parsed.legacy_kdf_salt !== 'string' || !parsed.legacy_kdf_salt.trim())
    ) {
      throw new Error('Invalid database encryption metadata')
    }
    if (parsed.migrated_at !== undefined && typeof parsed.migrated_at !== 'string') {
      throw new Error('Invalid database encryption metadata')
    }
    return parsed
  }
  throw new Error('Invalid database encryption metadata')
}

export async function readDbEncryptionMeta(): Promise<DbEncryptionMeta | null> {
  const primary = await getDbMetaPath()
  const legacy = await getLegacyDbMetaPath()
  const path = (await exists(primary)) ? primary : (await exists(legacy)) ? legacy : null
  if (!path) return null
  const raw = await readTextFile(path)
  return parseDbEncryptionMeta(JSON.parse(raw))
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
    ...FILE_KEY_ARGON2_PARAMS,
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

export async function rekeySqlCipherDatabase(
  currentPassphrase: string,
  newPassphrase: string
): Promise<void> {
  await invoke('rekey_sqlcipher_database', {
    currentPassphrase,
    newPassphrase,
  })
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

export type InstanceKeyBackupStatus = {
  backupExists: boolean
  backupIsEncrypted: boolean
}

export async function getInstanceKeyBackupStatus(): Promise<InstanceKeyBackupStatus> {
  return invoke<InstanceKeyBackupStatus>('get_instance_key_backup_status')
}

export async function backupEncryptedDbBeforeRekey(): Promise<void> {
  await invoke('backup_encrypted_db_before_rekey')
}

export async function restoreSqliteFromInstanceKeyBackup(): Promise<void> {
  await invoke('restore_sqlite_from_instance_key_backup')
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
