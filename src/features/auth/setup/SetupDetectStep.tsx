import { useEffect, useRef } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InstallDetectionResult } from '@/lib/auth/installDetection'

type SetupDetectStepProps = {
  busy: boolean
  onDetected: (result: InstallDetectionResult) => void
  onError: (message: string) => void
  detectInstallState: () => Promise<InstallDetectionResult>
}

export function SetupDetectStep({
  busy,
  onDetected,
  onError,
  detectInstallState,
}: SetupDetectStepProps) {
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current || busy) {
      return
    }
    startedRef.current = true
    void (async () => {
      try {
        const result = await detectInstallState()
        onDetected(result)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Could not prepare local database')
      }
    })()
  }, [busy, detectInstallState, onDetected, onError])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preparing database…</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
          aria-busy="true"
          role="status"
        >
          Albatross is checking your local database and preparing it for setup.
        </p>
      </CardContent>
    </Card>
  )
}
