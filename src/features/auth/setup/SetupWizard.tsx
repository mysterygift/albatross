import { useCallback, useEffect, useRef, useState } from 'react'

import {
  SetupAdminAccountScreen,
  type SetupAdminCredentials,
} from '@/features/auth/setup/SetupAdminAccountScreen'
import { SetupBlockedScreen } from '@/features/auth/setup/SetupBlockedScreen'
import { SetupCommittingScreen } from '@/features/auth/setup/SetupCommittingScreen'
import { SetupDoneScreen } from '@/features/auth/setup/SetupDoneScreen'
import { SetupDetectStep } from '@/features/auth/setup/SetupDetectStep'
import { SetupEncryptingScreen } from '@/features/auth/setup/SetupEncryptingScreen'
import { SetupLegacyMigrationScreen } from '@/features/auth/setup/SetupLegacyMigrationScreen'
import { SetupRecoveryScreen } from '@/features/auth/setup/SetupRecoveryScreen'
import { SetupWelcomeScreen } from '@/features/auth/setup/SetupWelcomeScreen'
import type { SetupWizardStep } from '@/features/auth/setup/setupWizardSteps'
import type { InitialAdminSetupResult, PendingSetupCommit } from '@/features/auth/setup/setupTypes'
import {
  detectInstallState,
  preparePlainDatabaseForSetup,
  type InstallDetectionResult,
} from '@/lib/auth/installDetection'
import { getUnlockedDbAdminsCountIfAvailable } from '@/lib/auth/initialSetupStatus'
import { getDb } from '@/lib/db/client'
import {
  isSetupEncryptionAlreadyPrepared,
  runSetupEncryption,
  SETUP_ENCRYPTION_FAILED_MESSAGE,
} from '@/lib/auth/setupEncryptionService'
import {
  clearSetupProgress,
  markSetupFailed,
  readSetupProgress,
  writeSetupProgress,
} from '@/lib/auth/setupProgress'
import {
  armSetupWorkspaceHandoff,
  disarmSetupWorkspaceHandoff,
  isSetupWorkspaceHandoffArmed,
  resetSetupWorkspaceHandoffTransition,
  startSetupWorkspaceTransition,
} from '@/lib/auth/setupWorkspaceHandoff'
import { runSetupWorkspaceTransition } from '@/features/auth/setup/setupWorkspaceTransitionController'
import { getPrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSetupWorkspaceHandoff } from '@/hooks/useSetupWorkspaceHandoff'

type SetupWizardProps = {
  busy: boolean
  onSetupComplete: (result: InitialAdminSetupResult) => Promise<void>
  onError: (message: string) => void
  onRequireSignIn: () => void
}

type BlockedView = 'repair' | 'failed'

