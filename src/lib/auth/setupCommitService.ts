import { login } from '@/lib/auth/authService'
import { verifySetupCommitPredicates } from '@/lib/auth/initialSetupStatus'
import {
  getPreparedInstanceKeyForSetup,
  isSetupEncryptionAlreadyPrepared,
} from '@/lib/auth/setupEncryptionService'
import { closeDb, getDb, isDbUnlocked } from '@/lib/db/client'
import { backfillClientEncryptionIfNeeded } from '@/lib/db/migrations/backfillClientEncryption'
import { backfillSensitiveEntityEncryptionIfNeeded } from '@/lib/db/migrations/backfillSensitiveEntityEncryption'
import { backfillPeopleIsCastIntegerIfNeeded } from '@/lib/db/migrations/backfillPeopleIsCastInteger'
import {
  establishDataEncryptionKey,
  exportDataEncryptionKeyHex,
} from '@/lib/security/dataEncryptionContext'
import { upsertUserInstanceKeyWrapper, wrapInstanceKeyForUser } from '@/lib/security/instanceKey'
import {
  hashRecoveryKey,
  persistRecoveryKeyMaterial,
  recoveryKeyMetaExists,
} from '@/lib/security/recoveryKey'

export type SetupCommitProgressPhase =
  | 'encrypting_database'
  | 'creating_admin_access'
  | 'preparing_recovery'

export type SetupCommitInput = {
  plainRecoveryKey: string
  username: string
  password: string
}

export type SetupCommitResult = {
  sessionToken: string
  repairedPeople: number
}

export const SETUP_COMMIT_FAILED_MESSAGE =
  'Could not finish securing your workspace. Try again.'

function reportProgress(
  onProgress: ((phase: SetupCommitProgressPhase) => void) | undefined,
  phase: SetupCommitProgressPhase
): void {
  onProgress?.(phase)
}

export async function runSetupCommit(
  input: SetupCommitInput,
  options?: { onProgress?: (phase: SetupCommitProgressPhase) => void }
): Promise<SetupCommitResult> {
  try {
    if (!isDbUnlocked()) {
      throw new Error('Database is not unlocked')
    }

    const db = await getDb()
    let repairedPeople = 0

    if (await recoveryKeyMetaExists()) {
      if (!(await verifySetupCommitPredicates())) {
        throw new Error('Recovery key already registered')
      }
    } else {
      reportProgress(options?.onProgress, 'encrypting_database')

      if (!(await isSetupEncryptionAlreadyPrepared())) {
        throw new Error('Encryption setup is not ready')
      }

      const instanceKeyHex = getPreparedInstanceKeyForSetup()

      const adminRows = await db.select<Array<{ id: string; username: string; role: 'admin' }>>(
        `SELECT id, username, role FROM users WHERE username = $1 AND role = 'admin' LIMIT 1`,
        [input.username]
      )
      const adminUser = adminRows[0]
      if (!adminUser) {
        throw new Error('Admin account is not ready for recovery setup')
      }

      reportProgress(options?.onProgress, 'creating_admin_access')

      const verifier = await hashRecoveryKey(input.plainRecoveryKey)
      const wrapper = await wrapInstanceKeyForUser(input.password, instanceKeyHex, {
        userId: adminUser.id,
        username: adminUser.username,
      })
      await upsertUserInstanceKeyWrapper(wrapper)
      await establishDataEncryptionKey(db, adminUser.id, input.password)

      reportProgress(options?.onProgress, 'preparing_recovery')

      await persistRecoveryKeyMaterial({
        db,
        actorUserId: adminUser.id,
        plainRecoveryKey: input.plainRecoveryKey,
        verifier,
        sqlCipherPassphraseHex: instanceKeyHex,
        dekHex: exportDataEncryptionKeyHex(),
      })
      await backfillClientEncryptionIfNeeded(db)
      await backfillSensitiveEntityEncryptionIfNeeded(db)
      repairedPeople = await backfillPeopleIsCastIntegerIfNeeded(db)

      if (!(await verifySetupCommitPredicates())) {
        throw new Error('Setup commit predicates not satisfied')
      }
    }

    const authResult = await login(db, {
      username: input.username,
      password: input.password,
    })

    if (!authResult.sessionToken) {
      throw new Error('Session creation failed')
    }

    return {
      sessionToken: authResult.sessionToken,
      repairedPeople,
    }
  } catch {
    await closeDb()
    throw new Error(SETUP_COMMIT_FAILED_MESSAGE)
  }
}
