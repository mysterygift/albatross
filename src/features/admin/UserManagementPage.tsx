import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { UseMutationResult } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDb } from '@/lib/db/client'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import type { ProjectAccessLevel } from '@/lib/access/projectAccess'
import {
  createUserAsAdmin,
  disableUserAsAdmin,
  enableUserAsAdmin,
  grantUserProjectAccessAsAdmin,
  listProductionsBriefAsAdmin,
  listUserProjectVisibilityAsAdmin,
  listUsersAsAdmin,
  resetUserPasswordAsAdmin,
  revokeUserProjectAccessAsAdmin,
  updateUserProjectAccessAsAdmin,
  updateUserRoleAsAdmin,
  type ManagedUser,
  type InstanceRole,
  type ProductionBriefForAdmin,
} from '@/lib/auth/adminUserManagementService'
import type { UserProjectVisibilityRow } from '@/lib/db/repositories/projectMemberships'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function roleBadgeVariant(role: InstanceRole): 'default' | 'secondary' {
  return role === 'admin' ? 'default' : 'secondary'
}

export function AdminOnlyUserManagementRoute() {
  const { isLoading, authSupported, isAuthenticated, isInstanceAdmin } = useAuthSession()
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading user management…</div>
  if (!authSupported) return <Navigate to="/settings" replace />
  if (!isAuthenticated || !isInstanceAdmin) return <Navigate to="/" replace />
  return <UserManagementPage />
}

