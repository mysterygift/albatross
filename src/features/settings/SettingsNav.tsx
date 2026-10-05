import { ChevronsUpDown } from 'lucide-react'
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
      <div className="space-y-1.5 md:hidden">
        <label htmlFor="settings-section-select" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Settings section
        </label>
        {/* A native select (the iOS picker wheel), drawn as a button with a chevron so it reads as a menu. */}
        <div className="relative">
          <select
            id="settings-section-select"
            value={active}
            onChange={(e) => onSelect(e.target.value as SettingsSectionId)}
            className="h-11 w-full appearance-none rounded-md border border-input bg-muted/40 pr-10 pl-3 text-base font-medium text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
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
          <ChevronsUpDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
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
