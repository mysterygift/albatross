import { beforeEach, describe, expect, it } from 'vitest'

import {
  assertActivePassphraseAccepted,
  assertNoPlaintextSecretsInSidecars,
  assertRecoveryKeyValid,
  assertWrongPassphraseRejected,
  createFreshEncryptedInstall,
  expectNoRekeySince,
  getActiveInstanceKeyHex,
  getInvokeCounts,
  getHarnessDbAdapter,
  initSqlJsDatabase,
  performLoginSequence,
  readSidecarSnapshot,
  resetEncryptionHarness,
  simulateColdStart,
} from '@/test/encryption/encryptionTestHarness'
import { DatabaseLockedError, getDb } from '@/lib/db/client'
import { isLocalDatabaseLocked } from '@/lib/db/dbUnlock'
import { unlockLocalDatabaseWithPassword } from '@/lib/db/dbUnlock'
import {
  createUserAsAdmin,
  deleteUserAsAdmin,
  disableUserAsAdmin,
  enableUserAsAdmin,
  resetUserPasswordAsAdmin,
} from '@/lib/auth/adminUserManagementService'
import { createClient, listClients } from '@/lib/db/repositories/clients'
import {
  recoverAdminPasswordWithRecoveryKey,
  RECOVERY_FAILED_MESSAGE,
} from '@/lib/security/passwordRecoveryService'
import { readInstanceKeyWrappersMeta } from '@/lib/security/instanceKey'
import { probeSqlCipherPassphrase } from '@/lib/security/dbFileEncryption'

