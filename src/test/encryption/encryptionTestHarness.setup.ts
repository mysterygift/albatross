import { vi } from 'vitest'

import type { Database } from 'sql.js'

import type { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

const encryptionHarnessState = vi.hoisted(() => ({
  sidecarFiles: new Map<string, string>(),
  settings: new Map<string, string>(),
  activeSqlCipherKeyHex: null as string | null,
  /** Passphrase the on-disk DB is encrypted with (survives closeDb). */
  storedSqlCipherKeyHex: null as string | null,
  isPlainDb: true,
  dbFileExists: true,
  invokeCounts: {
    migratePlain: 0,
    rekey: 0,
    probe: 0,
    backupBeforeRekey: 0,
  },
  sqlJsDb: null as Database | null,
  dbAdapter: null as ReturnType<typeof createSqlJsTauriAdapter> | null,
}))

export function getEncryptionHarnessState() {
  return encryptionHarnessState
}

const APP_CONFIG_DIR = '/tmp/albatross-test-config'

export function sidecarPath(filename: string): string {
  return `${APP_CONFIG_DIR}/${filename}`
}

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => APP_CONFIG_DIR),
  appDataDir: vi.fn(async () => APP_CONFIG_DIR),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async (path: string) => encryptionHarnessState.sidecarFiles.has(path)),
  readTextFile: vi.fn(async (path: string) => {
    const content = encryptionHarnessState.sidecarFiles.get(path)
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }),
  writeTextFile: vi.fn(async (path: string, body: string) => {
    encryptionHarnessState.sidecarFiles.set(path, body)
  }),
  remove: vi.fn(async (path: string) => {
    encryptionHarnessState.sidecarFiles.delete(path)
  }),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    const state = encryptionHarnessState
    switch (cmd) {
      case 'get_local_db_status':
        return {
          dbFileExists: state.dbFileExists,
          encryptionMetaExists: state.sidecarFiles.has(sidecarPath('albatross.db.meta.json')),
          isPlainSqlite: state.isPlainDb,
        }
      case 'probe_sqlcipher_passphrase': {
        state.invokeCounts.probe++
        const passphrase = String(args?.passphrase ?? '')
        return passphrase.length > 0 && passphrase === state.storedSqlCipherKeyHex
      }
      case 'migrate_plain_db_to_sqlcipher': {
        state.invokeCounts.migratePlain++
        state.activeSqlCipherKeyHex = String(args?.passphrase ?? '')
        state.storedSqlCipherKeyHex = state.activeSqlCipherKeyHex
        state.isPlainDb = false
        return undefined
      }
      case 'rekey_sqlcipher_database': {
        state.invokeCounts.rekey++
        const newPassphrase = String(args?.newPassphrase ?? '')
        state.storedSqlCipherKeyHex = newPassphrase
        state.activeSqlCipherKeyHex = newPassphrase
        return undefined
      }
      case 'backup_encrypted_db_before_rekey':
        state.invokeCounts.backupBeforeRekey++
        return undefined
      case 'get_pre_sqlcipher_backup_status':
        return { backupExists: false, backupIsPlainSqlite: false }
      case 'get_instance_key_backup_status':
        return { backupExists: false, backupIsEncrypted: false }
      case 'restore_sqlite_from_pre_sqlcipher_backup':
      case 'restore_sqlite_from_instance_key_backup':
        return undefined
      case 'load_sqlite_with_passphrase':
      case 'run_sqlite_migrations':
        return undefined
      default:
        throw new Error(`Unexpected invoke: ${cmd}`)
    }
  }),
}))

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: vi.fn(async (key: string) => encryptionHarnessState.settings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    encryptionHarnessState.settings.set(key, value)
  }),
}))

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => {
      const state = encryptionHarnessState
      if (state.dbAdapter && state.activeSqlCipherKeyHex != null) {
        return state.dbAdapter
      }
      const { isLocalDbEncryptionEnabled } = await import('@/lib/security/dbFileEncryption')
      if (await isLocalDbEncryptionEnabled()) {
        throw new actual.DatabaseLockedError()
      }
      if (state.dbAdapter) return state.dbAdapter
      throw new Error('Database not initialized')
    }),
    openDbWithFileKey: vi.fn(async (passphrase: string) => {
      const state = encryptionHarnessState
      if (!state.dbAdapter) throw new Error('Database not initialized')
      state.activeSqlCipherKeyHex = passphrase
      state.storedSqlCipherKeyHex = passphrase
      actual.setActiveSqlCipherKeyHexForTests(passphrase)
      actual.setDbAdapterForTests(state.dbAdapter)
      return state.dbAdapter
    }),
    openPlainDbIfExists: vi.fn(async () => {
      const state = encryptionHarnessState
      if (!state.dbAdapter) throw new Error('Database not initialized')
      actual.setDbAdapterForTests(state.dbAdapter)
      return state.dbAdapter
    }),
    isDbUnlocked: vi.fn(() => {
      const state = encryptionHarnessState
      return state.dbAdapter != null && state.activeSqlCipherKeyHex != null
    }),
    closeDb: vi.fn(async () => {
      const actual = await import('@/lib/db/client')
      actual.setDbAdapterForTests(null)
      actual.setActiveSqlCipherKeyHexForTests(null)
      encryptionHarnessState.activeSqlCipherKeyHex = null
    }),
  }
})
