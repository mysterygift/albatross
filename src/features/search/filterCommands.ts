import type { GlobalSearchCommand } from '@/features/search/types'

/** Number of "Go to" commands shown when the query is empty. */
export const BROWSE_GO_COMMANDS = 6
/** Max commands shown while actively searching. */
export const MAX_COMMAND_RESULTS = 12

export type FilteredCommand = GlobalSearchCommand & {
  disabled: boolean
  /** Why the command is disabled, if it is. */
  hint?: string
}

export type FilterCommandsResult = {
  commands: FilteredCommand[]
  /** True when the query used the `>` prefix: show commands only. */
  commandsOnly: boolean
}

const GROUP_LABEL: Record<GlobalSearchCommand['group'], string> = {
  go: 'go to',
  create: 'create',
  general: 'general',
}

export function filterCommands(
  commands: GlobalSearchCommand[],
  rawQuery: string,
  options: { hasProduction: boolean },
): FilterCommandsResult {
  const trimmed = rawQuery.trimStart()
  const commandsOnly = trimmed.startsWith('>')
  const q = (commandsOnly ? trimmed.slice(1) : trimmed).trim().toLowerCase()

  const decorate = (cmd: GlobalSearchCommand): FilteredCommand => {
    const disabled = Boolean(cmd.requiresProduction) && !options.hasProduction
    return { ...cmd, disabled, hint: disabled ? 'Select a production' : undefined }
  }

  if (!q) {
    let goCount = 0
    const picked = commands.filter((cmd) => {
      if (cmd.group !== 'go') return true
      goCount += 1
      return goCount <= BROWSE_GO_COMMANDS
    })
    return { commands: picked.map(decorate), commandsOnly }
  }

  const tokens = q.split(/\s+/)
  const scored: Array<{ cmd: GlobalSearchCommand; rank: number; index: number }> = []
  commands.forEach((cmd, index) => {
    const label = cmd.label.toLowerCase()
    const haystack = [label, ...cmd.keywords, GROUP_LABEL[cmd.group]].join(' ').toLowerCase()
    if (!tokens.every((t) => haystack.includes(t))) return
    const rank = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2
    scored.push({ cmd, rank, index })
  })
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return {
    commands: scored.slice(0, MAX_COMMAND_RESULTS).map((s) => decorate(s.cmd)),
    commandsOnly,
  }
}
