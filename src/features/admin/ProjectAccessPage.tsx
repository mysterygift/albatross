import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDb } from '@/lib/db/client'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { useCurrentProduction } from '@/features/productions/context'
import {
  addProjectMemberForActor,
  canManageProjectAccessForActor,
  listAssignableUsersForProjectForActor,
  listProjectMembersForActor,
  removeProjectMemberForActor,
  updateProjectMemberAccessForActor,
} from '@/lib/access/projectAccessService'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

type ProjectAccessLevel = 'viewer' | 'editor' | 'administrator'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function ProjectAccessRoute() {
  const auth = useAuthSession()
  const { currentProductionId } = useCurrentProduction()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedLevel, setSelectedLevel] = useState<ProjectAccessLevel>('viewer')

  if (auth.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading project access…</div>
  if (!auth.authSupported) return <Navigate to="/settings" replace />
  if (!auth.isAuthenticated || !auth.currentUser) return <Navigate to="/" replace />

  const permissionQuery = useQuery({
    queryKey: ['project-access-can-manage', auth.currentUser.id, currentProductionId],
    enabled: Boolean(currentProductionId),
    queryFn: async () => {
      if (!currentProductionId) return false
      const db = await getDb()
      return canManageProjectAccessForActor(db, auth.currentUser!, currentProductionId)
    },
  })

  useEffect(() => {
    if (permissionQuery.data === false) {
      navigate('/settings', { replace: true })
    }
  }, [permissionQuery.data, navigate])

  const membersQuery = useQuery({
    queryKey: ['project-access-members', auth.currentUser.id, currentProductionId],
    enabled: permissionQuery.data === true && Boolean(currentProductionId),
    queryFn: async () => {
      if (!currentProductionId) return []
      const db = await getDb()
      return listProjectMembersForActor({
        db,
        actor: auth.currentUser!,
        productionId: currentProductionId,
      })
    },
  })

  const assignableUsersQuery = useQuery({
    queryKey: ['project-access-assignable-users', auth.currentUser.id, currentProductionId],
    enabled: permissionQuery.data === true && Boolean(currentProductionId),
    queryFn: async () => {
      if (!currentProductionId) return []
      const db = await getDb()
      return listAssignableUsersForProjectForActor({
        db,
        actor: auth.currentUser!,
        productionId: currentProductionId,
      })
    },
  })

  const refetchRelevant = async () => {
    await queryClient.invalidateQueries({ queryKey: ['project-access-members'] })
    await queryClient.invalidateQueries({ queryKey: ['project-access-assignable-users'] })
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
    await queryClient.invalidateQueries({ queryKey: ['project-access-can-manage'] })
  }

  const addMutation = useMutation({
    mutationFn: async (input: { targetUserId: string; accessLevel: ProjectAccessLevel }) => {
      if (!currentProductionId) throw new Error('No project selected')
      const db = await getDb()
      return addProjectMemberForActor({
        db,
        actor: auth.currentUser!,
        productionId: currentProductionId,
        targetUserId: input.targetUserId,
        accessLevel: input.accessLevel,
      })
    },
    onSuccess: async () => {
      setSelectedUserId('')
      setSelectedLevel('viewer')
      await refetchRelevant()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (input: { targetUserId: string; accessLevel: ProjectAccessLevel }) => {
      if (!currentProductionId) throw new Error('No project selected')
      const db = await getDb()
      return updateProjectMemberAccessForActor({
        db,
        actor: auth.currentUser!,
        productionId: currentProductionId,
        targetUserId: input.targetUserId,
        accessLevel: input.accessLevel,
      })
    },
    onSuccess: refetchRelevant,
  })

  const revokeMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!currentProductionId) throw new Error('No project selected')
      const db = await getDb()
      return removeProjectMemberForActor({
        db,
        actor: auth.currentUser!,
        productionId: currentProductionId,
        targetUserId,
      })
    },
    onSuccess: refetchRelevant,
  })

  const assignableUsers = assignableUsersQuery.data ?? []
  const activeAssignableUsers = useMemo(
    () => assignableUsers.filter((user) => user.disabled_at == null),
    [assignableUsers]
  )
  const disabledAssignableUsers = assignableUsers.length - activeAssignableUsers.length

  if (permissionQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Checking project access permissions…</div>
  }

  if (!currentProductionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Access</CardTitle>
          <CardDescription>Select a project first to manage access.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (permissionQuery.error instanceof Error) {
    return <div className="p-4 text-sm text-destructive">{permissionQuery.error.message}</div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Project Access</h1>
        <p className="text-sm text-muted-foreground">
          Manage project membership access levels: viewer, editor, and administrator.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add project member</CardTitle>
          <CardDescription>
            Assign an existing user to this project with an access level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="project-access-user-select">User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="project-access-user-select">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {activeAssignableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-access-level-select">Access level</Label>
              <Select
                value={selectedLevel}
                onValueChange={(value) => setSelectedLevel(value as ProjectAccessLevel)}
              >
                <SelectTrigger id="project-access-level-select">
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
          {disabledAssignableUsers > 0 && (
            <p className="text-xs text-muted-foreground">
              {disabledAssignableUsers} disabled user(s) are excluded from assignment.
            </p>
          )}
          <Button
            onClick={() => addMutation.mutate({ targetUserId: selectedUserId, accessLevel: selectedLevel })}
            disabled={!selectedUserId || addMutation.isPending}
          >
            {addMutation.isPending ? 'Adding…' : 'Add member'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project members</CardTitle>
          <CardDescription>Instance role is global; project access level is per-project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(membersQuery.isLoading || assignableUsersQuery.isLoading) && (
            <p className="text-sm text-muted-foreground">Loading project members…</p>
          )}
          {membersQuery.error instanceof Error && (
            <p className="text-sm text-destructive">{membersQuery.error.message}</p>
          )}
          {addMutation.error instanceof Error && (
            <p className="text-sm text-destructive">{addMutation.error.message}</p>
          )}
          {updateMutation.error instanceof Error && (
            <p className="text-sm text-destructive">{updateMutation.error.message}</p>
          )}
          {revokeMutation.error instanceof Error && (
            <p className="text-sm text-destructive">{revokeMutation.error.message}</p>
          )}
          {(membersQuery.data?.length ?? 0) === 0 && !membersQuery.isLoading && (
            <p className="text-sm text-muted-foreground">No active members.</p>
          )}
          {(membersQuery.data?.length ?? 0) > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Instance role</TableHead>
                    <TableHead>Project access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membersQuery.data?.map((member) => {
                    const disabled = member.user_disabled_at != null
                    return (
                      <TableRow key={member.id}>
                        <TableCell>{member.username}</TableCell>
                        <TableCell>
                          <Badge variant={member.user_role === 'admin' ? 'default' : 'secondary'}>
                            {member.user_role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={member.access_level}
                            onValueChange={(value) => {
                              updateMutation.mutate({
                                targetUserId: member.user_id,
                                accessLevel: value as ProjectAccessLevel,
                              })
                            }}
                            disabled={disabled || updateMutation.isPending}
                          >
                            <SelectTrigger className="w-[160px]">
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
                          <Badge variant={disabled ? 'secondary' : 'default'}>
                            {disabled ? 'disabled' : 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(member.updated_at)}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={revokeMutation.isPending}
                            onClick={() => {
                              if (!window.confirm(`Remove project access for "${member.username}"?`)) return
                              revokeMutation.mutate(member.user_id)
                            }}
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
        </CardContent>
      </Card>
    </div>
  )
}