export function SetupWizard({
  busy,
  onSetupComplete,
  onError,
  onRequireSignIn,
}: SetupWizardProps) {
  const handoff = useSetupWorkspaceHandoff()
  /** FTW6A reads this ref to commit recovery escrow and complete setup. */
  const pendingCommitRef = useRef<PendingSetupCommit | null>(null)
  const commitResultRef = useRef<InitialAdminSetupResult | null>(null)

  const [step, setStep] = useState<SetupWizardStep>('welcome')
  const [blockedView, setBlockedView] = useState<BlockedView | null>(null)
  const [showLegacyMigration, setShowLegacyMigration] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [resumeChecked, setResumeChecked] = useState(false)
  const [detectAttempt, setDetectAttempt] = useState(0)
  const [encryptionError, setEncryptionError] = useState<string | null>(null)
  const [isEncrypting, setIsEncrypting] = useState(false)
  const [pendingAdminCredentials, setPendingAdminCredentials] = useState<SetupAdminCredentials | null>(
    null
  )
  const [pendingCommit, setPendingCommit] = useState<PendingSetupCommit | null>(null)
  const [recoveryAdminUsername, setRecoveryAdminUsername] = useState<string | null>(null)
  const [isEnteringWorkspace, setIsEnteringWorkspace] = useState(false)
  const encryptStartedRef = useRef(false)

  const handleDetectionFailure = useCallback(
    async (message: string) => {
      setLastError(message)
      setBlockedView('failed')
      setShowLegacyMigration(false)
      setStep('detect')
      await markSetupFailed(message)
      onError(message)
    },
    [onError]
  )

  const runEncryptionAndAdvanceToAdmin = useCallback(async () => {
    setIsEncrypting(true)
    setEncryptionError(null)
    onError('')
    try {
      await runSetupEncryption()
      await writeSetupProgress('admin_pending')
      setShowLegacyMigration(false)
      setBlockedView(null)
      setLastError(null)
      setIsEncrypting(false)
      setStep('admin')
    } catch {
      setEncryptionError(SETUP_ENCRYPTION_FAILED_MESSAGE)
      setIsEncrypting(false)
      setBlockedView('failed')
      setStep('detect')
      await markSetupFailed(SETUP_ENCRYPTION_FAILED_MESSAGE)
      onError(SETUP_ENCRYPTION_FAILED_MESSAGE)
    }
  }, [onError])

  const handleDetectionResult = useCallback(
    async (result: InstallDetectionResult) => {
      if (result.kind === 'legacy_password_derived') {
        setShowLegacyMigration(true)
        setBlockedView(null)
        setLastError(null)
        setStep('detect')
        return
      }

      if (result.route === 'sign_in') {
        await clearSetupProgress()
        onRequireSignIn()
        return
      }

      if (result.route === 'repair') {
        setShowLegacyMigration(false)
        setBlockedView('repair')
        setStep('detect')
        return
      }

      try {
        await preparePlainDatabaseForSetup()
        encryptStartedRef.current = false
        setStep('detect')
        setIsEncrypting(true)
        await runEncryptionAndAdvanceToAdmin()
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not prepare local database for setup'
        await handleDetectionFailure(message)
      }
    },
    [handleDetectionFailure, onRequireSignIn, runEncryptionAndAdvanceToAdmin]
  )

  const resumeFromProgress = useCallback(
    async (progress: NonNullable<Awaited<ReturnType<typeof readSetupProgress>>>) => {
      const detection = await detectInstallState()

      if (detection.kind === 'legacy_password_derived') {
        setShowLegacyMigration(true)
        setStep('detect')
        return
      }

      if (detection.route === 'sign_in') {
        await clearSetupProgress()
        onRequireSignIn()
        return
      }

      if (progress.phase === 'admin_pending') {
        if (detection.route !== 'admin') {
          setBlockedView('repair')
          setStep('detect')
          return
        }

        const encryptionReady = await isSetupEncryptionAlreadyPrepared()
        if (!encryptionReady) {
          setBlockedView('repair')
          setStep('detect')
          return
        }

        const adminCount = await getUnlockedDbAdminsCountIfAvailable()
        if (adminCount != null && adminCount > 0) {
          await writeSetupProgress('recovery_pending')
          setStep('recovery')
          return
        }

        setStep('admin')
        return
      }

      if (progress.phase === 'recovery_pending') {
        const encryptionReady = await isSetupEncryptionAlreadyPrepared()
        const adminCount = await getUnlockedDbAdminsCountIfAvailable()
        if (encryptionReady && adminCount != null && adminCount > 0) {
          setStep('recovery')
        } else {
          setBlockedView('repair')
          setStep('detect')
        }
        return
      }

      if (progress.phase === 'failed') {
        setLastError(progress.last_error ?? null)
        setBlockedView('failed')
        setStep('detect')
        return
      }

      if (progress.phase === 'detect') {
        setStep('detect')
      }
    },
    [onRequireSignIn]
  )

  useEffect(() => {
    if (resumeChecked) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const progress = await readSetupProgress()

        if (cancelled) {
          return
        }

        if (progress == null) {
          setResumeChecked(true)
          return
        }

        await resumeFromProgress(progress)

        if (!cancelled) {
          setResumeChecked(true)
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Could not resume setup progress'
          setLastError(message)
          setBlockedView('failed')
          setStep('detect')
          setResumeChecked(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [onRequireSignIn, resumeChecked, resumeFromProgress])

  useEffect(() => {
    if (step !== 'recovery' || pendingAdminCredentials != null) {
      if (step !== 'recovery') {
        setRecoveryAdminUsername(null)
      }
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const db = await getDb()
        const rows = await db.select<Array<{ username: string }>>(
          `SELECT username FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`,
          []
        )
        if (!cancelled) {
          setRecoveryAdminUsername(rows[0]?.username ?? null)
        }
      } catch {
        if (!cancelled) {
          setRecoveryAdminUsername(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pendingAdminCredentials, step])

  const beginSetup = async () => {
    await writeSetupProgress('detect')
    setBlockedView(null)
    setShowLegacyMigration(false)
    setLastError(null)
    setEncryptionError(null)
    setIsEncrypting(false)
    setDetectAttempt((value) => value + 1)
    setStep('detect')
  }

  const retryDetect = async () => {
    setBlockedView(null)
    setShowLegacyMigration(false)
    setLastError(null)
    setEncryptionError(null)
    setIsEncrypting(false)
    await writeSetupProgress('detect')
    setDetectAttempt((value) => value + 1)
    setStep('detect')
  }

  const handleAdminCreated = async (credentials: SetupAdminCredentials) => {
    setPendingAdminCredentials(credentials)
    await writeSetupProgress('recovery_pending')
    onError('')
    setStep('recovery')
  }

  const handleRecoveryContinue = async (plainRecoveryKey: string, adminPassword?: string) => {
    let credentials = pendingAdminCredentials
    if (credentials == null && adminPassword && recoveryAdminUsername) {
      credentials = {
        username: recoveryAdminUsername,
        password: adminPassword,
      }
    }

    const commit: PendingSetupCommit = {
      plainRecoveryKey,
      ...(credentials ? { credentials } : {}),
    }
    pendingCommitRef.current = commit
    setPendingCommit(commit)
    setPendingAdminCredentials(null)
    onError('')
    setStep('committing')
  }

  const handleSetupCommitSuccess = async (result: InitialAdminSetupResult) => {
    await clearSetupProgress()
    pendingCommitRef.current = null
    setPendingCommit(null)
    commitResultRef.current = result
    armSetupWorkspaceHandoff()
    setStep('done')
  }

  const handleEnterWorkspace = async () => {
    const result = commitResultRef.current
    if (!result || !isSetupWorkspaceHandoffArmed()) {
      return
    }

    if (!startSetupWorkspaceTransition()) {
      return
    }

    const reducedMotion = getPrefersReducedMotion()

    setIsEnteringWorkspace(true)
    try {
      await runSetupWorkspaceTransition({
        reducedMotion,
        onPersistSession: async () => {
          await onSetupComplete(result)
          commitResultRef.current = null
        },
      })
      disarmSetupWorkspaceHandoff()
    } catch (error) {
      resetSetupWorkspaceHandoffTransition()
      const message =
        error instanceof Error ? error.message : 'Could not enter workspace'
      onError(message)
      throw error
    } finally {
      setIsEnteringWorkspace(false)
    }
  }

  if (!resumeChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <p className="text-sm text-muted-foreground">Loading setup…</p>
        </div>
      </main>
    )
  }

  if (step === 'done') {
    return (
      <SetupDoneScreen
        busy={busy || isEnteringWorkspace}
        contentFadingOut={handoff.phase === 'fadingWelcome'}
        onEnterWorkspace={handleEnterWorkspace}
      />
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {step === 'welcome' && (
          <SetupWelcomeScreen busy={busy} onBeginSetup={() => void beginSetup()} />
        )}
        {step === 'detect' && showLegacyMigration && (
          <SetupLegacyMigrationScreen busy={busy} onRequireSignIn={onRequireSignIn} />
        )}
        {step === 'detect' && !showLegacyMigration && blockedView === 'repair' && (
          <SetupBlockedScreen busy={busy} lastError={lastError} onRetry={() => void retryDetect()} />
        )}
        {step === 'detect' && !showLegacyMigration && blockedView === 'failed' && (
          <SetupBlockedScreen busy={busy} lastError={lastError} onRetry={() => void retryDetect()} />
        )}
        {step === 'detect' && !showLegacyMigration && blockedView == null && isEncrypting && (
          <SetupEncryptingScreen lastError={encryptionError} />
        )}
        {step === 'detect' && !showLegacyMigration && blockedView == null && !isEncrypting && (
          <SetupDetectStep
            key={detectAttempt}
            busy={busy}
            detectInstallState={detectInstallState}
            onDetected={(result) => void handleDetectionResult(result)}
            onError={(message) => void handleDetectionFailure(message)}
          />
        )}
        {step === 'admin' && (
          <SetupAdminAccountScreen
            busy={busy}
            onAdminCreated={handleAdminCreated}
            onError={onError}
          />
        )}
        {step === 'recovery' && (
          <SetupRecoveryScreen
            busy={busy}
            needsAdminPassword={pendingAdminCredentials == null && recoveryAdminUsername != null}
            adminUsername={recoveryAdminUsername}
            onContinue={handleRecoveryContinue}
            onError={onError}
          />
        )}
        {step === 'committing' && pendingCommit && (
          <SetupCommittingScreen
            busy={busy}
            pendingCommit={pendingCommit}
            onSuccess={handleSetupCommitSuccess}
            onError={onError}
          />
        )}
      </div>
    </main>
  )
}
