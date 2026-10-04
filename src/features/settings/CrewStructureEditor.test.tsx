// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'

const upsertMock = vi.fn()
const resetMock = vi.fn()

function makeConfig(): CrewHierarchyConfig {
  return {
    version: 1,
    departments: [
      {
        id: 'd-camera',
        name: 'Camera',
        sort_order: 0,
        hod_role_name: 'Director of Photography',
        task_department_labels: ['Camera'],
        roles: [
          { id: 'r-dop', name: 'Director of Photography', sort_order: 0 },
          { id: 'r-op', name: 'Camera Operator', sort_order: 1 },
        ],
      },
      {
        id: 'd-art',
        name: 'Art',
        sort_order: 1,
        hod_role_name: null,
        task_department_labels: [],
        roles: [{ id: 'r-pd', name: 'Production Designer', sort_order: 0 }],
      },
    ],
  }
}

vi.mock('@/lib/people/crewHierarchyResolver', () => ({
  getEffectiveCrewHierarchyOrDefault: vi.fn(async () => makeConfig()),
}))
vi.mock('@/lib/db/repositories/crewHierarchyConfig', () => ({
  upsertCrewHierarchyConfig: (...args: unknown[]) => upsertMock(...args),
  resetCrewHierarchyConfigToDefault: (...args: unknown[]) => resetMock(...args),
}))

import { CrewStructureEditor } from '@/features/settings/CrewStructureEditor'

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CrewStructureEditor productionId="p1" />
    </QueryClientProvider>
  )
}

async function findRail() {
  await screen.findByRole('textbox', { name: 'Department name' })
}

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue(undefined)
  resetMock.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('CrewStructureEditor', () => {
  it('only deletes a department after the user clicks Confirm', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.click(screen.getByRole('button', { name: 'Delete department' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete Camera?')).toBeTruthy()
    expect(within(dialog).getByText(/This cannot be undone/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Camera\d+ roles?/, hidden: true })).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: /^Camera\d+ roles?/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Art\d+ roles?/ })).toBeTruthy()
  })

  it('keeps the department when the delete dialog is cancelled', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.click(screen.getByRole('button', { name: 'Delete department' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: /^Camera\d+ roles?/ })).toBeTruthy()
  })

  it('keeps the HOD attached when the HOD role is renamed, and saves the new name', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    const roleInput = screen.getAllByRole('textbox', { name: 'Role name' })[0]
    await user.clear(roleInput)
    await user.type(roleInput, 'DoP')

    expect(screen.getByText(/Head of department:/).textContent).toContain('DoP')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    const saved = upsertMock.mock.calls[0][1] as CrewHierarchyConfig
    expect(saved.departments[0].hod_role_name).toBe('DoP')
    expect(saved.departments[0].roles[0].name).toBe('DoP')
  })

  it('toggles the HOD from a role row', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.click(screen.getByRole('button', { name: 'Unset Director of Photography as head of department' }))
    expect(screen.getByText(/No head of department/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Set Camera Operator as head of department' }))
    expect(screen.getByText(/Head of department:/).textContent).toContain('Camera Operator')
  })

  it('adds several roles from a comma separated list', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.type(screen.getByRole('textbox', { name: 'New role' }), 'Gaffer, Best Boy{Enter}')

    expect(screen.getAllByRole('textbox', { name: 'Role name' })).toHaveLength(4)
    expect(screen.getByText('4 roles', { selector: 'span' })).toBeTruthy()
  })

  it('blocks saving and flags the department when a name is empty', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.clear(screen.getByRole('textbox', { name: 'Department name' }))

    expect(screen.getByText('Name this department.')).toBeTruthy()
    expect(screen.getByText('1 issue to fix')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('adds and removes task labels', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.type(screen.getByRole('textbox', { name: 'New task label' }), 'Grip{Enter}')
    expect(screen.getByRole('button', { name: 'Remove label Grip' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Remove label Camera' }))
    expect(screen.queryByRole('button', { name: 'Remove label Camera' })).toBeNull()
  })

  it('discards unsaved edits', async () => {
    const user = userEvent.setup()
    renderEditor()
    await findRail()

    await user.type(screen.getByRole('textbox', { name: 'Department name' }), ' Unit')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect((screen.getByRole('textbox', { name: 'Department name' }) as HTMLInputElement).value).toBe('Camera')
    expect(screen.getByText('All changes saved')).toBeTruthy()
  })
})
