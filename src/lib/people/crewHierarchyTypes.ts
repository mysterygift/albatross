/**
 * Types for production-scoped crew hierarchy config stored in the DB.
 * Used for future Settings editing, resolver usage, and JSON serialization.
 * Does not replace existing C1 hierarchy types in crewDepartments.ts.
 */

export interface CrewRoleConfig {
  id: string
  name: string
  sort_order: number
}

export interface CrewDepartmentConfig {
  id: string
  name: string
  sort_order: number
  hod_role_name: string | null
  task_department_labels?: string[]
  roles: CrewRoleConfig[]
}

export interface CrewHierarchyConfig {
  version: number
  departments: CrewDepartmentConfig[]
}
