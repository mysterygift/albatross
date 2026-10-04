import { useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Person } from '@/lib/db/types'
import type { RamsFormValues } from '@/features/risk-assessments/ramsForm'

/** Per-RAMS first aider list (name, phone, email) with an "Add from crew" picker. */
export function FirstAidersEditor({ crew }: { crew: Person[] }) {
  const { control, register } = useFormContext<RamsFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'first_aiders', keyName: 'fieldKey' })
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">No first aiders listed.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={field.fieldKey} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
              <Input aria-label={`First aider ${i + 1} name`} placeholder="Name" {...register(`first_aiders.${i}.name`)} />
              <Input aria-label={`First aider ${i + 1} phone`} placeholder="Phone" {...register(`first_aiders.${i}.phone`)} />
              <Input aria-label={`First aider ${i + 1} email`} placeholder="Email" {...register(`first_aiders.${i}.email`)} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove first aider ${i + 1}`}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <UserPlus className="size-4" /> Add from crew
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search crew…" />
              <CommandList>
                <CommandEmpty>No crew found.</CommandEmpty>
                <CommandGroup>
                  {crew.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.role_name ?? ''} ${p.department ?? ''}`}
                      onSelect={() => {
                        append({ name: p.name, phone: p.phone ?? '', email: p.email ?? '' })
                        setPickerOpen(false)
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{p.name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {[p.role_name, p.department].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', phone: '', email: '' })}>
          <Plus className="size-4" /> Add first aider
        </Button>
      </div>
    </div>
  )
}
