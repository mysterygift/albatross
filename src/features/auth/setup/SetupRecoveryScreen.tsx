import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateRecoveryKey } from '@/lib/security/recoveryKey'

type SetupRecoveryScreenProps = {
  busy: boolean
  needsAdminPassword?: boolean
  adminUsername?: string | null
  onContinue: (plainRecoveryKey: string, adminPassword?: string) => void | Promise<void>
  onError: (message: string) => void
}

export function SetupRecoveryScreen({
  busy,
  needsAdminPassword = false,
  adminUsername,
  onContinue,
  onError,
}: SetupRecoveryScreenProps) {
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [savedConfirmation, setSavedConfirmation] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handedOffRef = useRef(false)

  useEffect(() => {
    if (handedOffRef.current || recoveryKey != null) return
    setRecoveryKey(generateRecoveryKey())
  }, [recoveryKey])

  const handleContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recoveryKey || !savedConfirmation) return
    if (needsAdminPassword && !adminPassword) return
    onError('')
    setIsSubmitting(true)
    const key = recoveryKey
    const password = needsAdminPassword ? adminPassword : undefined
    try {
      await onContinue(key, password)
      handedOffRef.current = true
      setRecoveryKey(null)
      setSavedConfirmation(false)
      setAdminPassword('')
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Could not continue setup'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const wizardBusy = busy || isSubmitting
  const canSubmit =
    savedConfirmation && (!needsAdminPassword || adminPassword.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Save your recovery key</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => void handleContinue(event)}>
          <p className="text-sm text-muted-foreground">
            This recovery key will not be shown again. Store it outside Albatross — for example in a
            password manager or written down in a safe place.
          </p>
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Without this recovery key, your local encrypted data cannot be recovered if you forget your
            password. If you lose both your password and this recovery key, your local encrypted data
            is unrecoverable. Albatross cannot recover your data for you — there is no cloud or support
            reset.
          </p>
          {recoveryKey && (
            <div
              className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm tracking-wide break-all select-all"
              aria-label="Recovery key"
            >
              {recoveryKey}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Store this in a password manager or another safe place.
          </p>
          {needsAdminPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="setup-recovery-admin-password">
                Admin password{adminUsername ? ` (${adminUsername})` : ''}
              </Label>
              <Input
                id="setup-recovery-admin-password"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                autoComplete="current-password"
                disabled={wizardBusy}
              />
              <p className="text-xs text-muted-foreground">
                Re-enter your administrator password to finish securing this install.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Checkbox
              id="auth-recovery-key-saved"
              checked={savedConfirmation}
              onCheckedChange={(checked) => setSavedConfirmation(checked === true)}
              disabled={wizardBusy}
            />
            <Label htmlFor="auth-recovery-key-saved" className="cursor-pointer text-sm leading-snug">
              I have saved this recovery key
            </Label>
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={wizardBusy || !canSubmit}
          >
            {wizardBusy ? 'Continuing…' : 'Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
