// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AdminOnlyUserManagementRoute, UserManagementPage } from '@/features/admin/UserManagementPage'

const authSessionState = vi.hoisted(() => ({
  isLoading: false,
  authSupported: true,
  isAuthenticated: true,
  isInstanceAdmin: true,
  currentUser: { id: 'actor-1', username: 'admin', role: 'admin' as const },
}))

const service = vi.hoisted(() => ({
  listUsersAsAdmin: vi.fn(),
  createUserAsAdmin: vi.fn(),
  disableUserAsAdmin: vi.fn(),
  enableUserAsAdmin: vi.fn(),
  resetUserPasswordAsAdmin: vi.fn(),
  updateUserRoleAsAdmin: vi.fn(),
  listUserProjectVisibilityAsAdmin: vi.fn(),
  listProductionsBriefAsAdmin: vi.fn(),
  grantUserProjectAccessAsAdmin: vi.fn(),
  updateUserProjectAccessAsAdmin: vi.fn(),
  revokeUserProjectAccessAsAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/useAuthSession', () => ({
  useAuthSession: () => authSessionState,
}))

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(async () => ({ dialect: 'postgres' })),
}))

vi.mock('@/lib/auth/adminUserManagementService', () => service)

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UserManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authSessionState.isLoading = false
    authSessionState.authSupported = true
    authSessionState.isAuthenticated = true
    authSessionState.isInstanceAdmin = true
    authSessionState.currentUser = { id: 'actor-1', username: 'admin', role: 'admin' }
    service.listUsersAsAdmin.mockResolvedValue([
      {
        id: 'u-1',
        username: 'alice',
        role: 'user',
        disabled_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'u-2',
        username: 'bob',
        role: 'admin',
        disabled_at: '2026-01-02T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ])
    service.createUserAsAdmin.mockResolvedValue(undefined)
    service.disableUserAsAdmin.mockResolvedValue(undefined)
    service.enableUserAsAdmin.mockResolvedValue(undefined)
    service.resetUserPasswordAsAdmin.mockResolvedValue(undefined)
    service.updateUserRoleAsAdmin.mockResolvedValue(undefined)
    service.listUserProjectVisibilityAsAdmin.mockResolvedValue([])
    service.listProductionsBriefAsAdmin.mockResolvedValue([])
    service.grantUserProjectAccessAsAdmin.mockResolvedValue({})
    service.updateUserProjectAccessAsAdmin.mockResolvedValue({})
    service.revokeUserProjectAccessAsAdmin.mockResolvedValue(undefined)
  })

  it('admin route renders for admin and redirects non-admin users', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/settings/users']}>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/settings/users" element={<AdminOnlyUserManagementRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText('User Management')).toBeTruthy()

    authSessionState.isInstanceAdmin = false
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/settings/users']}>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/settings/users" element={<AdminOnlyUserManagementRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Home')).toBeTruthy())
  })

  it('renders user list and supports create/disable/reset/role change actions', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UserManagementPage />)

    expect(await screen.findByText('alice')).toBeTruthy()
    expect(await screen.findByText('bob')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const createDialog = await screen.findByRole('dialog')
    await user.type(within(createDialog).getByLabelText('Username'), 'charlie')
    await user.type(within(createDialog).getByLabelText('Temporary password'), 'password123')
    await user.click(within(createDialog).getByRole('button', { name: 'Create user' }))
    await waitFor(() => {
      expect(service.createUserAsAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'charlie',
          password: 'password123',
          role: 'user',
        })
      )
    })

    await user.click(screen.getByRole('button', { name: 'Disable alice' }))
    expect(await screen.findByRole('heading', { name: 'Disable user?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^Disable user$/ }))
    await waitFor(() => expect(service.disableUserAsAdmin).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Enable bob' }))
    await waitFor(() => expect(service.enableUserAsAdmin).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Reset password alice' }))
    const resetDialog = await screen.findByRole('dialog')
    await user.type(within(resetDialog).getByLabelText('New temporary password'), 'newpass123')
    await user.click(within(resetDialog).getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(service.resetUserPasswordAsAdmin).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Change role alice' }))
    const roleDialog = await screen.findByRole('dialog')
    await user.click(within(roleDialog).getByRole('button', { name: 'Save role' }))
    await waitFor(() => expect(service.updateUserRoleAsAdmin).toHaveBeenCalled())
  })

  it('opens project visibility dialog and loads visibility plus production lists', async () => {
    const user = userEvent.setup()
    service.listProductionsBriefAsAdmin.mockResolvedValue([
      { id: 'p-1', name: 'Demo Prod', archived_at: null },
    ])
    service.listUserProjectVisibilityAsAdmin.mockResolvedValue([
      {
        membership_id: 'm-1',
        production_id: 'p-1',
        production_name: 'Demo Prod',
        access_level: 'editor',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ])
    renderWithProviders(<UserManagementPage />)
    await screen.findByText('alice')
    await user.click(screen.getByRole('button', { name: 'Project visibility alice' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Project visibility')).toBeTruthy()
    await waitFor(() => {
      expect(service.listUserProjectVisibilityAsAdmin).toHaveBeenCalled()
      expect(service.listProductionsBriefAsAdmin).toHaveBeenCalled()
    })
    expect(within(dialog).getByText('Demo Prod')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Revoke' })).toBeTruthy()
  })

  it('renders clear error states', async () => {
    service.listUsersAsAdmin.mockRejectedValueOnce(new Error('Forbidden'))
    renderWithProviders(<UserManagementPage />)
    expect(await screen.findByText('Forbidden')).toBeTruthy()
  })
})
