/** Main shooting schedule table column keys (page 1). */
export type MainScheduleColKey =
  | 'loc'
  | 'ep'
  | 'scsh'
  | 'synopsis'
  | 'dn'
  | 'pgs'
  | 'cast'
  | 'notes'

export type MainScheduleColDef = { key: MainScheduleColKey; label: string; w: number }

/** Main schedule table width without EP column (486pt between margins). */
export const MAIN_SCHEDULE_TABLE_WIDTH = 486

/** Main schedule table width when EP column is included (+6pt vs non-episodic). */
export const MAIN_SCHEDULE_TABLE_WIDTH_WITH_EP = 492

export function mainScheduleTableWidth(includeEpisodesInSchedule?: boolean): number {
  return includeEpisodesInSchedule === true
    ? MAIN_SCHEDULE_TABLE_WIDTH_WITH_EP
    : MAIN_SCHEDULE_TABLE_WIDTH
}

/**
 * Column layout for the main SHOOTING SCHEDULE grid. When episodes are included,
 * EP sits between LOC and SC/SH; table is 6pt wider than the non-episodic layout.
 */
export function buildMainScheduleColumns(data: {
  includeEpisodesInSchedule?: boolean
}): MainScheduleColDef[] {
  const withEp = data.includeEpisodesInSchedule === true
  const targetWidth = mainScheduleTableWidth(withEp)
  const synopsisW = withEp ? 184 : 208
  const cols: MainScheduleColDef[] = [
    { key: 'loc', label: 'LOC', w: 46 },
  ]
  if (withEp) {
    cols.push({ key: 'ep', label: 'EP', w: 30 })
  }
  cols.push(
    { key: 'scsh', label: 'SC/SH', w: 38 },
    { key: 'synopsis', label: 'SHOT DESCRIPTION', w: synopsisW },
    { key: 'dn', label: 'D/N', w: 38 },
    { key: 'pgs', label: 'PGS', w: 24 },
    { key: 'cast', label: 'CAST', w: 66 },
    { key: 'notes', label: 'NOTES', w: 66 }
  )
  const sum = cols.reduce((s, c) => s + c.w, 0)
  if (sum !== targetWidth) {
    throw new Error(
      `Main schedule column widths must sum to ${targetWidth}, got ${sum}`
    )
  }
  return cols
}

export type AdvancedScheduleColKey =
  | 'loc'
  | 'ep'
  | 'scsh'
  | 'synopsis'
  | 'dn'
  | 'pgs'
  | 'cast'

export type AdvancedScheduleColDef = { key: AdvancedScheduleColKey; label: string; w: number }

/**
 * Compact advanced-schedule grid; total width matches prior layout for the same `hasCast` mode.
 */
export function buildAdvancedScheduleColumns(args: {
  includeEpisodesInSchedule: boolean
  hasCast: boolean
}): AdvancedScheduleColDef[] {
  const withEp = args.includeEpisodesInSchedule === true
  const hasCast = args.hasCast

  let synopsisW: number
  let targetSum: number
  if (hasCast) {
    synopsisW = withEp ? 176 : 198
    targetSum = 370
  } else {
    synopsisW = withEp ? 240 : 262
    targetSum = 386
  }

  const cols: AdvancedScheduleColDef[] = [{ key: 'loc', label: 'LOC', w: 40 }]
  if (withEp) {
    cols.push({ key: 'ep', label: 'EP', w: 22 })
  }
  cols.push(
    { key: 'scsh', label: 'SC/SH', w: 34 },
    { key: 'synopsis', label: 'SHOT DESCRIPTION', w: synopsisW },
    { key: 'dn', label: 'D/N', w: 30 },
    { key: 'pgs', label: 'PGS', w: 20 }
  )
  if (hasCast) {
    cols.push({ key: 'cast', label: 'CAST', w: 48 })
  }

  const sum = cols.reduce((s, c) => s + c.w, 0)
  if (sum !== targetSum) {
    throw new Error(
      `Advanced schedule column widths must sum to ${targetSum} (hasCast=${hasCast}, withEp=${withEp}), got ${sum}`
    )
  }
  return cols
}
