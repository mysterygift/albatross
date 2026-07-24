import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { Person } from '@/lib/db/types'
import {
  getDefaultColorConfig,
  getDepartmentNames,
  nextPrincipalColor,
  type BookingColorConfig,
} from '@/features/people/lib/bookingCalendarColors'

function ColorSwatch({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (hex: string) => void
  ariaLabel: string
}) {
  return (
    <label className="relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border shadow-xs">
      <span className="size-5 rounded" style={{ backgroundColor: value }} />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

export function BookingColorSettingsDialog({
  open,
  onOpenChange,
  people,
  config,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  people: Person[]
  config: BookingColorConfig
  onSave: (config: BookingColorConfig) => void
}) {
  const [draft, setDraft] = useState<BookingColorConfig>(config)
  const [wasOpen, setWasOpen] = useState(open)

  // Reset the working copy to the latest saved config each time the dialog opens.
  if (open && !wasOpen) {
    setWasOpen(true)
    setDraft(config)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const departments = useMemo(() => getDepartmentNames(people), [people])
  const castMembers = useMemo(
    () =>
      people
        .filter((p) => p.is_cast === 1)
        .sort((a, b) => {
          const an = a.cast_number ? Number(a.cast_number) : Number.POSITIVE_INFINITY
          const bn = b.cast_number ? Number(b.cast_number) : Number.POSITIVE_INFINITY
          if (an !== bn) return an - bn
          return a.name.localeCompare(b.name)
        }),
    [people]
  )

  const setDepartmentColor = (dept: string, hex: string) =>
    setDraft((d) => ({ ...d, departmentColors: { ...d.departmentColors, [dept]: hex } }))

  const togglePrincipal = (personId: string, isPrincipal: boolean) =>
    setDraft((d) => {
      const next = { ...d.principalCastColors }
      if (isPrincipal) {
        next[personId] = nextPrincipalColor(d)
      } else {
        delete next[personId]
      }
      return { ...d, principalCastColors: next }
    })

  const setPrincipalColor = (personId: string, hex: string) =>
    setDraft((d) => ({
      ...d,
      principalCastColors: { ...d.principalCastColors, [personId]: hex },
    }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Calendar colors</DialogTitle>
          <DialogDescription>
            Color-code booking pills by crew department and cast tier.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-6 py-1">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Crew departments</h3>
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No crew departments yet.</p>
              ) : (
                <div className="space-y-2">
                  {departments.map((dept) => (
                    <div key={dept} className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-foreground">{dept}</span>
                      <ColorSwatch
                        value={draft.departmentColors[dept] ?? draft.crewFallbackColor}
                        onChange={(hex) => setDepartmentColor(dept, hex)}
                        ariaLabel={`Color for ${dept}`}
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="truncate text-sm text-muted-foreground">Other crew</span>
                    <ColorSwatch
                      value={draft.crewFallbackColor}
                      onChange={(hex) => setDraft((d) => ({ ...d, crewFallbackColor: hex }))}
                      ariaLabel="Color for other crew"
                    />
                  </div>
                </div>
              )}
            </section>

            <Separator className="bg-border" />

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Cast</h3>
                <p className="text-xs text-muted-foreground">
                  Mark principals to give them an individual color. Everyone else uses the
                  supporting color.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-foreground">Supporting cast / standing artists</span>
                <ColorSwatch
                  value={draft.supportingCastColor}
                  onChange={(hex) => setDraft((d) => ({ ...d, supportingCastColor: hex }))}
                  ariaLabel="Color for supporting cast"
                />
              </div>

              {castMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cast members yet.</p>
              ) : (
                <div className="space-y-2">
                  {castMembers.map((p) => {
                    const isPrincipal = p.id in draft.principalCastColors
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`principal-${p.id}`}
                          checked={isPrincipal}
                          onCheckedChange={(checked) => togglePrincipal(p.id, checked === true)}
                        />
                        <Label
                          htmlFor={`principal-${p.id}`}
                          className="flex-1 cursor-pointer truncate text-sm font-normal text-foreground"
                        >
                          {p.name}
                          {p.role_name ? (
                            <span className="text-muted-foreground"> · {p.role_name}</span>
                          ) : null}
                        </Label>
                        {isPrincipal && (
                          <ColorSwatch
                            value={draft.principalCastColors[p.id]}
                            onChange={(hex) => setPrincipalColor(p.id, hex)}
                            ariaLabel={`Color for ${p.name}`}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            className="mr-auto"
            onClick={() => setDraft(getDefaultColorConfig(people))}
          >
            Reset to defaults
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-mint-600 text-white hover:bg-mint-700 focus-visible:ring-mint-500/50"
            onClick={() => {
              onSave(draft)
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
