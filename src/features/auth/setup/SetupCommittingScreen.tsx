import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InitialAdminSetupResult, PendingSetupCommit } from '@/features/auth/setup/setupTypes'
import {
  runSetupCommit,
  SETUP_COMMIT_FAILED_MESSAGE,
  type SetupCommitProgressPhase,
} from '@/lib/auth/setupCommitService'

const PROGRESS_ROWS: Array<{ phase: SetupCommitProgressPhase; label: string }> = [
  { phase: 'encrypting_database', label: 'Encrypting local database' },
  { phase: 'creating_admin_access', label: 'Creating administrator access' },
  { phase: 'preparing_recovery', label: 'Preparing recovery protection' },
]

const PHASE_ORDER: SetupCommitProgressPhase[] = [
  'encrypting_database',
  'creating_admin_access',
  'preparing_recovery',
]

type SetupCommittingScreenProps = {
  busy: boolean
  pendingCommit: PendingSetupCommit
  onSuccess: (result: InitialAdminSetupResult) => void | Promise<void>
  onError: (message: string) => void
}

export function SetupCommittingScreen({
  busy,
  pendingCommit,
  onSuccess,
  onError,
}: SetupCommittingScreenProps) {
  const [activePhaseIndex, setActivePhaseIndex] = useState(-1)
  const [allComplete, setAllComplete] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const runCommit = useCallback(async () => {
    const credentials = pendingCommit.credentials
    if (!credentials?.username || !credentials.password) {
      const message = SETUP_COMMIT_FAILED_MESSAGE
      setErrorMessage(message)
      onError(message)
      return
    }

    setIsRunning(true)
    setErrorMessage(null)
    onError('')
    setActivePhaseIndex(-1)
    setAllComplete(false)

    try {
      const result = await runSetupCommit(
        {
          plainRecoveryKey: pendingCommit.plainRecoveryKey,
          username: credentials.username,
          password: credentials.password,
        },
        {
          onProgress: (phase) => {
            const idx = PHASE_ORDER.indexOf(phase)
            setActivePhaseIndex(idx)
          },
        }
      )

      setAllComplete(true)
      setActivePhaseIndex(PHASE_ORDER.length)
      await onSuccess(result)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : SETUP_COMMIT_FAILED_MESSAGE
      setErrorMessage(message)
      onError(message)
    } finally {
      setIsRunning(false)
    }
  }, [onError, onSuccess, pendingCommit])

  const runCommitRef = useRef(runCommit)
  runCommitRef.current = runCommit

  useEffect(() => {
    void runCommitRef.current()
  }, [attempt])

  const screenBusy = busy || isRunning

  return (
    <Card>
      <CardHeader>
        <CardTitle>Securing your workspace…</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
          aria-busy={screenBusy && !errorMessage}
          role="status"
        >
          Finalising encryption, recovery protection, and administrator access.
        </p>
        <ul className="space-y-1 text-xs">
          {PROGRESS_ROWS.map(({ phase, label }, index) => {
            const isComplete = allComplete || index < activePhaseIndex
            const isActive = !allComplete && index === activePhaseIndex

            return (
              <li
                key={phase}
                className={
                  isComplete || isActive ? 'text-foreground' : 'text-muted-foreground'
                }
              >
                {isComplete ? '✓' : '○'} {label}
              </li>
            )
          })}
        </ul>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        {errorMessage && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={screenBusy}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
