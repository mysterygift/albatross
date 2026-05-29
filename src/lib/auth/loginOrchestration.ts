import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getDb } from '@/lib/db/client'
import { unlockLocalDatabaseWithPassword, type UnlockCredentials } from '@/lib/db/dbUnlock'
import { login, type AuthResult } from '@/lib/auth/authService'
import { backfillClientEncryptionIfNeeded } from '@/lib/db/migrations/backfillClientEncryption'
import { backfillPeopleIsCastIntegerIfNeeded } from '@/lib/db/migrations/backfillPeopleIsCastInteger'
import { ensureDekEscrowOnLogin } from '@/lib/security/dekEscrowMigration'
import { establishDataEncryptionKey } from '@/lib/security/dataEncryptionContext'
import { migrateToInstanceKeyModeIfNeeded } from '@/lib/security/instanceKeyMigration'

export type LoginAfterUnlockResult = AuthResult & {
  repairedPeople: number
}

/**
 * Post-unlock login steps shared by AuthGateScreen and integration tests.
 * Caller must unlock the database before invoking this helper.
 */
export async function completeLoginAfterDatabaseUnlock(
  db: DatabaseAdapter,
  credentials: UnlockCredentials
): Promise<LoginAfterUnlockResult> {
  const result = await login(db, {
    username: credentials.username,
    password: credentials.password,
  })
  const migrated = await migrateToInstanceKeyModeIfNeeded(
    db,
    { userId: result.user.id, username: result.user.username },
    credentials.password
  )
  let activeDb = db
  if (migrated) {
    activeDb = await getDb()
  }
  await establishDataEncryptionKey(activeDb, result.user.id, credentials.password)
  await ensureDekEscrowOnLogin(
    activeDb,
    result.user.id,
    result.user.username,
    credentials.password
  )
  await backfillClientEncryptionIfNeeded(activeDb)
  const repairedPeople = await backfillPeopleIsCastIntegerIfNeeded(activeDb)
  return { ...result, repairedPeople }
}

/** Full sign-in: unlock local DB, then run post-unlock login orchestration. */
export async function performFullLoginSequence(
  credentials: UnlockCredentials
): Promise<LoginAfterUnlockResult> {
  await unlockLocalDatabaseWithPassword(credentials)
  const db = await getDb()
  return completeLoginAfterDatabaseUnlock(db, credentials)
}
