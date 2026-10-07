export type SettingsSectionId =
  | 'production'
  | 'budget-accounts'
  | 'appearance'
  | 'people'
  | 'script-supervisor'
  | 'users'
  | 'project-access'
  | 'integrations'
  | 'demo-tutorial'
  | 'guidebook'
  | 'developer'

export type SettingsGroupId = 'production' | 'appearance' | 'team' | 'integrations' | 'help' | 'advanced'

export interface SettingsSectionDef {
  id: SettingsSectionId
  label: string
  group: SettingsGroupId
  /** Only offered while developer mode is on. */
  requiresDeveloperMode?: boolean
}

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'production'

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'production', label: 'Production' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'team', label: 'Team & Access' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'help', label: 'Help' },
  { id: 'advanced', label: 'Advanced' },
]

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'production', label: 'Production', group: 'production' },
  { id: 'budget-accounts', label: 'Budget accounts', group: 'production' },
  { id: 'script-supervisor', label: 'Script supervisor', group: 'production' },
  { id: 'appearance', label: 'Appearance', group: 'appearance' },
  { id: 'people', label: 'Crew structure', group: 'team' },
  { id: 'users', label: 'User management', group: 'team' },
  { id: 'project-access', label: 'Project access', group: 'team' },
  { id: 'integrations', label: 'APIs & publishing', group: 'integrations' },
  // Opens the full-page guidebook at /settings/guidebook rather than rendering inline.
  { id: 'guidebook', label: 'Guidebook', group: 'help' },
  { id: 'demo-tutorial', label: 'Demo & tutorial', group: 'advanced' },
  // Always listed: it holds the experimental-features toggle, which must be reachable in every build.
  // Its diagnostics stay behind developer mode (see the Developer section of the Settings page).
  { id: 'developer', label: 'Developer', group: 'advanced' },
]

/** Legacy `?tab=` values from the old tabbed settings page. */
const LEGACY_TAB_TO_SECTION: Record<string, SettingsSectionId> = {
  budget: 'production',
  people: 'people',
  script_supervisor: 'script-supervisor',
  apis: 'integrations',
  developer_tools: 'developer',
}

function resolveSectionId(param: string | null | undefined): SettingsSectionId | null {
  if (!param) return null
  const found = SETTINGS_SECTIONS.find((s) => s.id === param)
  return found ? found.id : null
}

/**
 * Parses the `section` URL param. Unknown/missing values give the default; a section that
 * requires developer mode falls back to the default while it is off. Never throws.
 */
export function parseSettingsSection(
  param: string | null | undefined,
  developerMode = false
): SettingsSectionId {
  const id = resolveSectionId(param)
  if (!id) return DEFAULT_SETTINGS_SECTION
  const def = SETTINGS_SECTIONS.find((s) => s.id === id)
  if (def?.requiresDeveloperMode && !developerMode) return DEFAULT_SETTINGS_SECTION
  return id
}

/** Resolves the active section from search params, accepting legacy `?tab=`. */
export function sectionFromSearchParams(
  sp: URLSearchParams,
  developerMode = false
): SettingsSectionId {
  const section = sp.get('section')
  if (section != null) return parseSettingsSection(section, developerMode)
  const tab = sp.get('tab')
  const legacy = tab ? LEGACY_TAB_TO_SECTION[tab] : undefined
  return parseSettingsSection(legacy ?? null, developerMode)
}

export function visibleSettingsSections(developerMode: boolean): SettingsSectionDef[] {
  return SETTINGS_SECTIONS.filter((s) => !s.requiresDeveloperMode || developerMode)
}
