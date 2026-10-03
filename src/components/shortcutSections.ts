import { CREATE_COMMAND_IDS } from '@/features/search/commands'
import {
  commandLabels,
  formatAccelerator,
  globalMenuCommands,
  sectionMenuSpecs,
} from '@/app/menuSchema'

export type ShortcutRow = { label: string; keys: string }
export type ShortcutSection = { title: string; rows: ShortcutRow[] }

/** Builds the cheat-sheet sections from the menu schema (plus the JS-only shortcuts). */
export function buildShortcutSections(isMac: boolean): ShortcutSection[] {
  const withAccelerator = [
    ...globalMenuCommands,
    ...sectionMenuSpecs.flatMap((spec) => spec.commands),
  ].filter((cmd) => cmd.accelerator)
  const rowFor = (cmd: { id: string; accelerator?: string }): ShortcutRow => ({
    label: commandLabels[cmd.id] ?? cmd.id,
    keys: formatAccelerator(cmd.accelerator!, isMac),
  })
  const createIds = new Set<string>(CREATE_COMMAND_IDS)
  const navigation = withAccelerator.filter((c) => c.id.startsWith('view_go_'))
  const create = withAccelerator.filter((c) => createIds.has(c.id))
  const view = withAccelerator.filter((c) => c.id === 'view_toggle_sidebar')
  const used = new Set([...navigation, ...create, ...view].map((c) => c.id))
  const general = withAccelerator.filter((c) => !used.has(c.id))
  return [
    { title: 'Navigation', rows: navigation.map(rowFor) },
    { title: 'Create', rows: create.map(rowFor) },
    { title: 'View', rows: view.map(rowFor) },
    {
      title: 'General',
      rows: [
        { label: 'Search', keys: isMac ? '⌘K' : 'Ctrl+K' },
        { label: 'Keyboard shortcuts', keys: '?' },
        ...general.map(rowFor),
      ],
    },
  ]
}