export function UserManagementPage() {
  const { currentUser } = useAuthSession()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetOpenFor, setResetOpenFor] = useState<ManagedUser | null>(null)
  const [roleOpenFor, setRoleOpenFor] = useState<ManagedUser | null>(null)
  const [visibilityForUser, setVisibilityForUser] = useState<ManagedUser | null>(null)
  const [disableConfirmUser, setDisableConfirmUser] = useState<ManagedUser | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin-user-management-users', currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const db = await getDb()
      return listUsersAsAdmin(db, currentUser!)
    },
  })

  const createMutation = useMutation({
    mutationFn: async (input: { username: string; password: string; role: InstanceRole }) => {
      const db = await getDb()
      return createUserAsAdmin({ db, actor: currentUser!, ...input })
    },
    onSuccess: async () => {
      setCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['admin-user-management-users'] })
    },
  })

  const disableMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const db = await getDb()
      return disableUserAsAdmin({ db, actor: currentUser!, targetUserId })
    },
    onSuccess: async () => {
      setDisableConfirmUser(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-user-management-users'] })
    },
  })

  const enableMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const db = await getDb()
      return enableUserAsAdmin({ db, actor: currentUser!, targetUserId })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-user-management-users'] })
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (input: { targetUserId: string; newPassword: string }) => {
      const db = await getDb()
      return resetUserPasswordAsAdmin({
        db,
        actor: currentUser!,
        targetUserId: input.targetUserId,
        newPassword: input.newPassword,
      })
    },
    onSuccess: async () => {
      setResetOpenFor(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-user-management-users'] })
    },
  })

  const roleMutation = useMutation({
    mutationFn: async (input: { targetUserId: string; role: InstanceRole }) => {
      const db = await getDb()
      return updateUserRoleAsAdmin({ db, actor: currentUser!, targetUserId: input.targetUserId, role: input.role })
    },
    onSuccess: async () => {
      setRoleOpenFor(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-user-management-users'] })
    },
  })

  const visibilityQueryKey = ['admin-user-project-visibility', visibilityForUser?.id] as const
  const productionsBriefQueryKey = ['admin-productions-brief'] as const

  const userVisibilityQuery = useQuery({
    queryKey: visibilityQueryKey,
    enabled: Boolean(visibilityForUser && currentUser),
    queryFn: async () => {
      const db = await getDb()
      return listUserProjectVisibilityAsAdmin(db, currentUser!, visibilityForUser!.id)
    },
  })

  const productionsBriefQuery = useQuery({
    queryKey: productionsBriefQueryKey,
    enabled: Boolean(visibilityForUser && currentUser),
    queryFn: async () => {
      const db = await getDb()
      return listProductionsBriefAsAdmin(db, currentUser!)
    },
  })

  const invalidateVisibilityQueries = async (targetUserId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['admin-user-project-visibility', targetUserId] })
    await queryClient.invalidateQueries({ queryKey: productionsBriefQueryKey })
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
  }

  const grantProjectMutation = useMutation({
    mutationFn: async (input: { productionId: string; accessLevel: ProjectAccessLevel }) => {
      const db = await getDb()
      return grantUserProjectAccessAsAdmin({
        db,
        actor: currentUser!,
        targetUserId: visibilityForUser!.id,
        productionId: input.productionId,
        accessLevel: input.accessLevel,
      })
    },
    onSuccess: async () => {
      if (visibilityForUser) await invalidateVisibilityQueries(visibilityForUser.id)
    },
  })

  const updateProjectAccessMutation = useMutation({
    mutationFn: async (input: { productionId: string; accessLevel: ProjectAccessLevel }) => {
      const db = await getDb()
      return updateUserProjectAccessAsAdmin({
        db,
        actor: currentUser!,
        targetUserId: visibilityForUser!.id,
        productionId: input.productionId,
        accessLevel: input.accessLevel,
      })
    },
    onSuccess: async () => {
      if (visibilityForUser) await invalidateVisibilityQueries(visibilityForUser.id)
    },
  })

  const revokeProjectMutation = useMutation({
    mutationFn: async (productionId: string) => {
      const db = await getDb()
      return revokeUserProjectAccessAsAdmin({
        db,
        actor: currentUser!,
        targetUserId: visibilityForUser!.id,
        productionId,
      })
    },
    onSuccess: async () => {
      if (visibilityForUser) await invalidateVisibilityQueries(visibilityForUser.id)
    },
  })

  const users = usersQuery.data ?? []
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.disabled_at == null && b.disabled_at != null) return -1
        if (a.disabled_at != null && b.disabled_at == null) return 1
        return a.username.localeCompare(b.username)
      }),
    [users]
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create user
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Manage roles, toggle accounts§, reset passwords, and access permissions per project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {usersQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading users…</p>
          )}
          {usersQuery.error instanceof Error && (
            <p className="text-sm text-destructive">{usersQuery.error.message}</p>
          )}
          {!usersQuery.isLoading && !usersQuery.error && sortedUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">No users found.</p>
          )}
          {sortedUsers.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[340px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((user) => {
                    const isDisabled = user.disabled_at != null
                    return (
                      <TableRow key={user.id}>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isDisabled ? 'secondary' : 'default'}>
                            {isDisabled ? 'disabled' : 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(user.created_at)}</TableCell>
                        <TableCell>{formatDate(user.updated_at)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setVisibilityForUser(user)}
                              aria-label={`Project visibility ${user.username}`}
                            >
                              Project visibility
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setRoleOpenFor(user)}
                              aria-label={`Change role ${user.username}`}
                            >
                              Change role
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setResetOpenFor(user)}
                              aria-label={`Reset password ${user.username}`}
                            >
                              Reset password
                            </Button>
                            {isDisabled ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  enableMutation.mutate(user.id)
                                }}
                                aria-label={`Enable ${user.username}`}
                              >
                                Enable
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  disableMutation.reset()
                                  setDisableConfirmUser(user)
                                }}
                                aria-label={`Disable ${user.username}`}
                              >
                                Disable
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {(disableMutation.error instanceof Error ||
            enableMutation.error instanceof Error ||
            roleMutation.error instanceof Error ||
            resetPasswordMutation.error instanceof Error ||
            createMutation.error instanceof Error ||
            grantProjectMutation.error instanceof Error ||
            updateProjectAccessMutation.error instanceof Error ||
            revokeProjectMutation.error instanceof Error) && (
            <p className="text-sm text-destructive">
              {(
                disableMutation.error ??
                enableMutation.error ??
                roleMutation.error ??
                resetPasswordMutation.error ??
                createMutation.error ??
                grantProjectMutation.error ??
                updateProjectAccessMutation.error ??
                revokeProjectMutation.error
              ) instanceof Error
                ? (
                    disableMutation.error ??
                    enableMutation.error ??
                    roleMutation.error ??
                    resetPasswordMutation.error ??
                    createMutation.error ??
                    grantProjectMutation.error ??
                    updateProjectAccessMutation.error ??
                    revokeProjectMutation.error
                  )!.message
                : 'Action failed'}
            </p>
          )}
        </CardContent>
      </Card>

      <DisableUserConfirmDialog
        user={disableConfirmUser}
        open={disableConfirmUser != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !disableMutation.isPending) {
            disableMutation.reset()
            setDisableConfirmUser(null)
          }
        }}
        onCancel={() => {
          if (!disableMutation.isPending) {
            disableMutation.reset()
            setDisableConfirmUser(null)
          }
        }}
        onConfirm={() => {
          if (disableConfirmUser) disableMutation.mutate(disableConfirmUser.id)
        }}
        isSubmitting={disableMutation.isPending}
        error={disableMutation.error instanceof Error ? disableMutation.error.message : null}
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isSubmitting={createMutation.isPending}
      />

      <ResetPasswordDialog
        user={resetOpenFor}
        onOpenChange={(open) => !open && setResetOpenFor(null)}
        onSubmit={(newPassword) => {
          if (!resetOpenFor) return
          resetPasswordMutation.mutate({
            targetUserId: resetOpenFor.id,
            newPassword,
          })
        }}
        isSubmitting={resetPasswordMutation.isPending}
      />

      <ChangeRoleDialog
        user={roleOpenFor}
        onOpenChange={(open) => !open && setRoleOpenFor(null)}
        onSubmit={(role) => {
          if (!roleOpenFor) return
          roleMutation.mutate({
            targetUserId: roleOpenFor.id,
            role,
          })
        }}
        isSubmitting={roleMutation.isPending}
      />

      <UserProjectVisibilityDialog
        user={visibilityForUser}
        onOpenChange={(open) => !open && setVisibilityForUser(null)}
        visibilityRows={userVisibilityQuery.data ?? []}
        visibilityLoading={userVisibilityQuery.isLoading}
        visibilityError={userVisibilityQuery.error instanceof Error ? userVisibilityQuery.error.message : null}
        productions={productionsBriefQuery.data ?? []}
        productionsLoading={productionsBriefQuery.isLoading}
        grantProjectMutation={grantProjectMutation}
        updateProjectAccessMutation={updateProjectAccessMutation}
        revokeProjectMutation={revokeProjectMutation}
      />
    </div>
  )
}

