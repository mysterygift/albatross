import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RECOVERY_FAILED_MESSAGE,
  recoverAdminPasswordWithRecoveryKey,
} from '@/lib/security/passwordRecoveryService'

type ForgotPasswordRecoveryCardProps = {
  busy: boolean
  onBack: () => void
  onSuccess: () => void
}

export function ForgotPasswordRecoveryCard({
  busy,
  onBack,
  onSuccess,
}: ForgotPasswordRecoveryCardProps) {
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await recoverAdminPasswordWithRecoveryKey({
        recoveryKey,
        newPassword,
        confirmPassword,
        adminUsername: adminUsername.trim() || undefined,
      })
      setCompleted(true)
      onSuccess()
    } catch (recoveryError) {
      const message =
        recoveryError instanceof Error ? recoveryError.message : RECOVERY_FAILED_MESSAGE
      if (message === RECOVERY_FAILED_MESSAGE) {
        setError(RECOVERY_FAILED_MESSAGE)
      } else {
        setError(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const cardBusy = busy || isSubmitting

  if (completed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password recovered</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in with your new admin password.
          </p>
          <Button type="button" className="w-full" onClick={onBack}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recover admin password</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            Enter the recovery key you saved during initial admin setup and choose a new admin password.
            Albatross cannot recover your data without this key — there is no cloud or support reset.
            When DEK escrow is configured, encrypted client contact data is preserved.
          </p>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-recovery-key-input">Recovery key</Label>
            <Input
              id="auth-recovery-key-input"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              autoComplete="off"
              disabled={cardBusy}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-recovery-admin-username">Admin username (optional)</Label>
            <Input
              id="auth-recovery-admin-username"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              autoComplete="username"
              disabled={cardBusy}
              placeholder="Leave blank to reset all admins"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-recovery-new-password">New admin password</Label>
            <Input
              id="auth-recovery-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={cardBusy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-recovery-confirm-password">Confirm new password</Label>
            <Input
              id="auth-recovery-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={cardBusy}
            />
          </div>
          <Button type="submit" className="w-full" disabled={cardBusy}>
            {cardBusy ? 'Recovering...' : 'Recover password'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={cardBusy}>
            Back to sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
