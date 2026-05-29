// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ForgotPasswordRecoveryCard } from '@/features/auth/ForgotPasswordRecoveryCard'

const recoveryServiceMocks = vi.hoisted(() => ({
  recoverAdminPasswordWithRecoveryKey: vi.fn(async () => undefined),
}))

vi.mock('@/lib/security/passwordRecoveryService', () => ({
  RECOVERY_FAILED_MESSAGE: 'Recovery failed',
  recoverAdminPasswordWithRecoveryKey: recoveryServiceMocks.recoverAdminPasswordWithRecoveryKey,
}))

describe('ForgotPasswordRecoveryCard', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    recoveryServiceMocks.recoverAdminPasswordWithRecoveryKey.mockResolvedValue(undefined)
  })

  it('shows recovery policy copy including no cloud or support reset', () => {
    render(
      <ForgotPasswordRecoveryCard busy={false} onBack={vi.fn()} onSuccess={vi.fn()} />
    )
    expect(screen.getByText(/saved during initial admin setup/i)).toBeTruthy()
    expect(screen.getByText(/Albatross cannot recover your data without this key/i)).toBeTruthy()
    expect(screen.getByText(/no cloud or support reset/i)).toBeTruthy()
  })

  it('shows generic Recovery failed on invalid recovery without echoing the key', async () => {
    const secretKey = 'DEADBEEF-DEADBEEF-DEADBEEF-DEADBEEF-DEADBEEF-DEADBEEF-DEADBEEF-DEADBEEF'
    recoveryServiceMocks.recoverAdminPasswordWithRecoveryKey.mockRejectedValue(
      new Error('Recovery failed')
    )
    const user = userEvent.setup()
    render(
      <ForgotPasswordRecoveryCard busy={false} onBack={vi.fn()} onSuccess={vi.fn()} />
    )

    await user.type(screen.getByLabelText('Recovery key'), secretKey)
    await user.type(screen.getByLabelText('New admin password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Recover password' }))

    await waitFor(() => {
      expect(screen.getByText('Recovery failed')).toBeTruthy()
    })
    expect(screen.queryByText(secretKey)).toBeNull()
  })

  it('shows password validation errors from the service', async () => {
    recoveryServiceMocks.recoverAdminPasswordWithRecoveryKey.mockRejectedValue(
      new Error('Passwords do not match')
    )
    const user = userEvent.setup()
    render(
      <ForgotPasswordRecoveryCard busy={false} onBack={vi.fn()} onSuccess={vi.fn()} />
    )

    await user.type(screen.getByLabelText('Recovery key'), '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888')
    await user.type(screen.getByLabelText('New admin password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Recover password' }))

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeTruthy()
    })
  })
})
