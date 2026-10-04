import { describe, expect, it } from 'vitest'
import {
  commandLabels,
  formatAccelerator,
  getAcceleratorConflicts,
  globalMenuCommands,
  menuCommandTargets,
  resolveMenuSectionForPath,
  sectionMenuSpecs,
} from '@/app/menuSchema'

describe('resolveMenuSectionForPath', () => {
  it('maps routes to menu sections', () => {
    expect(resolveMenuSectionForPath('/tasks')).toBe('tasks')
    expect(resolveMenuSectionForPath('/readiness')).toBe('none')
    expect(resolveMenuSectionForPath('/schedule/calendar')).toBe('schedule')
    expect(resolveMenuSectionForPath('/schedule/script-import')).toBe('schedule')
    expect(resolveMenuSectionForPath('/people/bookings')).toBe('people')
    expect(resolveMenuSectionForPath('/equipment')).toBe('none')
  })

  it('has no accelerator conflicts in any section', () => {
    for (const spec of sectionMenuSpecs) {
      expect(getAcceleratorConflicts(spec.key)).toEqual([])
    }
    expect(getAcceleratorConflicts('none')).toEqual([])
  })
})

describe('menu command metadata', () => {
  const all = [...globalMenuCommands, ...sectionMenuSpecs.flatMap((s) => s.commands)]

  it('has a label for every command id, and no stray labels', () => {
    for (const cmd of all) expect(commandLabels[cmd.id], cmd.id).toBeTruthy()
    expect(Object.keys(commandLabels).sort()).toEqual(all.map((c) => c.id).sort())
  })

  it('assigns Cmd+Alt+1..4 to the new go-to commands', () => {
    const acc = (id: string) => all.find((c) => c.id === id)?.accelerator
    expect(acc('view_go_call_sheets')).toBe('CmdOrCtrl+Alt+1')
    expect(acc('view_go_movement_orders')).toBe('CmdOrCtrl+Alt+2')
    expect(acc('view_go_equipment')).toBe('CmdOrCtrl+Alt+3')
    expect(acc('view_go_music_clearance')).toBe('CmdOrCtrl+Alt+4')
  })

  it('derives native event names for routed commands', () => {
    expect(menuCommandTargets.view_go_music_clearance.eventName).toBe('albatross-menu-view-go-music-clearance')
    expect(menuCommandTargets.locations_add_location).toEqual({
      eventName: 'albatross-menu-locations-add-location',
      to: '/locations',
      browserEvent: 'albatross-menu-locations-add-location',
    })
  })
})

describe('formatAccelerator', () => {
  it('uses symbols on mac', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+D', true)).toBe('\u2318\u21E7D')
    expect(formatAccelerator('CmdOrCtrl+Alt+1', true)).toBe('\u2318\u23251')
    expect(formatAccelerator('CmdOrCtrl+,', true)).toBe('\u2318,')
  })
  it('uses Ctrl+ words elsewhere', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+D', false)).toBe('Ctrl+Shift+D')
    expect(formatAccelerator('CmdOrCtrl+B', false)).toBe('Ctrl+B')
  })
})

describe('in-app menu command routing', () => {
  // The in-app actions menu must fire the same events as the native menu in src-tauri/src/menu.rs.
  it('maps every native menu item id to the event name menu.rs emits for it', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { menuEventNameForCommand } = await import('@/app/menuSchema')
    const source = readFileSync(resolve(__dirname, '../../src-tauri/src/menu.rs'), 'utf8')
    const duplicateId = /const MENU_ID_DUPLICATE_LIVE_AS_DRAFT: &str = "([^"]+)"/.exec(source)?.[1]
    const pairs = [...source.matchAll(/(\w+|"[^"]+") => \{\s*let _ = app_handle\.emit\("([^"]+)"/g)].map(
      ([, rawId, eventName]) => [rawId === 'MENU_ID_DUPLICATE_LIVE_AS_DRAFT' ? duplicateId : rawId.slice(1, -1), eventName],
    )
    expect(pairs.length).toBeGreaterThan(30)
    for (const [id, eventName] of pairs) {
      expect(menuEventNameForCommand(id!)).toBe(eventName)
    }
  })

  it('dispatches RUN_MENU_COMMAND_EVENT with the native event name', async () => {
    const { RUN_MENU_COMMAND_EVENT, runMenuCommand } = await import('@/app/menuSchema')
    const target = new EventTarget()
    const received: string[] = []
    target.addEventListener(RUN_MENU_COMMAND_EVENT, (e) => received.push((e as CustomEvent).detail.eventName))
    const originalWindow = globalThis.window
    globalThis.window = target as unknown as Window & typeof globalThis
    try {
      runMenuCommand('import_project')
      runMenuCommand('app_settings')
    } finally {
      globalThis.window = originalWindow
    }
    expect(received).toEqual(['albatross-menu-import-project', 'albatross-menu-open-settings'])
  })
})
