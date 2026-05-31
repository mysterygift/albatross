import { beforeEach, describe, expect, it } from 'vitest'

import {
  createFreshEncryptedInstall,
  getHarnessDbAdapter,
  getInvokeCounts,
  initSqlJsDatabase,
  performLoginSequence,
  readSidecarSnapshot,
  resetEncryptionHarness,
  setHarnessPlainDb,
} from '@/test/encryption/encryptionTestHarness'
import { prepareEncryptedDatabaseForFirstAdmin } from '@/lib/db/dbUnlock'
import { runSetupEncryption } from '@/lib/auth/setupEncryptionService'
import { setupInitialAdmin } from '@/lib/auth/authService'
import { createUserAsAdmin } from '@/lib/auth/adminUserManagementService'
import { getDb } from '@/lib/db/client'
import { isEncryptedClientField } from '@/lib/security/clientFieldCrypto'
import { backfillClientEncryptionIfNeeded } from '@/lib/db/migrations/backfillClientEncryption'
import { reencryptAllClientFields } from '@/lib/db/migrations/reencryptClientFields'
import {
  deriveDekFromPassword,
  dekBytesToHex,
  establishDataEncryptionKey,
  exportDataEncryptionKeyHex,
} from '@/lib/security/dataEncryptionContext'
import {
  generateInstanceKdfSaltHex,
  writeDbEncryptionMeta,
} from '@/lib/security/dbFileEncryption'
import {
  hashRecoveryKey,
  writeRecoveryKeyMeta,
  type RecoveryKeyMetaV2,
} from '@/lib/security/recoveryKey'
import {
  upsertUserInstanceKeyWrapper,
  wrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'
import { ensureDekEscrowOnLogin } from '@/lib/security/dekEscrowMigration'

describe('encryption migration regression (ENC8)', () => {
  beforeEach(async () => {
    await resetEncryptionHarness()
  })

  it('legacy plain DB migrates to SQLCipher on first admin setup', async () => {
    await initSqlJsDatabase()
    setHarnessPlainDb(true)

    const password = 'LegacyPlain1!'
    const { instanceKeyHex } = await prepareEncryptedDatabaseForFirstAdmin()
    const db = getHarnessDbAdapter()!
    await setupInitialAdmin(db, {
      username: 'admin',
      password: 'LegacyPlain1!',
      confirmPassword: 'LegacyPlain1!',
    })

    expect(getInvokeCounts().migratePlain).toBe(1)
    const snapshot = readSidecarSnapshot()
    expect(snapshot.dbMeta).toMatchObject({ version: 2, key_mode: 'instance_key' })
    expect(getInvokeCounts().backupBeforeRekey).toBe(0)

    const wrapper = await wrapInstanceKeyForUser(password, instanceKeyHex, {
      userId: (await db.select<Array<{ id: string }>>('SELECT id FROM users LIMIT 1', []))[0]!.id,
      username: 'admin',
    })
    await upsertUserInstanceKeyWrapper(wrapper)

    await performLoginSequence({ username: 'admin', password })
    await getDb()
  })

  it('legacy plain DB migrates to SQLCipher via runSetupEncryption', async () => {
    await initSqlJsDatabase()
    setHarnessPlainDb(true)

    const result = await runSetupEncryption()
    expect(result).toEqual({ status: 'ready', keyMode: 'instance_key' })

    expect(getInvokeCounts().migratePlain).toBe(1)
    const snapshot = readSidecarSnapshot()
    expect(snapshot.dbMeta).toMatchObject({ version: 2, key_mode: 'instance_key' })
  })

  it('legacy v1 password-derived meta migrates to instance key on login', async () => {
    await initSqlJsDatabase()
    setHarnessPlainDb(false)

    const password = 'LegacyV1Pass1!'
    const kdfSalt = await generateInstanceKdfSaltHex()
    await writeDbEncryptionMeta({ version: 1, kdf_salt: kdfSalt })

    const db = getHarnessDbAdapter()!
    await setupInitialAdmin(db, {
      username: 'admin',
      password,
      confirmPassword: password,
    })
    const legacyPassphrase = await (
      await import('@/lib/security/dbFileEncryption')
    ).deriveSqlCipherPassphraseFromPassword(password, kdfSalt)

    const { openDbWithFileKey } = await import('@/lib/db/client')
    await openDbWithFileKey(legacyPassphrase)

    const rekeyBefore = getInvokeCounts().rekey
    await performLoginSequence({ username: 'admin', password })

    expect(getInvokeCounts().rekey).toBe(rekeyBefore + 1)
    const snapshot = readSidecarSnapshot()
    expect(snapshot.dbMeta).toMatchObject({
      version: 2,
      key_mode: 'instance_key',
      legacy_kdf_salt: kdfSalt,
    })
    expect(snapshot.wrappersMeta).toBeTruthy()
  })

  it('existing UAM install backfills plaintext client rows on login', async () => {
    await initSqlJsDatabase()
    const install = await createFreshEncryptedInstall()
    await performLoginSequence({ username: install.username, password: install.password })
    const db = await getDb()

    await db.execute(
      `INSERT INTO clients (id, name, email, phone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), 'Plain Legacy Name', 'plain@test.example', null]
    )

    await db.execute(`UPDATE clients SET name = 'Plain Legacy Name' WHERE email = $1`, [
      'plain@test.example',
    ])

    await establishDataEncryptionKey(db, install.userId, install.password)
    await backfillClientEncryptionIfNeeded(db)

    const rows = await db.select<Array<{ name: string }>>('SELECT name FROM clients', [])
    expect(rows.every((r) => isEncryptedClientField(r.name))).toBe(true)
  })

  it('v2 recovery sidecar upgrades to v3 DEK escrow on login', async () => {
    await initSqlJsDatabase()
    setHarnessPlainDb(false)

    const password = 'EscrowV2Pass1!'
    const install = await createFreshEncryptedInstall({ password })
    const verifier = await hashRecoveryKey(install.recoveryKey)

    const v2Meta: RecoveryKeyMetaV2 = {
      version: 2,
      verifier,
      created_at: new Date().toISOString(),
      wrap_salt: 'aa'.repeat(16),
      wrapped_file_passphrase: 'wrap1:legacy',
    }
    await writeRecoveryKeyMeta(v2Meta)

    await performLoginSequence({ username: install.username, password: install.password })
    const snapshot = readSidecarSnapshot()
    expect(snapshot.recoveryMeta).toMatchObject({
      version: 3,
      dek_wrap_mode: 'file_passphrase',
    })
  })

  it('post-migration multi-user unlock uses independent wrappers', async () => {
    const install = await createFreshEncryptedInstall()
    const adminLogin = await performLoginSequence({
      username: install.username,
      password: install.password,
    })
    const db = await getDb()

    await createUserAsAdmin({
      db,
      actor: adminLogin.user,
      username: 'second',
      password: 'SecondUser1!',
      role: 'user',
    })

    const { simulateColdStart } = await import('@/test/encryption/encryptionTestHarness')
    await simulateColdStart()
    await performLoginSequence({ username: 'second', password: 'SecondUser1!' })
    await getDb()

    await simulateColdStart()
    await performLoginSequence({ username: install.username, password: install.password })
    await getDb()
  })

  it('reencryptAllClientFields preserves plaintext across DEK rotation', async () => {
    const install = await createFreshEncryptedInstall()
    await performLoginSequence({ username: install.username, password: install.password })
    const db = await getDb()

    const clientId = crypto.randomUUID()
    await db.execute(
      `INSERT INTO clients (id, name, email, phone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [clientId, 'Rotate Target', 'rotate@test.example', null]
    )
    await establishDataEncryptionKey(db, install.userId, install.password)
    await backfillClientEncryptionIfNeeded(db)

    const userRows = await db.select<Array<{ dek_salt: string }>>(
      'SELECT dek_salt FROM users WHERE id = $1',
      [install.userId]
    )
    const dekSalt = userRows[0]!.dek_salt
    const fromDek = await deriveDekFromPassword(install.password, dekSalt)
    const toDek = await deriveDekFromPassword('NewDekPass99!', dekSalt)

    await reencryptAllClientFields(db, { fromDek, toDek })
    await establishDataEncryptionKey(db, install.userId, 'NewDekPass99!')

    const { listClients } = await import('@/lib/db/repositories/clients')
    const listed = await listClients()
    expect(listed.find((c) => c.id === clientId)?.name).toBe('Rotate Target')
    expect(dekBytesToHex(toDek)).toBe(exportDataEncryptionKeyHex())
  })
})

describe('ensureDekEscrowOnLogin instance-key branch', () => {
  beforeEach(async () => {
    await resetEncryptionHarness()
  })

  it('unwraps instance key wrapper for v2 recovery upgrade on instance-key installs', async () => {
    const install = await createFreshEncryptedInstall()
    const verifier = await hashRecoveryKey(install.recoveryKey)
    await writeRecoveryKeyMeta({
      version: 2,
      verifier,
      created_at: new Date().toISOString(),
      wrap_salt: 'bb'.repeat(16),
      wrapped_file_passphrase: 'wrap1:file',
    })

    await performLoginSequence({ username: install.username, password: install.password })
    const db = await getDb()

    await writeRecoveryKeyMeta({
      version: 2,
      verifier,
      created_at: new Date().toISOString(),
      wrap_salt: 'bb'.repeat(16),
      wrapped_file_passphrase: 'wrap1:file',
    })

    await ensureDekEscrowOnLogin(db, install.userId, install.username, install.password)
    const snapshot = readSidecarSnapshot()
    expect(snapshot.recoveryMeta).toMatchObject({ version: 3, dek_wrap_mode: 'file_passphrase' })
  })
})
