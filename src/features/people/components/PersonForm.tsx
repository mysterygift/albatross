import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/db/types'
import { parsePhases } from '@/lib/people/productionPhases'
import { PhaseTagsInput } from '@/features/people/components/PhaseTagsInput'

export const personSchema = z.object({
  name: z.string().min(1),
  is_cast: z.boolean(),
  email: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  phases: z.array(z.string()),
  notes: z.string().optional(),
  contributor_form_status: z.enum(['not_requested', 'requested', 'signed', 'expired']),
  cast_number: z.string().optional(),
  agent_name: z.string().optional(),
  agent_email: z.string().optional().refine((v) => !v || v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'Invalid email' }),
  agent_phone: z.string().optional(),
  role_name: z.string().optional(),
})

export type PersonFormValues = z.infer<typeof personSchema>

export function PersonForm({
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: {
  defaultValues: Partial<Person>
  onSubmit: (d: PersonFormValues) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema) as never,
    defaultValues: {
      name: defaultValues.name ?? '',
      is_cast: Number(defaultValues.is_cast) !== 0,
      email: defaultValues.email ?? '',
      phone: defaultValues.phone ?? '',
      department: defaultValues.department ?? '',
      phases: parsePhases(defaultValues.phases),
      notes: defaultValues.notes ?? '',
      contributor_form_status: defaultValues.contributor_form_status ?? 'not_requested',
      cast_number: defaultValues.cast_number ?? '',
      agent_name: defaultValues.agent_name ?? '',
      agent_email: defaultValues.agent_email ?? '',
      agent_phone: defaultValues.agent_phone ?? '',
      role_name: defaultValues.role_name ?? '',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>{defaultValues.id ? 'Edit person' : 'Add person'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input {...form.register('name')} />
          {form.formState.errors.name && <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={form.watch('is_cast')}
            onCheckedChange={(v) => form.setValue('is_cast', !!v)}
          />
          <Label>Cast (otherwise crew)</Label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Email</Label>
            <Input {...form.register('email')} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input {...form.register('phone')} />
          </div>
        </div>
        <div>
          <Label>Department</Label>
          <Input {...form.register('department')} />
        </div>
        <Controller
          name="phases"
          control={form.control}
          render={({ field }) => (
            <PhaseTagsInput value={field.value} onChange={field.onChange} disabled={isLoading} />
          )}
        />
        {form.watch('is_cast') && (
          <div>
            <Label>Contributor form status</Label>
            <Select
              value={form.watch('contributor_form_status')}
              onValueChange={(v) => form.setValue('contributor_form_status', v as PersonFormValues['contributor_form_status'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="not_requested">Not requested</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {form.watch('is_cast') && (
          <>
            <div>
              <Label>Cast number</Label>
              <Input {...form.register('cast_number')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Agent name</Label>
                <Input {...form.register('agent_name')} />
              </div>
              <div>
                <Label>Agent email</Label>
                <Input {...form.register('agent_email')} type="email" />
                {form.formState.errors.agent_email && <p className="text-destructive text-sm">{form.formState.errors.agent_email.message}</p>}
              </div>
            </div>
            <div>
              <Label>Agent phone</Label>
              <Input {...form.register('agent_phone')} />
            </div>
          </>
        )}
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>Save</Button>
        </DialogFooter>
      </form>
    </>
  )
}
