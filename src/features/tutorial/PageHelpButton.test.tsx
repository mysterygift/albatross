// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultTutorialProgress } from './progress'
import { PageHelpButton } from './PageHelpButton'
import { resolveTutorialSection } from './sectionSteps'

const state = vi.hoisted(() => ({ progress: null as unknown, updateProgress: vi.fn() }))
vi.mock('@/hooks/useFirstLaunchTutorial', () => ({
  useFirstLaunchTutorial: () => ({ progress: state.progress, updateProgress: state.updateProgress }),
}))

function renderAt(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <PageHelpButton />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe('resolveTutorialSection', () => {
  it('maps routes to sections', () => {
    expect(resolveTutorialSection('/')).toBe('dashboard')
    expect(resolveTutorialSection('/schedule/stripboard')).toBe('schedule')
    expect(resolveTutorialSection('/people/crew-manager')).toBe('crew')
    expect(resolveTutorialSection('/people/cast-manager/abc')).toBe('cast')
    expect(resolveTutorialSection('/tasks')).toBe('tasks')
    expect(resolveTutorialSection('/readiness')).toBe('tasks')
    expect(resolveTutorialSection('/budget/actualisation')).toBe('budget')
    expect(resolveTutorialSection('/settings')).toBeNull()
  })
})

describe('PageHelpButton', () => {
  beforeAll(() => {
    // jsdom lacks ResizeObserver, which Radix Popper (tooltip) needs when a click also hovers the button.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    state.progress = null
  })

  it('renders nothing on unmapped routes', () => {
    state.progress = getDefaultTutorialProgress()
    renderAt('/settings')
    expect(screen.queryByRole('button', { name: 'Page help' })).toBeNull()
  })

  it('opens the section panel and records progress on close', async () => {
    state.progress = getDefaultTutorialProgress()
    const user = userEvent.setup()
    renderAt('/budget')
    await user.click(screen.getByRole('button', { name: 'Page help' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(state.updateProgress).toHaveBeenCalled())
    const updater = state.updateProgress.mock.calls[0][0]
    const next = updater(getDefaultTutorialProgress())
    expect(next.sections.budget).toBe('in_progress')
  })

  it('does not mount a second panel when the guided tutorial owns the section', async () => {
    const p = getDefaultTutorialProgress()
    p.currentSection = 'budget'
    state.progress = p
    const user = userEvent.setup()
    renderAt('/budget')
    await user.click(screen.getByRole('button', { name: 'Page help' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
