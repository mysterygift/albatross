export type MenuSection = 'none' | 'people' | 'budget' | 'schedule' | 'locations' | 'documents' | 'deliverables' | 'tasks'

export type MenuCommandSpec = {
  id: string
  accelerator?: string
  disabled?: boolean
}

export type MenuSectionSpec = {
  key: MenuSection
  menuLabel: string
  commands: MenuCommandSpec[]
}

export const globalMenuCommands: MenuCommandSpec[] = [
  { id: 'new_project', accelerator: 'CmdOrCtrl+N' },
  { id: 'import_project', accelerator: 'CmdOrCtrl+O' },
  { id: 'export_project', accelerator: 'CmdOrCtrl+Shift+E' },
  { id: 'publish_to_server' },
  { id: 'file_logout' },
  { id: 'app_settings', accelerator: 'CmdOrCtrl+,' },
  { id: 'view_go_dashboard', accelerator: 'CmdOrCtrl+1' },
  { id: 'view_go_productions', accelerator: 'CmdOrCtrl+2' },
  { id: 'view_go_budget', accelerator: 'CmdOrCtrl+3' },
  { id: 'view_go_schedule', accelerator: 'CmdOrCtrl+4' },
  { id: 'view_go_people', accelerator: 'CmdOrCtrl+5' },
  { id: 'view_go_locations', accelerator: 'CmdOrCtrl+6' },
  { id: 'view_go_documents', accelerator: 'CmdOrCtrl+7' },
  { id: 'view_go_deliverables', accelerator: 'CmdOrCtrl+8' },
  { id: 'view_go_tasks', accelerator: 'CmdOrCtrl+9' },
  { id: 'view_toggle_sidebar', accelerator: 'CmdOrCtrl+B' },
]

export const sectionMenuSpecs: MenuSectionSpec[] = [
  {
    key: 'people',
    menuLabel: 'People',
    commands: [
      { id: 'people_add_cast', accelerator: 'CmdOrCtrl+Shift+C' },
      { id: 'people_add_crew', accelerator: 'CmdOrCtrl+Shift+R' },
      { id: 'people_add_booking', accelerator: 'CmdOrCtrl+Shift+K' },
      { id: 'people_open_cast_manager' },
      { id: 'people_open_crew_manager' },
    ],
  },
  {
    key: 'budget',
    menuLabel: 'Budget',
    commands: [
      { id: 'budget_log_spend', accelerator: 'CmdOrCtrl+Shift+L' },
      { id: 'budget_add_line_item', accelerator: 'CmdOrCtrl+Shift+I' },
      { id: 'budget_manage_revisions' },
      { id: 'budget_export_csv', accelerator: 'CmdOrCtrl+Shift+S' },
      { id: 'budget_duplicate_live_as_draft' },
    ],
  },
  {
    key: 'schedule',
    menuLabel: 'Schedule',
    commands: [
      { id: 'schedule_new_shoot_day', accelerator: 'CmdOrCtrl+Shift+D' },
      { id: 'schedule_add_strip', accelerator: 'CmdOrCtrl+Shift+T' },
      { id: 'schedule_open_stripboard' },
      { id: 'schedule_open_shot_list' },
      { id: 'schedule_parse_script_scenes' },
    ],
  },
  {
    key: 'tasks',
    menuLabel: 'Tasks',
    commands: [
      { id: 'tasks_new_task', accelerator: 'CmdOrCtrl+T' },
    ],
  },
  {
    key: 'locations',
    menuLabel: 'Locations',
    commands: [
      { id: 'locations_add_location', accelerator: 'CmdOrCtrl+Shift+O' },
    ],
  },
  {
    key: 'documents',
    menuLabel: 'Documents',
    commands: [
      { id: 'documents_upload_file', accelerator: 'CmdOrCtrl+U' },
      { id: 'documents_export_bundle', disabled: true },
    ],
  },
  {
    key: 'deliverables',
    menuLabel: 'Deliverables',
    commands: [
      { id: 'deliverables_add_deliverable', accelerator: 'CmdOrCtrl+Shift+V' },
      { id: 'deliverables_apply_template' },
      { id: 'deliverables_export_manifest', disabled: true },
    ],
  },
]

export function resolveMenuSectionForPath(pathname: string): MenuSection {
  if (pathname.startsWith('/people')) return 'people'
  if (pathname.startsWith('/budget')) return 'budget'
  if (pathname.startsWith('/schedule')) return 'schedule'
  if (pathname.startsWith('/readiness')) return 'tasks'
  if (pathname.startsWith('/locations')) return 'locations'
  if (pathname.startsWith('/documents')) return 'documents'
  if (pathname.startsWith('/deliverables')) return 'deliverables'
  return 'none'
}

export function getAcceleratorConflicts(
  section: MenuSection,
): Array<{ accelerator: string; commandIds: string[] }> {
  const spec = sectionMenuSpecs.find((s) => s.key === section)
  const all = [...globalMenuCommands, ...(spec?.commands ?? [])]
  const buckets = new Map<string, string[]>()
  for (const cmd of all) {
    if (!cmd.accelerator) continue
    const key = cmd.accelerator.toLowerCase()
    const prev = buckets.get(key) ?? []
    prev.push(cmd.id)
    buckets.set(key, prev)
  }
  return [...buckets.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([accelerator, commandIds]) => ({ accelerator, commandIds }))
}
