// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetPage } from '@/features/budget/page'
import { ApfMenuEventBridge } from '@/features/productions/ApfMenuEventBridge'

const mockState = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => fn())
  return {
    listeners,
    notify,
    currentProductionId: 'prod-1' as string | null,
    selectedRevisionIdByProduction: {} as Record<string, string>,
    revisions: [] as Array<{
      id: string
      production_id: string
      name: string
      created_from_revision_id: string | null
      is_live: boolean
      approval: 'unapproved' | 'pending' | 'approved'
      created_at: string
      updated_at: string
      deleted_at: string | null
    }>,
  }
})

vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react')
  const Ctx = ReactModule.createContext<{ onValueChange?: (value: string) => void } | null>(null)
  return {
    Select: ({ children, onValueChange }: any) => (
      <Ctx.Provider value={{ onValueChange }}>
        <div>{children}</div>
      </Ctx.Provider>
    ),
    SelectTrigger: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder ?? null}</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children, value, disabled }: any) => {
      const ctx = ReactModule.useContext(Ctx)
      return (
        <div
          role="option"
          aria-disabled={disabled ? 'true' : 'false'}
          onClick={() => !disabled && ctx?.onValueChange?.(value)}
        >
          {children}
        </div>
      )
    },
  }
})

vi.mock('@/components/ui/dialog', async () => {
  const ReactModule = await import('react')
  const Ctx = ReactModule.createContext<{ open: boolean } | null>(null)
  return {
    Dialog: ({ open = false, children }: any) => <Ctx.Provider value={{ open }}>{children}</Ctx.Provider>,
    DialogTrigger: ({ children }: any) => children,
    DialogContent: ({ children }: any) => {
      const ctx = ReactModule.useContext(Ctx)
      return ctx?.open ? <div>{children}</div> : null
    },
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
  }
})

