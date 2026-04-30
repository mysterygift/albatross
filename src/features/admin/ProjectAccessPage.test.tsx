// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProjectAccessRoute } from '@/features/admin/ProjectAccessPage'

const authSessionState = vi.hoisted(() => ({
  isLoading: false,
  authSupported: true,
  isAuthenticated: true,
  isInstanceAdmin: false,
  currentUser: { id: 'actor-1', username: 'admin', role: 'admin' as const },
}))

const productionContextState = vi.hoisted(() => ({
  currentProductionId: 'prod-1' as string | null,
  currentProduction: {
    id: 'prod-1',
    name: 'Project Alpha',
    slug: 'project-alpha',
    currency_code: 'GBP',
    notes: null,
    is_episodic: false,
    wrapped_at: null,
    archived_at: null,
    created_from_template: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
  },
  setCurrentProductionId: vi.fn(),
}))

const service = vi.hoisted(() => ({
  canManageProjectAccessForActor: vi.fn(),
  listProjectMembersForActor: vi.fn(),
  listAssignableUsersForProjectForActor: vi.fn(),
  addProjectMemberForActor: vi.fn(),
  updateProjectMemberAccessForActor: vi.fn(),
  removeProjectMemberForActor: vi.fn(),
}))

vi.mock('@/lib/auth/useAuthSession', () => ({
  useAuthSession: () => authSessionState,
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    currentProductionId: productionContextState.currentProductionId,
    currentProduction: productionContextState.currentProduction,
    setCurrentProductionId: productionContextState.setCurrentProductionId,
    productions: productionContextState.currentProduction ? [productionContextState.currentProduction] : [],
    refetchProductions: vi.fn(),
    getSelectedBudgetRevisionId: () => null,
    setSelectedBudgetRevisionId: vi.fn(),
    clearSelectedBudgetRevisionId: vi.fn(),
  }),
}))

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(async () => ({ dialect: 'postgres' })),
}))

vi.mock('@/lib/access/projectAccessService', () => service)

function renderWithProviders(initialPath = '/settings/project-access') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/settings" element={<div>Settings</div>} />
          <Route path="/settings/project-access" element={<ProjectAccessRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProjectAccessRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    HTMLElement.prototype.scrollIntoView = () => {}
    authSessionState.isLoading = false
    authSessionState.authSupported = true
    authSessionState.isAuthenticated = true
    authSessionState.currentUser = { id: 'actor-1', username: 'admin', role: 'admin' }
    productionContextState.currentProductionId = 'prod-1'
    service.canManageProjectAccessForActor.mockResolvedValue(true)
    service.listProjectMembersForActor.mockResolvedValue([
      {
        id: 'm-1',
        production_id: 'prod-1',
        user_id: 'u-1',
        username: 'alice',
        user_role: 'user',
        user_disabled_at: null,
        access_level: 'viewer',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'm-2',
        production_id: 'prod-1',
        user_id: 'u-2',
        username: 'bob',
        user_role: 'admin',
        user_disabled_at: '2026-01-02T00:00:00.000Z',
        access_level: 'administrator',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        revoked_at: null,
      },
    ])
    service.listAssignableUsersForProjectForActor.mockResolvedValue([
      { id: 'u-3', username: 'charlie', role: 'user', disabled_at: null },
      { id: 'u-4', username: 'dora', role: 'user', disabled_at: '2026-01-03T00:00:00.000Z' },
    ])
    service.addProjectMemberForActor.mockResolvedValue(undefined)
    service.updateProjectMemberAccessForActor.mockResolvedValue(undefined)
    service.removeProjectMemberForActor.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('authorized admin sees project access UI; unauthorized users are redirected', async () => {
    renderWithProviders()
    expect(await screen.findByText('Project Access')).toBeTruthy()

    service.canManageProjectAccessForActor.mockResolvedValueOnce(false)
    renderWithProviders()
    await waitFor(() => expect(screen.getByText('Settings')).toBeTruthy())
  })

  it('renders members, marks disabled users, and supports add/update/revoke flows', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    expect(await screen.findByText('alice')).toBeTruthy()
    expect(await screen.findByText('bob')).toBeTruthy()
    expect(await screen.findByText('disabled')).toBeTruthy()
    expect((await screen.findAllByText(/excluded from assignment/i)).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('combobox')[0]!)
    await user.click(await screen.findByText(/charlie/))
    const addButtons = screen.getAllByRole('button', { name: 'Add member' })
    const firstEnabledAdd = addButtons.find((button) => !(button as HTMLButtonElement).disabled)
    await user.click(firstEnabledAdd!)
    await waitFor(() =>
      expect(service.addProjectMemberForActor).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: 'u-3',
          accessLevel: 'viewer',
        })
      )
    )

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find((row) => within(row).queryByText('alice'))
    expect(aliceRow).toBeTruthy()
    const aliceCombobox = within(aliceRow!).getByRole('combobox')
    await user.click(aliceCombobox)
    await user.click(await screen.findByText('editor'))
    await waitFor(() => expect(service.updateProjectMemberAccessForActor).toHaveBeenCalled())

    await user.click(within(aliceRow!).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(service.removeProjectMemberForActor).toHaveBeenCalled())
  })

  it('handles no current project selected state', async () => {
    productionContextState.currentProductionId = null
    renderWithProviders()
    expect(await screen.findByText('Select a project first to manage access.')).toBeTruthy()
  })
})
