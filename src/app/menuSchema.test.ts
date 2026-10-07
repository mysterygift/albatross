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

  it('routes the Help menu items to window events the shortcut bridge handles', () => {
    expect(menuCommandTargets.help_getting_started).toEqual({
      eventName: 'albatross-menu-help-getting-started',
      to: undefined,
      browserEvent: 'albatross-menu-help-getting-started',
    })
    expect(menuCommandTargets.help_keyboard_shortcuts.browserEvent).toBe('albatross-menu-help-keyboard-shortcuts')
    expect(commandLabels.help_getting_started).toBe('Getting started')
  })

  it('uses production vocabulary for the File menu commands', () => {
    expect(commandLabels.new_project).toBe('New production')
    expect(commandLabels.import_project).toBe('Import production')
    expect(commandLabels.export_project).toBe('Export production')
  })

  it('opens Cast Manager for the People shortcut, matching the sidebar default child', () => {
    expect(menuCommandTargets.view_go_people.to).toBe('/people/cast-manager')
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