vi.mock('@/components/ui/tabs', async () => {
  const ReactModule = await import('react')
  const Ctx = ReactModule.createContext<{ onValueChange?: (value: string) => void } | null>(null)
  return {
    Tabs: ({ children, onValueChange }: any) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ children, value }: any) => {
      const ctx = ReactModule.useContext(Ctx)
      return (
        <button type="button" onClick={() => ctx?.onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    TabsContent: ({ children }: any) => <div>{children}</div>,
  }
})

vi.mock('@/features/productions/context', async () => {
  const ReactModule = await import('react')
  return {
    useCurrentProduction: () => {
      ReactModule.useSyncExternalStore(
        (cb) => {
          mockState.listeners.add(cb)
          return () => mockState.listeners.delete(cb)
        },
        () => `${mockState.currentProductionId}:${mockState.selectedRevisionIdByProduction['prod-1'] ?? ''}`
      )
      return {
        currentProductionId: mockState.currentProductionId,
        currentProduction: mockState.currentProductionId ? { id: 'prod-1', currency_code: 'GBP' } : null,
        productions: mockState.currentProductionId ? [{ id: 'prod-1', currency_code: 'GBP' }] : [],
        refetchProductions: vi.fn(),
        setCurrentProductionId: (id: string | null) => {
          mockState.currentProductionId = id
          mockState.notify()
        },
        getSelectedBudgetRevisionId: (productionId: string | null | undefined) =>
          productionId ? (mockState.selectedRevisionIdByProduction[productionId] ?? null) : null,
        setSelectedBudgetRevisionId: (productionId: string | null | undefined, revisionId: string | null) => {
          if (!productionId || !revisionId) return
          mockState.selectedRevisionIdByProduction[productionId] = revisionId
          mockState.notify()
        },
        clearSelectedBudgetRevisionId: vi.fn(),
      }
    },
  }
})

vi.mock('@/hooks/useWorkingBudgetRevision', async () => {
  const ReactModule = await import('react')
  return {
    useWorkingBudgetRevision: (productionId: string | null | undefined) => {
      ReactModule.useSyncExternalStore(
        (cb) => {
          mockState.listeners.add(cb)
          return () => mockState.listeners.delete(cb)
        },
        () => `${productionId ?? ''}:${mockState.selectedRevisionIdByProduction['prod-1'] ?? ''}:${mockState.revisions.map((r) => `${r.id}-${r.is_live}`).join('|')}`
      )
      const selectedId = productionId ? mockState.selectedRevisionIdByProduction[productionId] : null
      const selected =
        mockState.revisions.find((rev) => rev.id === selectedId) ??
        mockState.revisions.find((rev) => rev.is_live) ??
        null
      return {
        data: selected,
        setSelectedRevisionId: (revisionId: string) => {
          if (!productionId) return
          mockState.selectedRevisionIdByProduction[productionId] = revisionId
          mockState.notify()
        },
      }
    },
    useSetLiveBudgetRevisionMutation: () => ({
      isPending: false,
      mutateAsync: async ({ revisionId }: { productionId: string; revisionId: string }) => {
        mockState.revisions = mockState.revisions.map((rev) => ({
          ...rev,
          is_live: rev.id === revisionId,
        }))
        mockState.notify()
      },
    }),
  }
})

vi.mock('@/lib/db/repositories/budgetRevisions', () => ({
  listBudgetRevisionsByProduction: vi.fn(async () => [...mockState.revisions]),
  renameBudgetRevisionForProduction: vi.fn(
    async ({ revisionId, name }: { productionId: string; revisionId: string; name: string }) => {
      mockState.revisions = mockState.revisions.map((revision) =>
        revision.id === revisionId ? { ...revision, name, updated_at: 't2' } : revision
      )
      mockState.notify()
    }
  ),
  setBudgetRevisionApprovalForProduction: vi.fn(
    async ({
      revisionId,
      approval,
    }: {
      productionId: string
      revisionId: string
      approval: 'unapproved' | 'pending' | 'approved'
    }) => {
      mockState.revisions = mockState.revisions.map((revision) =>
        revision.id === revisionId ? { ...revision, approval, updated_at: 't2' } : revision
      )
      mockState.notify()
    }
  ),
  deleteBudgetRevisionForProduction: vi.fn(
    async ({ revisionId }: { productionId: string; revisionId: string }) => {
      mockState.revisions = mockState.revisions.filter((revision) => revision.id !== revisionId)
      mockState.notify()
    }
  ),
}))

vi.mock('@/lib/db/budgetRevisionService', () => ({
  createBlankBudgetRevision: vi.fn(async ({ productionId, name }: { productionId: string; name: string }) => {
    const created: (typeof mockState.revisions)[number] = {
      id: `rev-${mockState.revisions.length + 1}`,
      production_id: productionId,
      name,
      created_from_revision_id: null,
      is_live: false,
      approval: 'unapproved',
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    }
    mockState.revisions = [...mockState.revisions, created]
    mockState.notify()
    return created
  }),
  createBudgetRevisionFromExisting: vi.fn(
    async ({
      productionId,
      sourceRevisionId,
      newRevisionName,
    }: {
      productionId: string
      sourceRevisionId: string
      newRevisionName: string
    }) => {
      const created: (typeof mockState.revisions)[number] = {
        id: `rev-${mockState.revisions.length + 1}`,
        production_id: productionId,
        name: newRevisionName,
        created_from_revision_id: sourceRevisionId,
        is_live: false,
        approval: 'unapproved',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      }
      mockState.revisions = [...mockState.revisions, created]
      mockState.notify()
      return created
    }
  ),
  duplicateLiveBudgetRevisionAsDraft: vi.fn(async ({ productionId }: { productionId: string }) => {
    const live = mockState.revisions.find((rev) => rev.production_id === productionId && rev.is_live)
    if (!live) throw new Error('No live budget revision found')
    const created: (typeof mockState.revisions)[number] = {
      id: `rev-${mockState.revisions.length + 1}`,
      production_id: productionId,
      name: `${live.name} Draft`,
      created_from_revision_id: live.id,
      is_live: false,
      approval: 'unapproved',
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    }
    mockState.revisions = [...mockState.revisions, created]
    mockState.notify()
    return created
  }),
}))

vi.mock('@/features/budget/actualisation/page', () => ({ ActualisationPage: () => <div>Actualisation surface</div> }))
vi.mock('@/features/budget/FloatsTab', () => ({ FloatsTab: () => <div>Floats surface</div> }))
vi.mock('@/features/budget/LogSpendPanel', () => ({ LogSpendPanel: () => null }))
vi.mock('@/features/budget/ExpenseDetailPanel', () => ({ ExpenseDetailPanel: () => null }))
vi.mock('@/features/budget/LineItemDetailPanel', () => ({ LineItemDetailPanel: () => null }))

vi.mock('@/lib/db/repositories/budget', () => ({
  listBudgetCategoriesByProduction: vi.fn(async () => []),
  listBudgetItemsByProduction: vi.fn(async () => []),
  listExpensesByProduction: vi.fn(async () => []),
  createBudgetItem: vi.fn(),
  deleteExpense: vi.fn(),
  updateExpense: vi.fn(),
  updateExpenseAccount: vi.fn(),
  backfillAccountIdsFromLegacyCategories: vi.fn(async () => {}),
}))
vi.mock('@/lib/db/repositories/budgetReconciliation', () => ({
  listBudgetItemExpenseLinksForExpense: vi.fn(async () => []),
}))
vi.mock('@/lib/db/repositories/budgetAccounts', () => ({
  listAccounts: vi.fn(async () => []),
  listPostableAccounts: vi.fn(async () => []),
}))
vi.mock('@/lib/db/repositories/productionTotals', () => ({
  listProductionTotals: vi.fn(async () => []),
  createProductionTotal: vi.fn(),
  updateProductionTotal: vi.fn(),
  deleteProductionTotal: vi.fn(),
}))
vi.mock('@/lib/db/repositories/budgetDerived', () => ({
  listFringeRules: vi.fn(async () => []),
  listContingencyRules: vi.fn(async () => []),
  createFringeRule: vi.fn(),
  updateFringeRule: vi.fn(),
  deleteFringeRule: vi.fn(),
  setFringeRuleEnabled: vi.fn(),
  createContingencyRule: vi.fn(),
  updateContingencyRule: vi.fn(),
  deleteContingencyRule: vi.fn(),
  setContingencyRuleEnabled: vi.fn(),
}))
vi.mock('@/lib/db/repositories/costReportGroups', () => ({
  listCostReportGroupsWithAccountIds: vi.fn(async () => []),
}))
vi.mock('@/lib/db/repositories/expenseTransactions', () => ({
  getExpenseWithDetails: vi.fn(async () => null),
  listAllowExpenseDetailsByProduction: vi.fn(async () => []),
}))
vi.mock('@/lib/db/repositories/person', () => ({ listPeopleByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/location', () => ({ listLocationsByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/floats', () => ({ listFloatsByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/repositories/floatReconciliation', () => ({
  listFloatExpenseLinksByProduction: vi.fn(async () => []),
}))
vi.mock('@/lib/db/repositories/budgetItemDetails', () => ({
  getBudgetItemWithDetails: vi.fn(async () => null),
}))
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ format: (n: number) => String(n), ensureRate: vi.fn(), conversionBanner: null }),
}))
vi.mock('@/hooks/useFirstLaunchTutorial', () => ({
  useFirstLaunchTutorial: () => ({ progress: null, updateProgress: vi.fn() }),
}))
vi.mock('@/lib/files', () => ({ saveFileWithDialog: vi.fn(async () => {}) }))

