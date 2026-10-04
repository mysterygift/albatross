import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BUILT_IN_HAZARDS } from '@/lib/risk-assessments/builtInHazards'
import { blankHazard, hazardContent } from '@/lib/risk-assessments/content'
import type { HazardContent, HazardTemplate } from '@/lib/db/types'

export type HazardPickerProps = {
  templates: HazardTemplate[]
  onPick: (hazard: HazardContent) => void
  onDeleteTemplate?: (template: HazardTemplate) => void
  disabled?: boolean
}

/** "Add hazard": a blank hazard, a built-in one, or one saved as a template in this project. */
export function HazardPicker({ templates, onPick, onDeleteTemplate, disabled }: HazardPickerProps) {
  const [open, setOpen] = useState(false)
  const pick = (hazard: HazardContent) => {
    onPick(hazard)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Plus className="size-4" /> Add hazard
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search hazards…" />
          <CommandList>
            <CommandEmpty>No matching hazards.</CommandEmpty>
            <CommandGroup heading="Blank">
              <CommandItem value="blank hazard" onSelect={() => pick(blankHazard())}>
                Blank hazard
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Built-in">
              {BUILT_IN_HAZARDS.map((h) => (
                <CommandItem key={h.key} value={`built-in ${h.name}`} onSelect={() => pick(hazardContent(h))}>
                  {h.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Saved in this project">
              {templates.length === 0 ? (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">
                  None yet. Use “Save as template” on a hazard.
                </p>
              ) : (
                templates.map((t) => (
                  <CommandItem key={t.id} value={`saved ${t.name}`} onSelect={() => pick(hazardContent(t))} className="group">
                    <span className="flex-1 truncate">{t.name}</span>
                    {onDeleteTemplate ? (
                      <button
                        type="button"
                        aria-label={`Delete template ${t.name}`}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteTemplate(t)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
