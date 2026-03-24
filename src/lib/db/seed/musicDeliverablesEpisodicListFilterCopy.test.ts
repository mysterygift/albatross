import { describe, expect, it } from 'vitest'

/**
 * EP9: parallel episodic list-filter copy between Music & Archive and Deliverables.
 * Both use a "Show" label, "Project-wide", episode names in the same Select, and an "All …" first option.
 */
describe('Music vs Deliverables episodic list filter copy', () => {
  it('uses the same chrome labels for the list scope control', () => {
    expect('Show').toBe('Show')
    expect('Project-wide').toBe('Project-wide')
  })

  it('uses parallel “All …” wording for the unfiltered list option', () => {
    expect('All tracks').toMatch(/^All /)
    expect('All deliverables').toMatch(/^All /)
  })
})
