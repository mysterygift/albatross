import { Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useUiTheme } from '@/hooks/useUiTheme'
import { UI_THEMES, type UiThemeId } from '@/lib/uiTheme/uiThemes'
import { cn } from '@/lib/utils'

/**
 * Fixed preview colours and corner radius per theme. Each tile shows its own look
 * whichever theme is active, so these are not read from the live CSS variables.
 */
const PREVIEW: Record<UiThemeId, { ground: string; block: string; band: string; chip: string; ink: string; radius: string }> = {
  'albatross-mint': { ground: '#1e2128', block: '#5fd6a8', band: '#282c35', chip: '#5fd6a8', ink: '#f2f4f7', radius: '8px' },
  bold: { ground: '#fff6e5', block: '#2b2bff', band: '#ffd60a', chip: '#ff4d2e', ink: '#111111', radius: '0px' },
  yuzu: { ground: '#fbfbf7', block: '#0c0c0c', band: '#ffffff', chip: '#d4ff3a', ink: '#0c0c0c', radius: '4px' },
  sunset: { ground: '#fff1e0', block: '#0f7c75', band: '#ff6fa3', chip: '#ffc93c', ink: '#1d2a4a', radius: '999px' },
  signal: { ground: '#0b0c09', block: '#ffd400', band: '#14160f', chip: '#2e3324', ink: '#f1f1e6', radius: '2px' },
  ledger: { ground: '#f4efe6', block: '#1a1a18', band: '#fffdf8', chip: '#8e1b14', ink: '#1a1a18', radius: '0px' },
  clay: { ground: '#f6f2ee', block: '#5b4bd6', band: '#fff0b3', chip: '#ffd8c2', ink: '#2a2540', radius: '16px' },
}

export function AppearanceSettingsSection() {
  const { uiTheme, setUiTheme, isSaving } = useUiTheme()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose the look of the app. The layout and workflows are the same in every theme.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="UI theme" className="grid gap-3 sm:grid-cols-2">
          {UI_THEMES.map((theme) => {
            const selected = theme.id === uiTheme
            const preview = PREVIEW[theme.id]
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-slot="theme-option"
                data-selected={selected}
                disabled={isSaving}
                onClick={() => setUiTheme(theme.id)}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none',
                  selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/40'
                )}
              >
                <span
                  aria-hidden="true"
                  className="relative block h-24 w-full overflow-hidden border"
                  style={{ background: preview.ground, borderColor: preview.ink, borderRadius: preview.radius }}
                >
                  <span className="absolute inset-x-0 top-0 h-[22%]" style={{ background: preview.band, borderBottom: `2px solid ${preview.ink}` }} />
                  <span className="absolute inset-y-[24%] left-[8%] w-[34%]" style={{ background: preview.block, borderRadius: preview.radius }} />
                  <span
                    className="absolute right-[10%] bottom-[14%] h-[34%] w-[36%]"
                    style={{ background: preview.chip, border: `2px solid ${preview.ink}`, borderRadius: preview.radius }}
                  />
                </span>
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{theme.label}</span>
                    <span className="block text-xs text-muted-foreground">{theme.description}</span>
                  </span>
                  {selected && <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
