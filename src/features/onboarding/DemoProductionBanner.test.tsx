// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import { DemoProductionBanner } from './DemoProductionBanner'

function renderBanner(slug: string, isDemo = slug === DEMO_SLUG) {
  return render(<DemoProductionBanner isDemo={isDemo} currentProduction={{ slug }} />)
}

describe('DemoProductionBanner', () => {
  afterEach(cleanup)

  it('renders nothing outside the demo production', () => {
    renderBanner('my-film')
    expect(screen.queryByText(/Demo production/)).toBeNull()
  })

  it('renders nothing when the demo flag is off, even for the demo slug', () => {
    renderBanner(DEMO_SLUG, false)
    expect(screen.queryByText(/Demo production/)).toBeNull()
  })

  it('shows the notice, with no switch button, on the demo production', () => {
    renderBanner(DEMO_SLUG)
    expect(screen.getByText(/Demo production/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing when there is no current production', () => {
    render(<DemoProductionBanner isDemo currentProduction={null} />)
    expect(screen.queryByText(/Demo production/)).toBeNull()
  })
})