function renderBudgetWorkspace(initialPath = '/budget?tab=budget') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ApfMenuEventBridge />
        <Routes>
          <Route path="/budget" element={<BudgetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { ...rendered, queryClient }
}

describe('Budget versioning integration flows', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    })
    mockState.currentProductionId = 'prod-1'
    mockState.revisions = [
      {
        id: 'live-1',
        production_id: 'prod-1',
        name: 'Current budget',
        created_from_revision_id: null,
        is_live: true,
        approval: 'approved',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
      {
        id: 'draft-1',
        production_id: 'prod-1',
        name: 'Scenario A',
        created_from_revision_id: 'live-1',
        is_live: false,
        approval: 'pending',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ]
    mockState.selectedRevisionIdByProduction = { 'prod-1': 'live-1' }
    mockState.notify()
  })

  afterEach(() => {
    cleanup()
    mockState.listeners.clear()
  })

  it('creates a copied revision via modal flow and selects it', async () => {
    const user = userEvent.setup()
    renderBudgetWorkspace()

    await screen.findByText('Create budget revision...')
    await user.click(screen.getByText('Create budget revision...'))
    expect(screen.getByText('Create budget revision')).toBeTruthy()
    expect(screen.getByLabelText('Revision name')).toBeTruthy()
    expect(screen.getByText('Start from scratch')).toBeTruthy()
    expect(screen.getByText('Copy from existing revision')).toBeTruthy()

    await user.click(screen.getByText('Copy from existing revision'))
    expect(screen.getByText('Source revision')).toBeTruthy()
    await user.click(screen.getAllByText(/Current budget .*Live/)[1]!)
    await user.type(screen.getByLabelText('Revision name'), 'Scenario B')
    await user.click(screen.getByText('Create revision'))

    await waitFor(() => {
      expect(screen.queryByText('Create budget revision')).toBeNull()
    })
    await waitFor(() => {
      expect(mockState.selectedRevisionIdByProduction['prod-1']).toBe('rev-3')
      expect(mockState.revisions.some((rev) => rev.name === 'Scenario B')).toBe(true)
    })
  })

  it('switches live revision through confirmation while keeping selection distinct', async () => {
    const user = userEvent.setup()
    renderBudgetWorkspace()
    mockState.selectedRevisionIdByProduction['prod-1'] = 'draft-1'
    mockState.notify()

    await screen.findByTestId('budget-selected-revision-live-radio')
    await user.click(screen.getByTestId('budget-selected-revision-live-radio'))
    expect(screen.getByText('Set this revision as the working budget?')).toBeTruthy()
    await user.click(screen.getByText('Set as working budget'))

    await waitFor(() => {
      expect(mockState.revisions.find((rev) => rev.id === 'draft-1')?.is_live).toBe(true)
      expect(mockState.revisions.find((rev) => rev.id === 'live-1')?.is_live).toBe(false)
      expect(mockState.selectedRevisionIdByProduction['prod-1']).toBe('draft-1')
    })
  })

  it('duplicates the live revision via menu event and selects new draft while preserving live', async () => {
    renderBudgetWorkspace()

    await screen.findByText('Create budget revision...')
    window.dispatchEvent(new Event('albatross-menu-duplicate-live-as-draft'))

    await waitFor(() => {
      const created = mockState.revisions.find((rev) => rev.name === 'Current budget Draft')
      expect(created).toBeTruthy()
      expect(created?.is_live).toBe(false)
      expect(mockState.revisions.find((rev) => rev.id === 'live-1')?.is_live).toBe(true)
      expect(mockState.selectedRevisionIdByProduction['prod-1']).toBe(created?.id)
      expect(created?.name).toBe('Current budget Draft')
    })
  })

  it('renames a revision from Manage Revisions modal', async () => {
    const user = userEvent.setup()
    renderBudgetWorkspace()

    await screen.findByText('Manage revisions')
    await user.click(screen.getByText('Manage revisions'))
    expect(screen.getByText('Manage Revisions')).toBeTruthy()

    await user.clear(screen.getByLabelText('Revision name Scenario A'))
    await user.type(screen.getByLabelText('Revision name Scenario A'), 'Scenario Renamed')
    await user.click(screen.getAllByText('Save name')[1]!)

    await waitFor(() => {
      expect(mockState.revisions.find((revision) => revision.id === 'draft-1')?.name).toBe('Scenario Renamed')
    })
  })

  it('deletes a draft revision with confirmation from Manage Revisions modal', async () => {
    const user = userEvent.setup()
    renderBudgetWorkspace()
    mockState.selectedRevisionIdByProduction['prod-1'] = 'draft-1'
    mockState.notify()

    await screen.findByText('Manage revisions')
    await user.click(screen.getByText('Manage revisions'))
    await user.click(screen.getAllByText('Delete')[1]!)
    expect(screen.getByText('Delete revision?')).toBeTruthy()
    await user.click(screen.getByText('Delete revision'))

    await waitFor(() => {
      expect(mockState.revisions.some((revision) => revision.id === 'draft-1')).toBe(false)
    })
  })

  it('keeps compare selections isolated from normal workspace selected revision', async () => {
    const user = userEvent.setup()
    renderBudgetWorkspace('/budget?tab=compare')

    await screen.findByText('Create budget revision...')
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.click(screen.getAllByText(/Scenario A/)[0]!)
    await user.click(screen.getAllByText(/Current budget/)[0]!)

    await waitFor(() => {
      expect(mockState.selectedRevisionIdByProduction['prod-1']).toBe('live-1')
    })
    expect(screen.getByText('Base revision')).toBeTruthy()
    expect(screen.getByText('Compare revision')).toBeTruthy()
  })
})
