'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMemo } from 'react'
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
import {
  getResolvedCrewDepartmentNames,
  getResolvedCrewRolesForDepartment,
  getResolvedHodRoleForDepartment,
} from '@/lib/people/crewHierarchyResolver'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import type { Person } from '@/lib/db/types'
import { parsePhases } from '@/lib/people/productionPhases'
import { PhaseTagsInput } from '@/features/people/components/PhaseTagsInput'

const emailRefine = (v: string | undefined) =>
  !v || v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export const crewFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    department: z.string().min(1, 'Department is required'),
    role_name: z.string().optional(),
    email: z
      .string()
      .optional()
      .refine(emailRefine, { message: 'Invalid email' }),
    phone: z.string().optional(),
    phases: z.array(z.string()),
    notes: z.string().optional(),
  })
  .refine(
    (data) => !data.department || (data.role_name != null && data.role_name.trim() !== ''),
    { message: 'Role is required when department is selected', path: ['role_name'] }
  )

export type CrewFormValues = z.infer<typeof crewFormSchema>

function personToCrewFormValues(
  p: Partial<Person>,
  hierarchy: CrewHierarchyConfig
): CrewFormValues {
  const deptNames = getResolvedCrewDepartmentNames(hierarchy)
  const validDept =
    p.department?.trim() && deptNames.includes(p.department.trim())
  return {
    name: p.name ?? '',
    department: validDept ? p.department!.trim() : '',
    role_name: p.role_name ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    phases: parsePhases(p.phases),
    notes: p.notes ?? '',
  }
}

export function CrewForm({
  hierarchy,
  defaultValues,
  mode,
  onSubmit,
  onCancel,
  isLoading,
}: {
  hierarchy: CrewHierarchyConfig
  defaultValues: Partial<Person>
  mode: 'add' | 'edit'
  onSubmit: (d: CrewFormValues) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<CrewFormValues>({
    resolver: zodResolver(crewFormSchema) as never,
    defaultValues: personToCrewFormValues(defaultValues, hierarchy),
  })

  const department = form.watch('department')
  const roleName = form.watch('role_name')

  const deptNames = getResolvedCrewDepartmentNames(hierarchy)
  const roleOptions = useMemo(() => {
    if (!department || !deptNames.includes(department)) return []
    const canon = getResolvedCrewRolesForDepartment(hierarchy, department)
    const existing = mode === 'edit' ? defaultValues.role_name?.trim() : null
    if (existing && !canon.includes(existing)) return [...canon, existing]
    return canon
  }, [hierarchy, department, mode, defaultValues.role_name, deptNames])

  const hodRole = department
    ? getResolvedHodRoleForDepartment(hierarchy, department)
    : null
  const isHod = hodRole != null && roleName?.trim() === hodRole

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === 'add' ? 'Add crew' : 'Edit crew'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Section 1 — Identity */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Identity
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label htmlFor="crew-name">Name</Label>
              <Input
                id="crew-name"
                {...form.register('name')}
                placeholder="Full name"
              />
              {form.formState.errors.name && (
                <p className="text-destructive text-sm mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label>Department</Label>
              <Select
                value={department || undefined}
                onValueChange={(v) => {
                  form.setValue('department', v)
                  const roles = v
                    ? getResolvedCrewRolesForDepartment(hierarchy, v)
                    : []
                  const current = form.getValues('role_name')?.trim()
                  if (current && !roles.includes(current))
                    form.setValue('role_name', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {deptNames.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.department && (
                <p className="text-destructive text-sm mt-1">
                  {form.formState.errors.department.message}
                </p>
              )}
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={roleName?.trim() || undefined}
                onValueChange={(v) => form.setValue('role_name', v)}
                disabled={!department}
              >
                <SelectTrigger>
                  <SelectValue placeholder={department ? 'Select role' : 'Select department first'} />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.role_name && (
                <p className="text-destructive text-sm mt-1">
                  {form.formState.errors.role_name.message}
                </p>
              )}
              {department && isHod && (
                <p className="text-muted-foreground text-xs mt-1">
                  This role is the HOD for {department}.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2 — Contact */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Contact
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                {...form.register('email')}
                type="email"
                placeholder="person@example.com"
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-sm mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...form.register('phone')} placeholder="Phone number" />
            </div>
          </div>
        </div>

        {/* Section 3 — Production / admin */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Production / admin
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Controller
              name="phases"
              control={form.control}
              render={({ field }) => (
                <PhaseTagsInput value={field.value} onChange={field.onChange} disabled={isLoading} />
              )}
            />
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