describe('encryption lifecycle (ENC8)', () => {
  beforeEach(async () => {
    await resetEncryptionHarness()
  })

  it('fresh setup creates sidecars without plaintext recovery key and login succeeds', async () => {
    const install = await createFreshEncryptedInstall()
    const snapshot = readSidecarSnapshot()

    expect(snapshot.dbMeta).toMatchObject({ version: 2, key_mode: 'instance_key' })
    expect(snapshot.recoveryMeta).toMatchObject({ version: 3 })
    expect(snapshot.wrappersMeta).toBeTruthy()
    assertNoPlaintextSecretsInSidecars([install.recoveryKey, install.instanceKeyHex, install.password])

    await simulateColdStart()
    const login = await performLoginSequence({
      username: install.username,
      password: install.password,
    })
    expect(login.user.username).toBe('admin')
  })

  it('recovery key generation matches verifier and is never stored in sidecars', async () => {
    const recoveryKey =
      'aaaaaaaa-bbbbcccc-dddddddd-eeeeeeee-ffffffff-gggggggg-hhhhhhhh-iiiiiiii'
    const install = await createFreshEncryptedInstall({ recoveryKey })
    expect(await assertRecoveryKeyValid(recoveryKey)).toBe(true)
    assertNoPlaintextSecretsInSidecars([recoveryKey.replace(/-/g, ''), recoveryKey])
  })

  it('normal login, client access, logout, and re-login preserve plaintext', async () => {
    const install = await createFreshEncryptedInstall()
    await performLoginSequence({ username: install.username, password: install.password })
    const db = await getDb()
    const client = await createClient({
      name: 'Lifecycle Client',
      email: 'life@test.example',
      phone: null,
    })

    await simulateColdStart()
    await expect(getDb()).rejects.toBeInstanceOf(DatabaseLockedError)

    await performLoginSequence({ username: install.username, password: install.password })
    const listed = await listClients()
    expect(listed.find((c) => c.id === client.id)?.name).toBe('Lifecycle Client')
  })

  it('cold start keeps database locked until sign-in', async () => {
    await createFreshEncryptedInstall()
    await simulateColdStart()
    expect(await isLocalDatabaseLocked()).toBe(true)
    await expect(getDb()).rejects.toBeInstanceOf(DatabaseLockedError)
  })

  it('recovery with key resets password without SQLCipher rekey and preserves client PII', async () => {
    const install = await createFreshEncryptedInstall()
    await performLoginSequence({ username: install.username, password: install.password })
    const db = await getDb()
    const client = await createClient({
      name: 'Recover Me',
      email: 'recover@test.example',
      phone: null,
    })
    const instanceKeyBefore = install.instanceKeyHex
    const rekeyBefore = getInvokeCounts().rekey

    await simulateColdStart()

    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: install.recoveryKey,
      newPassword: 'NewAdminPass99!',
      confirmPassword: 'NewAdminPass99!',
    })

    expectNoRekeySince(rekeyBefore)
    expect(getInvokeCounts().rekey).toBe(rekeyBefore)
    expect(await probeSqlCipherPassphrase(instanceKeyBefore)).toBe(true)

    await performLoginSequence({
      username: install.username,
      password: 'NewAdminPass99!',
    })
    const listed = await listClients()
    expect(listed.find((c) => c.id === client.id)?.name).toBe('Recover Me')
    await assertActivePassphraseAccepted()
  })

  it('failed recovery leaves sidecars unchanged and database locked', async () => {
    const install = await createFreshEncryptedInstall()
    await performLoginSequence({ username: install.username, password: install.password })
    await simulateColdStart()
    const before = JSON.stringify(readSidecarSnapshot())

    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '00000000-0000-0000-0000-000000000000-00000000-0000-000000000000',
        newPassword: 'NewAdminPass99!',
        confirmPassword: 'NewAdminPass99!',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)

    expect(JSON.stringify(readSidecarSnapshot())).toBe(before)
    expect(await isLocalDatabaseLocked()).toBe(true)
  })

  it('multi-user login, disable, enable, and admin reset re-wrap wrapper', async () => {
    const install = await createFreshEncryptedInstall()
    const adminLogin = await performLoginSequence({
      username: install.username,
      password: install.password,
    })
    const db = await getDb()
    const userB = await createUserAsAdmin({
      db,
      actor: adminLogin.user,
      username: 'userb',
      password: 'UserBPass123!',
      role: 'user',
    })

    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBPass123!' })

    await simulateColdStart()
    await performLoginSequence({ username: install.username, password: install.password })
    await disableUserAsAdmin({
      db: await getDb(),
      actor: adminLogin.user,
      targetUserId: userB.id,
    })

    await simulateColdStart()
    await expect(
      unlockLocalDatabaseWithPassword({ username: 'userb', password: 'UserBPass123!' })
    ).rejects.toThrow('Unable to unlock local database')

    await performLoginSequence({ username: install.username, password: install.password })
    await enableUserAsAdmin({
      db: await getDb(),
      actor: adminLogin.user,
      targetUserId: userB.id,
    })

    const rekeyBefore = getInvokeCounts().rekey
    await resetUserPasswordAsAdmin({
      db: await getDb(),
      actor: adminLogin.user,
      targetUserId: userB.id,
      newPassword: 'UserBNewPass99!',
    })
    expectNoRekeySince(rekeyBefore)

    const wrappers = await readInstanceKeyWrappersMeta()
    const entry = wrappers?.wrappers.find((w) => w.user_id === userB.id)
    expect(entry?.rotated_at).toBeTruthy()

    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBNewPass99!' })
    await getDb()
  })

  it('admin reset Path A re-wraps with target old password', async () => {
    const install = await createFreshEncryptedInstall()
    const adminLogin = await performLoginSequence({
      username: install.username,
      password: install.password,
    })
    const db = await getDb()
    const userB = await createUserAsAdmin({
      db,
      actor: adminLogin.user,
      username: 'pathtest',
      password: 'PathOldPass1!',
      role: 'user',
    })
    const rekeyBefore = getInvokeCounts().rekey

    await resetUserPasswordAsAdmin({
      db,
      actor: adminLogin.user,
      targetUserId: userB.id,
      newPassword: 'PathNewPass1!',
      targetOldPassword: 'PathOldPass1!',
    })
    expectNoRekeySince(rekeyBefore)

    await simulateColdStart()
    await performLoginSequence({ username: 'pathtest', password: 'PathNewPass1!' })
  })

  it('disable revokes wrapper and delete removes sidecar entry', async () => {
    const install = await createFreshEncryptedInstall()
    const adminLogin = await performLoginSequence({
      username: install.username,
      password: install.password,
    })
    const db = await getDb()
    const userB = await createUserAsAdmin({
      db,
      actor: adminLogin.user,
      username: 'deleteme',
      password: 'DeletePass1!',
      role: 'user',
    })

    await disableUserAsAdmin({ db, actor: adminLogin.user, targetUserId: userB.id })
    const disabledMeta = await readInstanceKeyWrappersMeta()
    expect(disabledMeta?.wrappers.find((w) => w.user_id === userB.id)?.revoked_at).toBeTruthy()

    await deleteUserAsAdmin({ db, actor: adminLogin.user, targetUserId: userB.id })
    const afterDelete = await readInstanceKeyWrappersMeta()
    expect(afterDelete?.wrappers.some((w) => w.user_id === userB.id)).toBe(false)

    await simulateColdStart()
    await expect(
      unlockLocalDatabaseWithPassword({ username: 'deleteme', password: 'DeletePass1!' })
    ).rejects.toThrow('Unable to unlock local database')
  })

  it('SQLCipher at-rest probe rejects wrong passphrase and accepts active key', async () => {
    const install = await createFreshEncryptedInstall()
    await performLoginSequence({ username: install.username, password: install.password })
    await assertActivePassphraseAccepted()
    await assertWrongPassphraseRejected()
    expect(getActiveInstanceKeyHex()).toBe(install.instanceKeyHex)
  })
})

describe('encryption lifecycle harness sanity', () => {
  beforeEach(async () => {
    await resetEncryptionHarness()
  })

  it('initSqlJsDatabase applies migrations', async () => {
    await initSqlJsDatabase()
    const db = getHarnessDbAdapter()
    expect(db).toBeTruthy()
    const rows = await db!.select<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
      []
    )
    expect(rows.length).toBe(1)
  })
})
