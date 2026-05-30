import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getNormalizedUsername, setupInitialAdmin } from '@/lib/auth/authService'
import {
  MIN_PASSWORD_LENGTH,
  validateInitialAdminCredentials,
} from '@/lib/auth/credentialPolicy'
import {
  isSetupEncryptionAlreadyPrepared,
  SETUP_ENCRYPTION_FAILED_MESSAGE,
} from '@/lib/auth/setupEncryptionService'
import { isDbUnlocked, getDb } from '@/lib/db/client'

export type SetupAdminCredentials = {
  username: string
  password: string
}

type SetupAdminAccountScreenProps = {
  busy: boolean
  onAdminCreated: (credentials: SetupAdminCredentials) => void | Promise<void>
  onError: (message: string) => void
}

export function SetupAdminAccountScreen({
  busy,
  onAdminCreated,
  onError,
}: SetupAdminAccountScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validation = useMemo(
    () =>
      validateInitialAdminCredentials({
        username,
        password,
        confirmPassword,
      }),
    [confirmPassword, password, username]
  )

  const formBusy = busy || isSubmitting
  const canSubmit = validation.ok && !formBusy

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.ok || formBusy) {
      return
    }

    onError('')
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      if (!(await isSetupEncryptionAlreadyPrepared()) || !isDbUnlocked()) {
        throw new Error(SETUP_ENCRYPTION_FAILED_MESSAGE)
      }

      const normalizedUsername = getNormalizedUsername(username)
      const db = await getDb()
      await setupInitialAdmin(db, {
        username: normalizedUsername,
        password,
        confirmPassword,
        createSession: false,
      })

      await onAdminCreated({
        username: normalizedUsername,
        password,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Admin setup failed'
      setSubmitError(message)
      onError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up admin account</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="setup-admin-username">Username</Label>
            <Input
              id="setup-admin-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={formBusy}
            />
            {validation.fieldErrors.username && (
              <p className="text-xs text-destructive">{validation.fieldErrors.username}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-admin-password">Password</Label>
            <Input
              id="setup-admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={formBusy}
            />
            {validation.fieldErrors.password && (
              <p className="text-xs text-destructive">{validation.fieldErrors.password}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-admin-confirm-password">Confirm password</Label>
            <Input
              id="setup-admin-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              disabled={formBusy}
            />
            {validation.fieldErrors.confirmPassword && (
              <p className="text-xs text-destructive">{validation.fieldErrors.confirmPassword}</p>
            )}
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className={validation.checklist.minLength ? 'text-foreground' : undefined}>
              {validation.checklist.minLength ? '✓' : '○'} At least {MIN_PASSWORD_LENGTH}{' '}
              characters
            </li>
            <li className={validation.checklist.passwordsMatch ? 'text-foreground' : undefined}>
              {validation.checklist.passwordsMatch ? '✓' : '○'} Passwords match
            </li>
          </ul>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <Button type="submit" variant="outline" className="w-full" disabled={!canSubmit}>
            {formBusy ? 'Creating admin…' : 'Create admin account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
