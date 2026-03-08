import { useForm } from 'react-hook-form'
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
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/db/types'

const emailRefine = (v: string | undefined) =>
  !v || v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export const castFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  cast_number: z.string().optional(),
  role_name: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine(emailRefine, { message: 'Invalid email' }),
  phone: z.string().optional(),
  agent_name: z.string().optional(),
  agent_email: z
    .string()
    .optional()
    .refine(emailRefine, { message: 'Invalid email' }),
  agent_phone: z.string().optional(),
  contributor_form_status: z.enum(['not_requested', 'requested', 'signed', 'expired']),
  notes: z.string().optional(),
  phases: z.string().optional(),
})

export type CastFormValues = z.infer<typeof castFormSchema>

function personToCastFormValues(p: Partial<Person>): CastFormValues {
  return {
    name: p.name ?? '',
    cast_number: p.cast_number ?? '',
    role_name: p.role_name ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    agent_name: p.agent_name ?? '',
    agent_email: p.agent_email ?? '',
    agent_phone: p.agent_phone ?? '',
    contributor_form_status: p.contributor_form_status ?? 'not_requested',
    notes: p.notes ?? '',
    phases: p.phases ?? '',
  }
}

export function CastForm({
  defaultValues,
  mode,
  onSubmit,
  onCancel,
  isLoading,
}: {
  defaultValues: Partial<Person>
  mode: 'add' | 'edit'
  onSubmit: (d: CastFormValues) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<CastFormValues>({
    resolver: zodResolver(castFormSchema) as never,
    defaultValues: personToCastFormValues(defaultValues),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === 'add' ? 'Add cast' : 'Edit cast'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Section 1 — Identity */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Identity</p>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Name</Label>
              <Input {...form.register('name')} placeholder="Full name" />
              {form.formState.errors.name && (
                <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cast number</Label>
                <Input {...form.register('cast_number')} placeholder="e.g. 1" />
              </div>
              <div>
                <Label>Role</Label>
                <Input {...form.register('role_name')} placeholder="e.g. character name" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2 — Direct contact */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Direct contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input {...form.register('email')} type="email" placeholder="person@example.com" />
              {form.formState.errors.email && (
                <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...form.register('phone')} placeholder="Phone number" />
            </div>
          </div>
        </div>

        {/* Section 3 — Agent */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Agent</p>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Agent name</Label>
              <Input {...form.register('agent_name')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agent email</Label>
                <Input {...form.register('agent_email')} type="email" />
                {form.formState.errors.agent_email && (
                  <p className="text-destructive text-sm">{form.formState.errors.agent_email.message}</p>
                )}
              </div>
              <div>
                <Label>Agent phone</Label>
                <Input {...form.register('agent_phone')} />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4 — Production / admin */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Production / admin</p>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Contributor form status</Label>
              <Select
                value={form.watch('contributor_form_status')}
                onValueChange={(v) =>
                  form.setValue('contributor_form_status', v as CastFormValues['contributor_form_status'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_requested">Not requested</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phases</Label>
              <Input {...form.register('phases')} placeholder="e.g. pre, production, post" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input {...form.register('notes')} placeholder="Internal notes" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
