import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import {
  clientDraftSchema,
  clientDraftToRepoFields,
  CLIENT_PHONE_MAX_DIGITS,
  type ClientDraftForm,
} from '@/lib/clients/clientFieldValidation'
import {
  createClient,
  listClientsWithProjectCounts,
  softDeleteClient,
  updateClient,
  type ClientWithProjectCount,
} from '@/lib/db/repositories/clients'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function ClientFormDialog({
  open,
  title,
  submitLabel,
  initial,
  onOpenChange,
  onSubmit,
  isLoading,
  error,
}: {
  open: boolean
  title: string
  submitLabel: string
  initial: ClientDraftForm
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ClientDraftForm) => void
  isLoading: boolean
  error: string | null
}) {
  const form = useForm<ClientDraftForm>({
    resolver: zodResolver(clientDraftSchema),
    defaultValues: initial,
  })

  useEffect(() => {
    if (open) form.reset(initial)
  }, [open, initial, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="client-form-name">Name</Label>
            <Input id="client-form-name" {...form.register('name')} placeholder="Person or business name" />
            {form.formState.errors.name && (
              <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-form-email">Email</Label>
            <Input
              id="client-form-email"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...form.register('email')}
              placeholder="Optional (e.g. user@domain.com)"
            />
            {form.formState.errors.email && (
              <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-form-phone">Phone</Label>
            <Input
              id="client-form-phone"
              type="tel"
              maxLength={CLIENT_PHONE_MAX_DIGITS + 1}
              {...form.register('phone')}
              placeholder="Optional (e.g. +441234567890)"
            />
            {form.formState.errors.phone && (
              <p className="text-destructive text-sm">{form.formState.errors.phone.message}</p>
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function clientToDraft(c: ClientWithProjectCount): ClientDraftForm {
  return {
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
  }
}

export function ClientsSettingsSection() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [editClient, setEditClient] = useState<ClientWithProjectCount | null>(null)
  const [deleteClient, setDeleteClient] = useState<ClientWithProjectCount | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: listClientsWithProjectCounts,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['clients'] })
  }

  const createMutation = useMutation({
    mutationFn: (data: ClientDraftForm) => createClient(clientDraftToRepoFields(data)),
    onSuccess: () => {
      invalidate()
      setAddOpen(false)
      setFormError(null)
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Could not create client')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientDraftForm }) =>
      updateClient(id, clientDraftToRepoFields(data)),
    onSuccess: () => {
      invalidate()
      setEditClient(null)
      setFormError(null)
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Could not update client')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteClient(id),
    onSuccess: () => {
      invalidate()
      setDeleteClient(null)
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Could not delete client')
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clients</CardTitle>
        <CardDescription>
          Instance-wide client contacts reused across projects. Edits apply everywhere this client is selected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => { setFormError(null); setAddOpen(true) }}>
            <Plus className="size-4 mr-1" />
            Add client
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading clients…</p>
        ) : clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">No clients yet. Add one or create a client when editing a project.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right w-24">Projects</TableHead>
                  <TableHead className="w-[100px] text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.email ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.phone ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{c.project_count}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setFormError(null); setEditClient(c) }}
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => { setFormError(null); setDeleteClient(c) }}
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <ClientFormDialog
          open={addOpen}
          title="Add client"
          submitLabel="Add"
          initial={{ name: '', email: '', phone: '' }}
          onOpenChange={setAddOpen}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          error={formError}
        />

        {editClient && (
          <ClientFormDialog
            key={editClient.id}
            open={editClient != null}
            title="Edit client"
            submitLabel="Save"
            initial={clientToDraft(editClient)}
            onOpenChange={(open) => !open && setEditClient(null)}
            onSubmit={(data) => updateMutation.mutate({ id: editClient.id, data })}
            isLoading={updateMutation.isPending}
            error={formError}
          />
        )}

        <Dialog open={deleteClient != null} onOpenChange={(open) => !open && setDeleteClient(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete client?</DialogTitle>
            </DialogHeader>
            {deleteClient && (
              <div className="space-y-3 text-sm">
                <p>
                  Delete <span className="font-medium">{deleteClient.name}</span>? This cannot be undone.
                </p>
                {deleteClient.project_count > 0 && (
                  <p className="text-amber-800 dark:text-amber-200 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    {deleteClient.project_count} project
                    {deleteClient.project_count === 1 ? '' : 's'} linked to this client will have the client
                    cleared.
                  </p>
                )}
                {formError && <p className="text-destructive">{formError}</p>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteClient(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending || !deleteClient}
                onClick={() => deleteClient && deleteMutation.mutate(deleteClient.id)}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
