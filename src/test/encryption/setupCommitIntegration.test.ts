import { beforeEach, describe, expect, it } from 'vitest'

import {
  assertNoPlaintextSecretsInSidecars,
  createFreshEncryptedInstallViaSetupCommit,
  getHarnessDbAdapter,
  readSidecarSnapshot,
  resetEncryptionHarness,
} from '@/test/encryption/encryptionTestHarness'
import { isInitialSetupComplete } from '@/lib/auth/initialSetupStatus'
import { getEncryptionHarnessState } from '@/test/encryption/encryptionTestHarness.setup'

describe('setup commit (FTW6A integration)', () => {
  beforeEach(async () => {
    await resetEncryptionHarness()
  })

  it('persists recovery verifier, escrow metadata, and admin wrapper', async () => {
    const install = await createFreshEncryptedInstallViaSetupCommit()

    const snapshot = readSidecarSnapshot()
    expect(snapshot.recoveryMeta).toMatchObject({ version: 3, verifier: expect.any(String) })
    expect(snapshot.wrappersMeta).toMatchObject({
      wrappers: [expect.objectContaining({ username: install.username, revoked_at: null })],
    })
    assertNoPlaintextSecretsInSidecars([
      install.recoveryKey,
      install.password,
      install.instanceKeyHex,
    ])
  })

  it('marks setup complete only after commit and keeps session token out of settings', async () => {
    expect(await isInitialSetupComplete()).toBe(false)

    const install = await createFreshEncryptedInstallViaSetupCommit()

    expect(await isInitialSetupComplete()).toBe(true)
    expect(getEncryptionHarnessState().settings.get('auth_session_token')).toBeUndefined()
    expect(install.sessionToken).toBeTruthy()

    const db = getHarnessDbAdapter()!
    const sessions = await db.select<Array<{ count: number | string }>>(
      `SELECT COUNT(*) AS count FROM sessions`,
      []
    )
    expect(Number(sessions[0]?.count ?? 0)).toBeGreaterThan(0)
  })
})