type UserProjectVisibilityDialogProps = {
  user: ManagedUser | null
  onOpenChange: (open: boolean) => void
  visibilityRows: UserProjectVisibilityRow[]
  visibilityLoading: boolean
  visibilityError: string | null
  productions: ProductionBriefForAdmin[]
  productionsLoading: boolean
  grantProjectMutation: UseMutationResult<unknown, Error, { productionId: string; accessLevel: ProjectAccessLevel }, unknown>
  updateProjectAccessMutation: UseMutationResult<unknown, Error, { productionId: string; accessLevel: ProjectAccessLevel }, unknown>
  revokeProjectMutation: UseMutationResult<unknown, Error, string, unknown>
}

function UserProjectVisibilityDialog({
  user,
  onOpenChange,
  visibilityRows,
  visibilityLoading,
  visibilityError,
  productions,
  productionsLoading,
  grantProjectMutation,
  updateProjectAccessMutation,
  revokeProjectMutation,
}: UserProjectVisibilityDialogProps) {
  const open = user != null
  const [addProductionId, setAddProductionId] = useState('')
  const [addAccessLevel, setAddAccessLevel] = useState<ProjectAccessLevel>('viewer')
  const [revokeConfirm, setRevokeConfirm] = useState<{ productionId: string; productionName: string } | null>(null)

  useEffect(() => {
    if (!user) {
      setAddProductionId('')
      setAddAccessLevel('viewer')
      return
    }
    setAddProductionId('')
    setAddAccessLevel('viewer')
  }, [user])

  const assignedIds = useMemo(() => new Set(visibilityRows.map((r) => r.production_id)), [visibilityRows])
  useEffect(() => {
    if (addProductionId && assignedIds.has(addProductionId)) setAddProductionId('')
  }, [addProductionId, assignedIds])
  const unassignedProductions = useMemo(
    () => productions.filter((p) => !assignedIds.has(p.id)),
    [productions, assignedIds]
  )

  const isDisabledUser = user?.disabled_at != null

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" key={user?.id ?? 'none'}>
        <DialogHeader>
          <DialogTitle>Project visibility</DialogTitle>
          <DialogDescription>
            Grant or change per-project access for <strong>{user?.username}</strong>. Instance admins always see all
            projects; memberships control access for non-admin users.
          </DialogDescription>
        </DialogHeader>

        {visibilityError && <p className="text-sm text-destructive">{visibilityError}</p>}

        {visibilityLoading && <p className="text-sm text-muted-foreground">Loading assignments…</p>}

        {!visibilityLoading && visibilityRows.length === 0 && !visibilityError && (
          <p className="text-sm text-muted-foreground">No project memberships yet.</p>
        )}

        {visibilityRows.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibilityRows.map((row) => {
                  const prodMeta = productions.find((p) => p.id === row.production_id)
                  const archived = prodMeta?.archived_at != null
                  return (
                    <TableRow key={row.membership_id}>
                      <TableCell>
                        <span className="font-medium">{row.production_name}</span>
                        {archived && (
                          <Badge variant="secondary" className="ml-2">
                            archived
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.access_level}
                          onValueChange={(value) => {
                            updateProjectAccessMutation.mutate({
                              productionId: row.production_id,
                              accessLevel: value as ProjectAccessLevel,
                            })
                          }}
                          disabled={isDisabledUser || updateProjectAccessMutation.isPending}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">viewer</SelectItem>
                            <SelectItem value="editor">editor</SelectItem>
                            <SelectItem value="administrator">administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={revokeProjectMutation.isPending}
                          onClick={() =>
                            setRevokeConfirm({
                              productionId: row.production_id,
                              productionName: row.production_name,
                            })
                          }
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">Add project access</h3>
          {isDisabledUser ? (
            <p className="text-sm text-muted-foreground">Enable this user before granting new project access.</p>
          ) : (
            <>
              {productionsLoading && <p className="text-xs text-muted-foreground">Loading projects…</p>}
              {!productionsLoading && unassignedProductions.length === 0 && (
                <p className="text-xs text-muted-foreground">All non-deleted projects already have a membership.</p>
              )}
              {!productionsLoading && unassignedProductions.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="admin-visibility-project">Project</Label>
                    <Select value={addProductionId} onValueChange={setAddProductionId}>
                      <SelectTrigger id="admin-visibility-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {unassignedProductions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.archived_at != null ? ' (archived)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="admin-visibility-level">Access level</Label>
                    <Select
                      value={addAccessLevel}
                      onValueChange={(v) => setAddAccessLevel(v as ProjectAccessLevel)}
                    >
                      <SelectTrigger id="admin-visibility-level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">viewer</SelectItem>
                        <SelectItem value="editor">editor</SelectItem>
                        <SelectItem value="administrator">administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <Button
                type="button"
                disabled={
                  !addProductionId || grantProjectMutation.isPending || isDisabledUser || unassignedProductions.length === 0
                }
                onClick={() =>
                  grantProjectMutation.mutate({
                    productionId: addProductionId,
                    accessLevel: addAccessLevel,
                  })
                }
              >
                {grantProjectMutation.isPending ? 'Adding…' : 'Add access'}
              </Button>
            </>
          )}
        </div>

        {(grantProjectMutation.error instanceof Error ||
          updateProjectAccessMutation.error instanceof Error ||
          revokeProjectMutation.error instanceof Error) && (
          <p className="text-sm text-destructive">
            {(grantProjectMutation.error ??
              updateProjectAccessMutation.error ??
              revokeProjectMutation.error) instanceof Error
              ? (grantProjectMutation.error ?? updateProjectAccessMutation.error ?? revokeProjectMutation.error)!.message
              : 'Action failed'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={revokeConfirm != null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !revokeProjectMutation.isPending) {
          revokeProjectMutation.reset()
          setRevokeConfirm(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!revokeProjectMutation.isPending}>
        <DialogHeader>
          <DialogTitle>Remove project access?</DialogTitle>
          <DialogDescription>
            Remove access for <strong>{user?.username}</strong> to <strong>{revokeConfirm?.productionName}</strong>.
            They will no longer see that project until access is granted again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={revokeProjectMutation.isPending}
            onClick={() => {
              revokeProjectMutation.reset()
              setRevokeConfirm(null)
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={revokeProjectMutation.isPending}
            onClick={() => {
              if (!revokeConfirm) return
              revokeProjectMutation.mutate(revokeConfirm.productionId, {
                onSuccess: () => setRevokeConfirm(null),
              })
            }}
          >
            {revokeProjectMutation.isPending ? 'Removing…' : 'Remove access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function DisableUserConfirmDialog({
  user,
  open,
  onOpenChange,
  onCancel,
  onConfirm,
  isSubmitting,
  error,
}: {
  user: ManagedUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
  isSubmitting: boolean
  error: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Disable user?</DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Disable <strong>{user.username}</strong>? They will not be able to sign in until an admin enables the
                account again. Active sessions for this user will be revoked.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Disabling…' : 'Disable user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: { username: string; password: string; role: InstanceRole }) => void
  isSubmitting: boolean
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<InstanceRole>('user')
  const canSubmit = username.trim().length > 0 && password.length >= 8
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          setUsername('')
          setPassword('')
          setRole('user')
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>Create a new instance user with a temporary password.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-user-username">Username</Label>
            <Input
              id="new-user-username"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-user-password">Temporary password</Label>
            <Input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-user-role">Instance role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as InstanceRole)}>
              <SelectTrigger id="new-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || isSubmitting}
            onClick={() => onSubmit({ username: username.trim(), password, role })}
          >
            {isSubmitting ? 'Creating…' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  user: ManagedUser | null
  onOpenChange: (open: boolean) => void
  onSubmit: (newPassword: string) => void
  isSubmitting: boolean
}) {
  const [password, setPassword] = useState('')
  const open = user != null
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) setPassword('')
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new temporary password and revoke active sessions.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Set a temporary password for <strong>{user?.username}</strong>. Existing sessions are revoked.
        </p>
        <div className="space-y-1">
          <Label htmlFor="reset-password-input">New temporary password</Label>
          <Input
            id="reset-password-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button disabled={password.length < 8 || isSubmitting} onClick={() => onSubmit(password)}>
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChangeRoleDialog({
  user,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  user: ManagedUser | null
  onOpenChange: (open: boolean) => void
  onSubmit: (role: InstanceRole) => void
  isSubmitting: boolean
}) {
  const [role, setRole] = useState<InstanceRole>('user')
  const open = user != null
  useEffect(() => {
    if (user) setRole(user.role)
  }, [user])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" key={user?.id ?? 'none'}>
        <DialogHeader>
          <DialogTitle>Change instance role</DialogTitle>
          <DialogDescription>Promote or demote the target user between user and admin.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Update role for <strong>{user?.username}</strong>.
        </p>
        <div className="space-y-1">
          <Label htmlFor="change-role-select">Role</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as InstanceRole)}
          >
            <SelectTrigger id="change-role-select">
              <SelectValue placeholder={user?.role ?? 'user'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            disabled={!user || isSubmitting}
            onClick={() => onSubmit(role)}
          >
            {isSubmitting ? 'Saving…' : 'Save role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
