import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { listVendors, createVendor } from '@/lib/db/repositories/vendors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GlobalVendorBadge } from '@/features/budget/vendors/GlobalVendorBadge'

const vendorSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  primary_contact_full_name: z.string().optional(),
  primary_contact_email: z.string().email('Enter a valid email').optional().or(z.literal('')),
})

export function VendorPicker({
  productionId,
  value,
  onChange,
  placeholder = 'Select vendor',
}: {
  productionId: string
  value: string | null
  onChange: (vendorId: string | null) => void
  placeholder?: string
}) {
  const queryClient = useQueryClient()
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', productionId],
    queryFn: () => listVendors(productionId),
    enabled: !!productionId,
  })

  const [createOpen, setCreateOpen] = useState(false)
  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof vendorSchema>) =>
      createVendor({
        production_id: productionId,
        company_name: data.company_name,
        primary_contact_full_name: data.primary_contact_full_name?.trim() ? data.primary_contact_full_name.trim() : null,
        primary_contact_email: data.primary_contact_email?.trim() ? data.primary_contact_email.trim() : null,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['vendors', productionId] })
      onChange(created.id)
      setCreateOpen(false)
    },
  })

  const options = useMemo(() => vendors, [vendors])

  const selectValue = value && value.trim() !== '' ? value : '__no_vendor__'

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === '__create__') {
            setCreateOpen(true)
            return
          }
          if (v === '__no_vendor__') {
            onChange(null)
            return
          }
          onChange(v || null)
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={isLoading ? 'Loading…' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__no_vendor__">None</SelectItem>
          {options.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              <span className="flex items-center gap-1.5">
                <span>{v.company_name}</span>
                {v.is_global && <GlobalVendorBadge />}
              </span>
            </SelectItem>
          ))}
          <SelectItem value="__create__">Create vendor…</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <CreateVendorDialog
            onCancel={() => setCreateOpen(false)}
            onSubmit={(d) => createMutation.mutate(d)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateVendorDialog({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: z.infer<typeof vendorSchema>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof vendorSchema>>({
    resolver: zodResolver(vendorSchema) as never,
    defaultValues: {
      company_name: '',
      primary_contact_full_name: '',
      primary_contact_email: '',
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create vendor</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Company name</Label>
          <Input {...form.register('company_name')} />
          {form.formState.errors.company_name && (
            <p className="text-destructive text-sm">{form.formState.errors.company_name.message}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Primary contact</Label>
            <Input {...form.register('primary_contact_full_name')} />
          </div>
          <div>
            <Label>Email</Label>
            <Input {...form.register('primary_contact_email')} />
            {form.formState.errors.primary_contact_email && (
              <p className="text-destructive text-sm">{form.formState.errors.primary_contact_email.message}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Create
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

