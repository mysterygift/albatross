export const PROJECT_ACCESS_LEVELS = ['viewer', 'editor', 'administrator'] as const
export type ProjectAccessLevel = (typeof PROJECT_ACCESS_LEVELS)[number]

const PROJECT_ACCESS_WEIGHT: Record<ProjectAccessLevel, number> = {
  viewer: 1,
  editor: 2,
  administrator: 3,
}

export function isValidProjectAccessLevel(value: string): value is ProjectAccessLevel {
  return (PROJECT_ACCESS_LEVELS as readonly string[]).includes(value)
}

export function hasProjectAccessLevel(
  accessLevel: ProjectAccessLevel | null | undefined,
  minimum: ProjectAccessLevel
): boolean {
  if (!accessLevel) return false
  return PROJECT_ACCESS_WEIGHT[accessLevel] >= PROJECT_ACCESS_WEIGHT[minimum]
}

export function canViewProject(accessLevel: ProjectAccessLevel | null | undefined, isInstanceAdmin: boolean): boolean {
  if (isInstanceAdmin) return true
  return hasProjectAccessLevel(accessLevel, 'viewer')
}

export function canEditProject(accessLevel: ProjectAccessLevel | null | undefined, isInstanceAdmin: boolean): boolean {
  if (isInstanceAdmin) return true
  return hasProjectAccessLevel(accessLevel, 'editor')
}

export function canAdminProject(
  accessLevel: ProjectAccessLevel | null | undefined,
  isInstanceAdmin: boolean
): boolean {
  if (isInstanceAdmin) return true
  return hasProjectAccessLevel(accessLevel, 'administrator')
}

export function canManageProjectAccess(
  accessLevel: ProjectAccessLevel | null | undefined,
  isInstanceAdmin: boolean
): boolean {
  return canAdminProject(accessLevel, isInstanceAdmin)
}
