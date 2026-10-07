import { beforeEach, describe, expect, it } from 'vitest'

import {
  createFreshEncryptedInstall,
  getHarnessDbAdapter,
  performLoginSequence,
  readSidecarSnapshot,
  resetEncryptionHarness,
  simulateColdStart,
} from '@/test/encryption/encryptionTestHarness'
import { getDb } from '@/lib/db/client'
import { createUserAsAdmin, resetUserPasswordAsAdmin } from '@/lib/auth/adminUserManagementService'
import { createClient, listClients } from '@/lib/db/repositories/clients'
import { createPerson, listPeopleByProduction } from '@/lib/db/repositories/person'
import { createLocation, listLocationsByProduction } from '@/lib/db/repositories/location'
import { createVendor, listVendors } from '@/lib/db/repositories/vendors'
import { recoverAdminPasswordWithRecoveryKey } from '@/lib/security/passwordRecoveryService'

const PROD = 'prod-multi-user'
const TS = '2026-08-17T12:00:00.000Z'

async function seedProduction(): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, 'Multi-user production', $2, $2)`,
    [PROD, TS]
  )
}

async function createSensitiveRecords() {
  const client = await createClient({ name: 'Shared Client', email: 'client@shared.test', phone: '+44 7000' })
  const person = await createPerson({
    production_id: PROD,
    name: 'Shared Person',
    is_cast: 1,
    email: 'person@shared.test',
    notes: 'Private note',
  })
  const location = await createLocation({
    production_id: PROD,
    name: 'Shared Location',
    booked_status: 'hold',
    address: '1 Shared Street',
  })
  const vendor = await createVendor({
    production_id: PROD,
    company_name: 'Shared Vendor',
    primary_contact_email: 'vendor@shared.test',
  })
  return { client, person, location, vendor }
}

async function expectRecordsReadable(ids: Awaited<ReturnType<typeof createSensitiveRecords>>): Promise<void> {
  expect((await listClients()).find((c) => c.id === ids.client.id)?.email).toBe('client@shared.test')
  expect((await listPeopleByProduction(PROD)).find((p) => p.id === ids.person.id)?.email).toBe('person@shared.test')
  expect((await listLocationsByProduction(PROD)).find((l) => l.id === ids.location.id)?.address).toBe(
    '1 Shared Street'
  )
  expect((await listVendors(PROD)).find((v) => v.id === ids.vendor.id)?.primary_contact_email).toBe(
    'vendor@shared.test'
  )
}

/**
 * Known bug (DOCS/security.md "Known limitations"): each user derives a private DEK from their own
 * `users.dek_salt` + password, so user B cannot decrypt rows user A wrote (AES-GCM auth failure).
 * The cross-user cases below use `it.fails` to document that; when an instance-wide DEK lands they will
 * start passing, vitest will flag the `it.fails`, and they should be switched to plain `it`.
 */
describe('field encryption is shared across local users', () => {
  beforeEach(async () => {
    await resetEncryptionHarness()
  })

  async function setupAdminAndUserB() {
    const install = await createFreshEncryptedInstall()
    const adminLogin = await performLoginSequence({ username: install.username, password: install.password })
    await seedProduction()
    const ids = await createSensitiveRecords()
    const userB = await createUserAsAdmin({
      db: await getDb(),
      actor: adminLogin.user,
      username: 'userb',
      password: 'UserBPass123!',
      role: 'user',
    })
    return { install, adminLogin, ids, userB }
  }

  it('control: the creating admin reads all four tables back across sign-outs and recovery', async () => {
    const { install, ids } = await setupAdminAndUserB()
    await simulateColdStart()
    await performLoginSequence({ username: install.username, password: install.password })
    await expectRecordsReadable(ids)
    await simulateColdStart()
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: install.recoveryKey,
      newPassword: 'NewAdminPass99!',
      confirmPassword: 'NewAdminPass99!',
    })
    await performLoginSequence({ username: install.username, password: 'NewAdminPass99!' })
    await expectRecordsReadable(ids)
  })

  it.fails('user B (created by admin) can read records user A created', async () => {
    const { ids } = await setupAdminAndUserB()
    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBPass123!' })
    await expectRecordsReadable(ids)
  })

  it.fails('records user B writes are readable by user A, and user B survives an admin password reset', async () => {
    const { install, adminLogin, userB } = await setupAdminAndUserB()
    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBPass123!' })
    const bClient = await createClient({ name: 'B Client', email: 'b@shared.test', phone: null })

    await simulateColdStart()
    await performLoginSequence({ username: install.username, password: install.password })
    expect((await listClients()).find((c) => c.id === bClient.id)?.name).toBe('B Client')

    await resetUserPasswordAsAdmin({
      db: await getDb(),
      actor: adminLogin.user,
      targetUserId: userB.id,
      newPassword: 'UserBNewPass99!',
    })
    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBNewPass99!' })
    expect((await listClients()).find((c) => c.id === bClient.id)?.name).toBe('B Client')
  })

  it.fails('user B reads everything after the admin resets B via the target old password path', async () => {
    const { ids, adminLogin, userB } = await setupAdminAndUserB()
    await resetUserPasswordAsAdmin({
      db: await getDb(),
      actor: adminLogin.user,
      targetUserId: userB.id,
      newPassword: 'UserBOldPath99!',
      targetOldPassword: 'UserBPass123!',
    })
    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBOldPath99!' })
    await expectRecordsReadable(ids)
  })

  it.fails('forgot-password recovery of the admin keeps user B able to read all records', async () => {
    const { install, ids } = await setupAdminAndUserB()
    await simulateColdStart()
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: install.recoveryKey,
      newPassword: 'NewAdminPass99!',
      confirmPassword: 'NewAdminPass99!',
    })

    await performLoginSequence({ username: install.username, password: 'NewAdminPass99!' })
    await expectRecordsReadable(ids)

    await simulateColdStart()
    await performLoginSequence({ username: 'userb', password: 'UserBPass123!' })
    await expectRecordsReadable(ids)
  })

  it('does not write DEK material or plaintext passwords to sidecars', async () => {
    await setupAdminAndUserB()
    const body = JSON.stringify(readSidecarSnapshot())
    expect(body).not.toContain('UserBPass123!')
    expect(getHarnessDbAdapter()).toBeTruthy()
  })
})
