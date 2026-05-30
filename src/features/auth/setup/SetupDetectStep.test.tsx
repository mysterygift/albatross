// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetupDetectStep } from '@/features/auth/setup/SetupDetectStep'

describe('SetupDetectStep', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it('shows preparing state and reports detection result', async () => {
    const onDetected = vi.fn()
    const detectInstallState = vi.fn(async () => ({
      kind: 'fresh_install' as const,
      route: 'admin' as const,
      diagnostics: {
        dbFileExists: false,
        encryptionMetaExists: false,
        isPlainSqlite: true,
        encryptionMode: 'none' as const,
        recoveryMetaExists: false,
        activeWrapperCount: 0,
        plainAdminCount: 0,
      },
    }))

    render(
      <SetupDetectStep
        busy={false}
        detectInstallState={detectInstallState}
        onDetected={onDetected}
        onError={vi.fn()}
      />
    )

    expect(screen.getByText('Preparing database…')).toBeTruthy()
    await waitFor(() => expect(onDetected).toHaveBeenCalled())
  })

  it('reports errors from detection', async () => {
    const onError = vi.fn()
    render(
      <SetupDetectStep
        busy={false}
        detectInstallState={vi.fn(async () => {
          throw new Error('Detection failed')
        })}
        onDetected={vi.fn()}
        onError={onError}
      />
    )

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Detection failed'))
  })
})
