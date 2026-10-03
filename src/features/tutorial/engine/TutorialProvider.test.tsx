// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTutorial } from './context'
import { TutorialProvider } from './TutorialProvider'
import { emitTutorialEvent } from './events'

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  refetchProductions: vi.fn(),
  setCurrentProductionId: vi.fn(),
}))

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: vi.fn(async (key: string) => mocks.store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    mocks.store.set(key, value)
  }),
  FIRST_LAUNCH_TUTORIAL_SEEN_KEY: 'first_launch_tutorial_seen',
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    setCurrentProductionId: mocks.setCurrentProductionId,
    refetchProductions: mocks.refetchProductions,
  }),
}))

vi.mock('../tutorialProject', () => ({
  ensureTutorialProject: vi.fn(async () => ({ id: 'tutorial-project' })),
}))

type Snapshot = { value: ReturnType<typeof useTutorial>; pathname: string }
let seen: { current: Snapshot | null } = { current: null }

function Probe() {
  const value = useTutorial()
  const loc = useLocation()
  useEffect(() => {
    seen.current = { value, pathname: loc.pathname }
  })
  return null
}

function renderTutorial(path = '/') {
  seen = { current: null }
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <TutorialProvider>
            <Probe />
          </TutorialProvider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const ctx = () => {
  if (!seen.current) throw new Error('provider not rendered')
  return seen.current.value
}

const currentPath = () => seen.current?.pathname


describe('TutorialProvider', () => {
  beforeEach(() => {
    mocks.store.clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('starts a section in the tutorial project, navigates to its page and shows the first step', async () => {
    renderTutorial('/')
    await waitFor(() => expect(ctx().progress).not.toBeNull())

    await act(async () => {
      await ctx().startSection('budget', { scope: 'section' })
    })

    expect(ctx().status).toBe('running')
    expect(ctx().step?.id).toBe('overview')
    expect(ctx().progress?.tutorialProductionId).toBe('tutorial-project')
    expect(mocks.setCurrentProductionId).toHaveBeenCalledWith('tutorial-project')
    await waitFor(() => expect(currentPath()).toBe('/budget'))
  })

  it('advances through view, click and event steps, and only on real actions', async () => {
    const target = document.createElement('button')
    target.setAttribute('data-tutorial', 'budget-add-line-item')
    target.textContent = 'Add line item'
    document.body.appendChild(target)

    renderTutorial('/')
    await waitFor(() => expect(ctx().progress).not.toBeNull())
    await act(async () => {
      await ctx().startSection('budget', { scope: 'section' })
    })
    await waitFor(() => expect(ctx().satisfied).toBe(true)) // overview is a view step on /budget

    act(() => ctx().next())
    expect(ctx().step?.id).toBe('add-line-item')
    expect(ctx().satisfied).toBe(false)

    // A write for a different production must not count.
    act(() => emitTutorialEvent('budget.item_created', 'some-demo-production'))
    act(() => ctx().next())
    expect(ctx().step?.id).toBe('add-line-item')

    // Clicking the highlighted target opens the form, so the tour moves straight to the save step.
    await act(async () => {
      target.click()
    })
    await waitFor(() => expect(ctx().step?.id).toBe('save-line-item'))
    expect(ctx().satisfied).toBe(false)

    act(() => emitTutorialEvent('budget.item_created', 'tutorial-project'))
    await waitFor(() => expect(ctx().satisfied).toBe(true))
    act(() => ctx().next())

    // Budget is the only started section, so the run ends and the section is marked complete.
    expect(ctx().status).toBe('idle')
    expect(ctx().progress?.sections.budget).toBe('complete')
    target.remove()
  })

  it('pauses on Escape without losing the step, and resumes at the same step', async () => {
    renderTutorial('/')
    await waitFor(() => expect(ctx().progress).not.toBeNull())
    await act(async () => {
      await ctx().startSection('crew', { scope: 'section' })
    })
    await waitFor(() => expect(ctx().status).toBe('running'))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(ctx().status).toBe('paused')
    expect(ctx().step).toBeNull()

    act(() => ctx().resume())
    expect(ctx().status).toBe('running')
    expect(ctx().step?.id).toBe('overview')
  })

  it('persists progress so a reload resumes the same step', async () => {
    const first = renderTutorial('/')
    await waitFor(() => expect(ctx().progress).not.toBeNull())
    await act(async () => {
      await ctx().startSection('locations', { scope: 'section' })
    })
    first.unmount()

    renderTutorial('/')
    await waitFor(() => expect(ctx().progress?.run.sectionId).toBe('locations'))
    expect(ctx().progress?.run.status).toBe('running')
    expect(ctx().step?.id).toBe('overview')
  })
})
