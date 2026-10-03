// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

import { BROWSE_GO_COMMANDS, filterCommands } from '@/features/search/filterCommands'
import { buildGlobalSearchCommands, CREATE_COMMAND_IDS } from '@/features/search/commands'
import type { GlobalSearchCommand } from '@/features/search/types'

const commands = buildGlobalSearchCommands()
const ids = (r: { commands: Array<{ id: string }> }) => r.commands.map((c) => c.id)

describe('filterCommands', () => {
  it('shows limited Go to plus all Create commands for an empty query', () => {
    const result = filterCommands(commands, '', { hasProduction: true })
    expect(result.commandsOnly).toBe(false)
    expect(result.commands.filter((c) => c.group === 'go')).toHaveLength(BROWSE_GO_COMMANDS)
    expect(result.commands.filter((c) => c.group === 'create')).toHaveLength(CREATE_COMMAND_IDS.length)
  })

  it('matches case-insensitively with token AND over label, keywords and group', () => {
    expect(ids(filterCommands(commands, 'ADD location', { hasProduction: true }))).toContain(
      'create:locations_add_location',
    )
    expect(ids(filterCommands(commands, 'create task', { hasProduction: true }))).toEqual([
      'create:tasks_new_task',
    ])
    expect(ids(filterCommands(commands, 'zzzz nothing', { hasProduction: true }))).toEqual([])
  })

  it('treats the > prefix as commands-only and strips it before matching', () => {
    const result = filterCommands(commands, '> shortcuts', { hasProduction: true })
    expect(result.commandsOnly).toBe(true)
    expect(ids(result)).toEqual(['general:shortcuts'])
    expect(filterCommands(commands, '>', { hasProduction: true }).commandsOnly).toBe(true)
  })

  it('disables production-bound Create commands without a production', () => {
    const result = filterCommands(commands, '', { hasProduction: false })
    const byId = new Map(result.commands.map((c) => [c.id, c]))
    expect(byId.get('create:new_project')?.disabled).toBe(false)
    expect(byId.get('create:locations_add_location')?.disabled).toBe(true)
    expect(byId.get('create:locations_add_location')?.hint).toBe('Select a production')
    expect(filterCommands(commands, '', { hasProduction: true }).commands.some((c) => c.disabled)).toBe(false)
  })

  it('orders label-prefix matches before other matches, then by original order', () => {
    const make = (id: string, label: string, keywords: string[] = []): GlobalSearchCommand => ({
      id,
      label,
      group: 'create',
      keywords,
      run: () => {},
    })
    const list = [make('a', 'Open budget', ['spend']), make('b', 'Spend report'), make('c', 'Spend log')]
    expect(ids(filterCommands(list, 'spend', { hasProduction: true }))).toEqual(['b', 'c', 'a'])
  })

  it('runs create commands by navigating and dispatching the menu browser event', () => {
    const cmd = commands.find((c) => c.id === 'create:locations_add_location')!
    const navigated: string[] = []
    let fired = 0
    const listener = () => (fired += 1)
    window.addEventListener('albatross-menu-locations-add-location', listener)
    cmd.run({ navigate: (to) => navigated.push(to) })
    window.removeEventListener('albatross-menu-locations-add-location', listener)
    expect(navigated).toEqual(['/locations'])
    expect(fired).toBe(1)
  })
})
