import type { SetupAdminCredentials } from '@/features/auth/setup/SetupAdminAccountScreen'

export type InitialAdminSetupResult = {
  sessionToken: string
  repairedPeople: number
}

/**
 * In-memory handoff from recovery step to FTW6A committing step.
 * Never persisted to setup progress or disk.
 *
 * FTW6A responsibilities: hashRecoveryKey, wrapInstanceKey, establishDEK,
 * persistRecoveryKeyMaterial, backfills, clearSetupProgress, then transition
 * to the FTW6B done step with session token held in memory.
 *
 * FTW6B done step defers onSetupComplete (session persist) until the user
 * clicks Enter Workspace.
 */
export type PendingSetupCommit = {
  plainRecoveryKey: string
  credentials?: SetupAdminCredentials
}
