import { cn } from '@/lib/utils'
import {
  SETTINGS_GROUPS,
  visibleSettingsSections,
  type SettingsSectionId,
} from '@/features/settings/settingsSections'

interface SettingsNavProps {
  active: SettingsSectionId
  developerMode: boolean
  onSelect: (id: SettingsSectionId) => void
}

/** Grouped list on desktop; a native select below `md`. */
export function SettingsNav({ active, developerMode, onSelect }: SettingsNavProps) {
  const sections = visibleSettingsSections(developerMode)
  return (
    <>
      <div className="md:hidden">
        <label htmlFor="settings-section-select" className="sr-only">
          Settings section
        </label>
        <select
          id="settings-section-select"
          value={active}
          onChange={(e) => onSelect(e.target.value as SettingsSectionId)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          {SETTINGS_GROUPS.map((group) => {
            const items = sections.filter((s) => s.group === group.id)
            if (items.length === 0) return null
            return (
              <optgroup key={group.id} label={group.label}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>
      <nav aria-label="Settings sections" className="hidden w-52 shrink-0 space-y-4 md:block">
        {SETTINGS_GROUPS.map((group) => {
          const items = sections.filter((s) => s.group === group.id)
          if (items.length === 0) return null
          return (
            <div key={group.id} className="space-y-1">
              <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={s.id === active ? 'page' : undefined}
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    'block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    s.id === active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )
        })}
      </nav>
    </>
  )
}
