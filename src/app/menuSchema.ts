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
  { id: 'view_go_call_sheets', accelerator: 'CmdOrCtrl+Alt+1' },
  { id: 'view_go_movement_orders', accelerator: 'CmdOrCtrl+Alt+2' },
  { id: 'view_go_equipment', accelerator: 'CmdOrCtrl+Alt+3' },
  { id: 'view_go_music_clearance', accelerator: 'CmdOrCtrl+Alt+4' },
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
  if (pathname.startsWith('/tasks')) return 'tasks'
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

const allMenuCommands: MenuCommandSpec[] = [
  ...globalMenuCommands,
  ...sectionMenuSpecs.flatMap((spec) => spec.commands),
]

/** Accelerator string for a command id (e.g. `CmdOrCtrl+B`), if it has one. */
export function getCommandAccelerator(id: string): string | undefined {
  return allMenuCommands.find((cmd) => cmd.id === id)?.accelerator
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '')
}

const MAC_KEY_SYMBOLS: Record<string, string> = {
  cmdorctrl: '\u2318',
  cmd: '\u2318',
  ctrl: '\u2303',
  alt: '\u2325',
  option: '\u2325',
  shift: '\u21E7',
}

/** `CmdOrCtrl+Shift+D` -> `⌘⇧D` (mac) / `Ctrl+Shift+D` (other platforms). */
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const parts = accelerator.split('+')
  if (isMac) {
    return parts.map((part) => MAC_KEY_SYMBOLS[part.toLowerCase()] ?? part.toUpperCase()).join('')
  }
  return parts
    .map((part) => {
      const key = part.toLowerCase()
      if (key === 'cmdorctrl' || key === 'cmd') return 'Ctrl'
      if (key === 'option') return 'Alt'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join('+')
}

/** Human-readable label for every menu command id (palette and cheat sheet). */
export const commandLabels: Record<string, string> = {
  new_project: 'New production',
  import_project: 'Import project',
  export_project: 'Export project',
  publish_to_server: 'Publish to server',
  file_logout: 'Log out',
  app_settings: 'Settings',
  view_go_dashboard: 'Go to Dashboard',
  view_go_productions: 'Go to Productions',
  view_go_budget: 'Go to Budget',
  view_go_schedule: 'Go to Schedule',
  view_go_people: 'Go to People',
  view_go_locations: 'Go to Locations',
  view_go_documents: 'Go to Documents',
  view_go_deliverables: 'Go to Deliverables',
  view_go_tasks: 'Go to Tasks',
  view_go_call_sheets: 'Go to Call Sheets',
  view_go_movement_orders: 'Go to Movement Orders',
  view_go_equipment: 'Go to Equipment',
  view_go_music_clearance: 'Go to Music & Archive',
  view_toggle_sidebar: 'Toggle sidebar',
  people_add_cast: 'Add cast member',
  people_add_crew: 'Add crew member',
  people_add_booking: 'Add booking',
  people_open_cast_manager: 'Open Cast Manager',
  people_open_crew_manager: 'Open Crew Manager',
  budget_log_spend: 'Log spend',
  budget_add_line_item: 'Add line item',
  budget_manage_revisions: 'Manage budget revisions',
  budget_export_csv: 'Export budget CSV',
  budget_duplicate_live_as_draft: 'Duplicate live budget as draft',
  schedule_new_shoot_day: 'New shoot day',
  schedule_add_strip: 'Add strip',
  schedule_open_stripboard: 'Open Stripboard',
  schedule_open_shot_list: 'Open Shot List',
  schedule_parse_script_scenes: 'Parse script scenes',
  tasks_new_task: 'New task',
  locations_add_location: 'Add location',
  documents_upload_file: 'Upload document',
  documents_export_bundle: 'Export document bundle',
  deliverables_add_deliverable: 'Add deliverable',
  deliverables_apply_template: 'Apply deliverables template',
  deliverables_export_manifest: 'Export deliverables manifest',
}

/** Route that each sidebar destination's menu shortcut belongs to (sidebar tooltips, palette hints). */
export const navCommandIdByPath: Record<string, string> = {
  '/': 'view_go_dashboard',
  '/productions': 'view_go_productions',
  '/budget': 'view_go_budget',
  '/schedule': 'view_go_schedule',
  '/people': 'view_go_people',
  '/locations': 'view_go_locations',
  '/documents': 'view_go_documents',
  '/deliverables': 'view_go_deliverables',
  '/tasks': 'view_go_tasks',
  '/call-sheets': 'view_go_call_sheets',
  '/movement-orders': 'view_go_movement_orders',
  '/equipment': 'view_go_equipment',
  '/music-clearance': 'view_go_music_clearance',
  '/settings': 'app_settings',
}

/**
 * Where each routed menu command goes. `eventName` is the native (Tauri) event;
 * `to` is the route to navigate to; `browserEvent` is dispatched on `window`
 * after navigating (omit for pure navigation). Shared by ApfMenuEventBridge and
 * the search palette so both stay in sync.
 */
export type MenuCommandTarget = {
  eventName: string
  to?: string
  browserEvent?: string
}

function nav(id: string, to: string): [string, MenuCommandTarget] {
  return [id, { eventName: `albatross-menu-${id.replace(/_/g, '-')}`, to }]
}
function dispatch(id: string, to?: string): [string, MenuCommandTarget] {
  const eventName = `albatross-menu-${id.replace(/_/g, '-')}`
  return [id, { eventName, to, browserEvent: eventName }]
}

export const menuCommandTargets: Record<string, MenuCommandTarget> = Object.fromEntries([
  ['new_project', {
    eventName: 'albatross-menu-new-project',
    to: '/productions',
    browserEvent: 'albatross-open-new-production-dialog',
  } satisfies MenuCommandTarget],
  nav('view_go_dashboard', '/'),
  nav('view_go_productions', '/productions'),
  nav('view_go_budget', '/budget'),
  nav('view_go_schedule', '/schedule/calendar'),
  nav('view_go_people', '/people/bookings'),
  nav('view_go_locations', '/locations'),
  nav('view_go_documents', '/documents'),
  nav('view_go_deliverables', '/deliverables'),
  nav('view_go_tasks', '/tasks'),
  nav('view_go_call_sheets', '/call-sheets'),
  nav('view_go_movement_orders', '/movement-orders'),
  nav('view_go_equipment', '/equipment'),
  nav('view_go_music_clearance', '/music-clearance'),
  dispatch('people_add_cast', '/people/cast-manager'),
  dispatch('people_add_crew', '/people/crew-manager'),
  dispatch('people_add_booking', '/people/bookings'),
  nav('people_open_cast_manager', '/people/cast-manager'),
  nav('people_open_crew_manager', '/people/crew-manager'),
  dispatch('budget_log_spend', '/budget'),
  dispatch('budget_add_line_item', '/budget'),
  dispatch('budget_manage_revisions', '/budget'),
  dispatch('budget_export_csv', '/budget'),
  dispatch('schedule_new_shoot_day', '/schedule/stripboard'),
  dispatch('schedule_add_strip', '/schedule/stripboard'),
  nav('schedule_open_stripboard', '/schedule/stripboard'),
  nav('schedule_open_shot_list', '/schedule/shots'),
  nav('schedule_parse_script_scenes', '/schedule/script-import'),
  dispatch('tasks_new_task', '/tasks'),
  dispatch('locations_add_location', '/locations'),
  dispatch('documents_upload_file', '/documents'),
  dispatch('deliverables_add_deliverable', '/deliverables'),
  dispatch('deliverables_apply_template', '/deliverables'),
])

/** Plain-text hint for APIs that only accept strings (e.g. SidebarMenuButton `tooltip`). */
export function labelWithShortcut(label: string, accelerator?: string): string {
  return accelerator ? `${label} ${formatAccelerator(accelerator, isMacPlatform())}` : label
}
