// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetupRecoveryScreen } from '@/features/auth/setup/SetupRecoveryScreen'

const TEST_RECOVERY_KEY =
  '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'

const recoveryMocks = vi.hoisted(() => ({
  generateRecoveryKey: vi.fn(() => TEST_RECOVERY_KEY),
}))

const progressMocks = vi.hoisted(() => ({
  writeSetupProgress: vi.fn(async () => undefined),
}))

vi.mock('@/lib/security/recoveryKey', () => recoveryMocks)
vi.mock('@/lib/auth/setupProgress', () => progressMocks)

describe('SetupRecoveryScreen', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    recoveryMocks.generateRecoveryKey.mockReturnValue(TEST_RECOVERY_KEY)
  })

  it('generates recovery key on mount and displays it in monospace block', async () => {
    render(<SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />)

    expect(await screen.findByLabelText('Recovery key')).toBeTruthy()
    expect(screen.getByLabelText('Recovery key').textContent).toBe(TEST_RECOVERY_KEY)
    expect(recoveryMocks.generateRecoveryKey).toHaveBeenCalledTimes(1)
  })

  it('does not regenerate recovery key on rerender', async () => {
    const { rerender } = render(
      <SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />
    )

    await screen.findByLabelText('Recovery key')
    rerender(<SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />)

    expect(recoveryMocks.generateRecoveryKey).toHaveBeenCalledTimes(1)
  })

  it('shows warning copy about show-once, no cloud recovery, and unrecoverable data', async () => {
    render(<SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />)

    expect(await screen.findByText(/will not be shown again/i)).toBeTruthy()
    expect(screen.getByText(/cannot be recovered if you forget your password/i)).toBeTruthy()
    expect(screen.getByText(/no cloud or support reset/i)).toBeTruthy()
    expect(screen.getByText(/lose both your password and this recovery key/i)).toBeTruthy()
  })

  it('disables Continue until acknowledgment is checked', async () => {
    const user = userEvent.setup()
    render(<SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />)

    const continueButton = await screen.findByRole('button', { name: 'Continue' })
    expect(continueButton.hasAttribute('disabled')).toBe(true)

    await user.click(screen.getByLabelText('I have saved this recovery key'))
    expect(continueButton.hasAttribute('disabled')).toBe(false)

    await user.click(screen.getByLabelText('I have saved this recovery key'))
    expect(continueButton.hasAttribute('disabled')).toBe(true)
  })

  it('calls onContinue with recovery key and clears display after successful submit', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn(async () => undefined)
    render(<SetupRecoveryScreen busy={false} onContinue={onContinue} onError={vi.fn()} />)

    await screen.findByLabelText('Recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(onContinue).toHaveBeenCalledWith(TEST_RECOVERY_KEY, undefined))
    expect(screen.queryByText(TEST_RECOVERY_KEY)).toBeNull()
  })

  it('does not persist plaintext recovery key to setup progress', async () => {
    const user = userEvent.setup()
    render(<SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />)

    await screen.findByLabelText('Recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(progressMocks.writeSetupProgress).not.toHaveBeenCalled()
    for (const call of progressMocks.writeSetupProgress.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TEST_RECOVERY_KEY)
    }
  })

  it('does not log recovery key material', async () => {
    const user = userEvent.setup()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<SetupRecoveryScreen busy={false} onContinue={vi.fn()} onError={vi.fn()} />)

    await screen.findByLabelText('Recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(TEST_RECOVERY_KEY)
      }
    }

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('restores key for retry when onContinue rejects', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn(async () => {
      throw new Error('Handoff failed')
    })
    const onError = vi.fn()
    render(<SetupRecoveryScreen busy={false} onContinue={onContinue} onError={onError} />)

    await screen.findByLabelText('Recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Handoff failed'))
    expect(screen.getByLabelText('Recovery key').textContent).toBe(TEST_RECOVERY_KEY)
    expect(recoveryMocks.generateRecoveryKey).toHaveBeenCalledTimes(1)
  })
})
