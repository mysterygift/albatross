import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import { listVendors, createVendor } from '@/lib/db/repositories/vendors'
import { listExpensesByProduction } from '@/lib/db/repositories/budget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Vendor } from '@/lib/db/types'
import { Plus, Search, Building2 } from 'lucide-react'

const createVendorSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  primary_contact_full_name: z.string().optional(),
  primary_contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
})

/** Total spend per vendor_id from expenses. */
function useVendorSpend(productionId: string | undefined) {
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', productionId],
    queryFn: () => listExpensesByProduction(productionId!),
    enabled: !!productionId,
  })
  return useMemo(() => {
    const map = new Map<string, number>()
    for (const e of expenses) {
      if (e.vendor_id) {
        map.set(e.vendor_id, (map.get(e.vendor_id) ?? 0) + e.amount)
      }
    }
    return map
  }, [expenses])
}

type VendorWithSpend = Vendor & { totalSpend: number }

export function VendorsIndexPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const navigate = useNavigate()
  const { format } = useCurrency()
  const currency = currentProduction?.currency_code ?? 'GBP'

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof createVendorSchema>) =>
      createVendor({
        production_id: currentProductionId!,
        company_name: data.company_name,
        primary_contact_full_name: data.primary_contact_full_name?.trim() || undefined,
        primary_contact_email: data.primary_contact_email?.trim() || undefined,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['vendors', currentProductionId] })
      setCreateOpen(false)
      setSelectedId(created.id)
      navigate(`/budget/vendors/${created.id}`)
    },
  })

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', currentProductionId],
    queryFn: () => listVendors(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const spendByVendor = useVendorSpend(currentProductionId ?? undefined)

  const vendorsWithSpend: VendorWithSpend[] = useMemo(
    () =>
      vendors.map((v) => ({
        ...v,
        totalSpend: spendByVendor.get(v.id) ?? 0,
      })),
    [vendors, spendByVendor]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [...vendorsWithSpend].sort((a, b) => a.company_name.localeCompare(b.company_name))
    return vendorsWithSpend
      .filter((v) => v.company_name.toLowerCase().includes(q))
      .sort((a, b) => a.company_name.localeCompare(b.company_name))
  }, [vendorsWithSpend, search])

  const selected = selectedId ? filtered.find((v) => v.id === selectedId) : null

  if (!currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Select a production to manage vendors.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Vendor Management</h1>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          New vendor
        </Button>
      </div>

      <CreateVendorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(d) => createMutation.mutate(d)}
        isLoading={createMutation.isPending}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Left: search + rolodex list */}
        <Card className="flex flex-col border-border bg-card/80">
          <CardHeader className="border-b border-border py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by company name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9 bg-muted/30 border-border"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading vendors…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {search.trim() ? 'No vendors match your search.' : 'No vendors yet. Add one to get started.'}
              </div>
            ) : (
              <ul className="rolodex-list space-y-0 py-2">
                {filtered.map((v, index) => (
                  <li
                    key={v.id}
                    className="rolodex-card"
                    style={{ '--rolodex-index': index } as React.CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className="w-full text-left rounded-md border border-border bg-card px-3 py-2.5 mx-2 mb-1 transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-background data-[selected]:border-primary/50 data-[selected]:bg-muted/40"
                      data-selected={selectedId === v.id ? true : undefined}
                    >
                      <div className="font-medium text-foreground truncate">{v.company_name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">
                        {v.primary_contact_full_name || v.primary_contact_email || '—'}
                      </div>
                      <div className="mt-1 text-xs font-medium text-primary">
                        {format(v.totalSpend, currency).formatted}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Right: preview or empty state */}
        <Card className="flex flex-col border-border bg-card/80 min-h-0">
          <CardContent className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <VendorPreviewCard
                vendor={selected}
                format={format}
                currency={currency}
                onViewDetail={() => {
                  navigate(`/budget/vendors/${selected.id}`)
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="rounded-full bg-muted/50 p-4">
                  <Building2 className="size-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {filtered.length === 0
                    ? 'Add a vendor or adjust your search.'
                    : 'Select a vendor from the list to preview.'}
                </p>
                {filtered.length > 0 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/budget/vendors/${filtered[0]!.id}`}>
                      Open {filtered[0]!.company_name}
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function VendorPreviewCard({
  vendor,
  format,
  currency,
  onViewDetail,
}: {
  vendor: VendorWithSpend
  format: (amount: number, currency: string) => { formatted: string }
  currency: string
  onViewDetail: () => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{vendor.company_name}</h2>
        {vendor.primary_contact_full_name && (
          <p className="text-sm text-muted-foreground">{vendor.primary_contact_full_name}</p>
        )}
        {vendor.primary_contact_email && (
          <p className="text-sm text-muted-foreground">{vendor.primary_contact_email}</p>
        )}
      </div>
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
        <span className="text-xs text-muted-foreground">Total spend</span>
        <p className="text-lg font-semibold text-foreground">{format(vendor.totalSpend, currency).formatted}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onViewDetail}>
        View vendor detail
      </Button>
    </div>
  )
}

function CreateVendorDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: z.infer<typeof createVendorSchema>) => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof createVendorSchema>>({
    resolver: zodResolver(createVendorSchema),
    defaultValues: {
      company_name: '',
      primary_contact_full_name: '',
      primary_contact_email: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        company_name: '',
        primary_contact_full_name: '',
        primary_contact_email: '',
      })
    }
  }, [open, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add vendor</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="create-company">Company name</Label>
            <Input id="create-company" {...form.register('company_name')} className="mt-1" />
            {form.formState.errors.company_name && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.company_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="create-contact">Primary contact</Label>
              <Input id="create-contact" {...form.register('primary_contact_full_name')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input id="create-email" {...form.register('primary_contact_email')} className="mt-1" />
              {form.formState.errors.primary_contact_email && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.primary_contact_email.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
