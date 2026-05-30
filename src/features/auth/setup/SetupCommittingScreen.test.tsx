// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetupCommittingScreen } from '@/features/auth/setup/SetupCommittingScreen'

const commitMocks = vi.hoisted(() => ({
  runSetupCommit: vi.fn(async () => ({
    sessionToken: 'session-token',
    repairedPeople: 0,
  })),
}))

vi.mock('@/lib/auth/setupCommitService', () => ({
  runSetupCommit: commitMocks.runSetupCommit,
  SETUP_COMMIT_FAILED_MESSAGE: 'Could not finish securing your workspace. Try again.',
}))

const TEST_RECOVERY_KEY =
  '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'

describe('SetupCommittingScreen', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    commitMocks.runSetupCommit.mockResolvedValue({
      sessionToken: 'session-token',
      repairedPeople: 0,
    })
  })

  it('announces progress accessibly while committing', async () => {
    commitMocks.runSetupCommit.mockReturnValueOnce(new Promise(() => undefined))

    render(
      <SetupCommittingScreen
        busy={false}
        pendingCommit={{
          plainRecoveryKey: TEST_RECOVERY_KEY,
          credentials: {
            username: 'admin',
            password: 'validpass123',
          },
        }}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />
    )

    const status = await screen.findByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-busy')).toBe('true')
  })

  it('shows retry after commit failure without calling onSuccess', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    commitMocks.runSetupCommit.mockRejectedValueOnce(
      new Error('Could not finish securing your workspace. Try again.')
    )

    render(
      <SetupCommittingScreen
        busy={false}
        pendingCommit={{
          plainRecoveryKey: TEST_RECOVERY_KEY,
          credentials: {
            username: 'admin',
            password: 'validpass123',
          },
        }}
        onSuccess={onSuccess}
        onError={vi.fn()}
      />
    )

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(onSuccess).not.toHaveBeenCalled()

    commitMocks.runSetupCommit.mockResolvedValueOnce({
      sessionToken: 'session-token',
      repairedPeople: 0,
    })
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })
})
