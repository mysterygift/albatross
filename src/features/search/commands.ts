import { isNavGroup, navGroups } from '@/app/navigation'
import {
  commandLabels,
  getCommandAccelerator,
  menuCommandTargets,
  navCommandIdByPath,
} from '@/app/menuSchema'
import type { GlobalSearchCommand } from '@/features/search/types'

/** Menu command ids offered under "Create", in display order. */
export const CREATE_COMMAND_IDS = [
  'new_project',
  'people_add_cast',
  'people_add_crew',
  'people_add_booking',
  'budget_log_spend',
  'budget_add_line_item',
  'schedule_new_shoot_day',
  'schedule_add_strip',
  'tasks_new_task',
  'locations_add_location',
  'documents_upload_file',
  'deliverables_add_deliverable',
] as const

export const SELECT_PRODUCTION_HINT = 'Select a production'

function goCommands(): GlobalSearchCommand[] {
  const out: GlobalSearchCommand[] = []
  for (const group of navGroups) {
    for (const item of group.items) {
      const subtitle = group.label && group.label !== item.label ? group.label : undefined
      const commandId = navCommandIdByPath[item.to]
      const to = isNavGroup(item) ? item.defaultChild : item.to
      out.push({
        id: `go:${item.to}`,
        label: `Go to ${item.label}`,
        group: 'go',
        subtitle,
        keywords: [item.label, group.label, 'go', 'open', 'navigate'],
        accelerator: commandId ? getCommandAccelerator(commandId) : undefined,
        run: ({ navigate }) => navigate(to),
      })
      if (isNavGroup(item)) {
        for (const sub of item.sub) {
          if (sub.label === item.label) continue
          out.push({
            id: `go:${sub.to}`,
            label: `Go to ${item.label}: ${sub.label}`,
            group: 'go',
            subtitle: group.label || undefined,
            keywords: [item.label, sub.label, group.label, 'go', 'open', 'navigate'],
            run: ({ navigate }) => navigate(sub.to),
          })
        }
      }
    }
  }
  return out
}

function createCommands(): GlobalSearchCommand[] {
  return CREATE_COMMAND_IDS.map((id) => {
    const target = menuCommandTargets[id]
    return {
      id: `create:${id}`,
      label: commandLabels[id] ?? id,
      group: 'create' as const,
      keywords: ['create', 'new', 'add'],
      accelerator: getCommandAccelerator(id),
      requiresProduction: id !== 'new_project',
      run: ({ navigate }) => {
        if (target.to) navigate(target.to)
        if (target.browserEvent) window.dispatchEvent(new Event(target.browserEvent))
      },
    }
  })
}

/** Builds the full palette command list (Go to, Create, general). */
export function buildGlobalSearchCommands(): GlobalSearchCommand[] {
  return [
    ...goCommands(),
    ...createCommands(),
    {
      id: 'general:shortcuts',
      label: 'Keyboard shortcuts',
      group: 'general',
      keywords: ['help', 'keys', 'hotkeys', 'cheat sheet'],
      accelerator: undefined,
      run: ({ openShortcuts }) => openShortcuts?.(),
    },
  ]
}
