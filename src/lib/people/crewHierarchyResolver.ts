/**
 * Runtime resolver for production-specific crew hierarchy.
 *
 * Fallback order (documented for safe behaviour):
 * 1. Valid DB config for the production (when productionId is provided)
 * 2. Built-in default hierarchy (from defaultCrewHierarchy)
 *
 * Use when migrating consumers from the global crewDepartments module.
 * This module does NOT mutate the DB on read; it is pure read + fallback.
 *
 * H1B: Resolver layer only. No consumer migration yet (Crew Manager, CrewForm,
 * CrewSetupWizard, CrewDetailPage, task integration, call sheets still use
 * crewDepartments.ts).
 */

import { getCrewHierarchyConfigByProduction } from '@/lib/db/repositories/crewHierarchyConfig'
import { buildDefaultCrewHierarchyConfig } from './defaultCrewHierarchy'
import type {
  CrewDepartmentConfig,
  CrewHierarchyConfig,
  CrewRoleConfig,
} from './crewHierarchyTypes'

// ---------------------------------------------------------------------------
// Validation / normalization (fail-safe: invalid stored config → fallback)
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes a stored config before use.
 * Returns the config if valid (with stable sort order); returns null if
 * invalid so the resolver can fall back to the built-in default.
 * Does not throw; malformed stored config is handled by fallback.
 */
export function validateAndNormalizeCrewHierarchyConfig(
  raw: unknown
): CrewHierarchyConfig | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.version !== 'number') return null
  if (!Array.isArray(o.departments)) return null

  const departments: CrewDepartmentConfig[] = []
  for (const d of o.departments) {
    if (d == null || typeof d !== 'object') return null
    const dept = d as Record<string, unknown>
    const id = typeof dept.id === 'string' ? dept.id : ''
    const name = typeof dept.name === 'string' ? dept.name.trim() : ''
    if (!name) return null
    const sort_order = typeof dept.sort_order === 'number' ? dept.sort_order : departments.length
    const hod_role_name =
      dept.hod_role_name == null || typeof dept.hod_role_name === 'string'
        ? (dept.hod_role_name as string | null)
        : null
    if (!Array.isArray(dept.roles)) return null

    const roles: CrewRoleConfig[] = []
    for (let i = 0; i < dept.roles.length; i++) {
      const r = dept.roles[i]
      if (r == null || typeof r !== 'object') return null
      const role = r as Record<string, unknown>
      const roleId = typeof role.id === 'string' ? role.id : ''
      const roleName = typeof role.name === 'string' ? role.name.trim() : ''
      if (!roleName) return null
      const roleSort = typeof role.sort_order === 'number' ? role.sort_order : i
      roles.push({ id: roleId, name: roleName, sort_order: roleSort })
    }
    roles.sort((a, b) => a.sort_order - b.sort_order)

    let task_department_labels: string[] | undefined
    if (Array.isArray(dept.task_department_labels)) {
      task_department_labels = dept.task_department_labels.filter(
        (l): l is string => typeof l === 'string'
      )
    }

    departments.push({
      id,
      name,
      sort_order,
      hod_role_name,
      task_department_labels,
      roles,
    })
  }
  departments.sort((a, b) => a.sort_order - b.sort_order)

  return {
    version: (o.version as number),
    departments,
  }
}

// ---------------------------------------------------------------------------
// Resolver API (read + fallback; no DB writes)
// ---------------------------------------------------------------------------

/**
 * Returns the built-in default hierarchy (canonical departments/roles/HOD/task mapping).
 * Use when no productionId or when DB config is missing/invalid.
 * Exported so pages can use it as fallback while the effective hierarchy query is loading.
 */
export function getDefaultCrewHierarchyConfig(): CrewHierarchyConfig {
  return buildDefaultCrewHierarchyConfig()
}

/**
 * Returns the effective crew hierarchy for the given production.
 * Fallback order: (1) valid DB config for productionId, (2) built-in default.
 * Invalid or missing DB config falls back to default; does not throw.
 */
export async function getEffectiveCrewHierarchy(
  productionId: string
): Promise<CrewHierarchyConfig> {
  try {
    const stored = await getCrewHierarchyConfigByProduction(productionId)
    if (!stored) return getDefaultCrewHierarchyConfig()
    const validated = validateAndNormalizeCrewHierarchyConfig(stored)
    if (!validated) return getDefaultCrewHierarchyConfig()
    return validated
  } catch {
    // Malformed JSON or DB error: fail safe to built-in default.
    return getDefaultCrewHierarchyConfig()
  }
}

/**
 * Returns the effective crew hierarchy, or the built-in default when
 * productionId is missing, null, or undefined.
 */
export async function getEffectiveCrewHierarchyOrDefault(
  productionId: string | null | undefined
): Promise<CrewHierarchyConfig> {
  if (productionId == null || productionId.trim() === '') {
    return getDefaultCrewHierarchyConfig()
  }
  return getEffectiveCrewHierarchy(productionId)
}

// ---------------------------------------------------------------------------
// Resolved helpers (operate on a resolved hierarchy object; no global refs)
// ---------------------------------------------------------------------------

/**
 * Department names in resolved order (by sort_order).
 */
export function getResolvedCrewDepartmentNames(hierarchy: CrewHierarchyConfig): string[] {
  return [...hierarchy.departments]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((d) => d.name)
}

/**
 * Ordered role names for the given department (by name match).
 * Returns empty array if department not found.
 */
export function getResolvedCrewRolesForDepartment(
  hierarchy: CrewHierarchyConfig,
  departmentName: string
): string[] {
  const name = departmentName?.trim()
  if (!name) return []
  const dept = hierarchy.departments.find(
    (d) => d.name.toLowerCase() === name.toLowerCase()
  )
  if (!dept || !dept.roles) return []
  return [...dept.roles]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.name)
}

/**
 * Head-of-department role name for the given department, or '' if none.
 */
export function getResolvedHodRoleForDepartment(
  hierarchy: CrewHierarchyConfig,
  departmentName: string
): string {
  const name = departmentName?.trim()
  if (!name) return ''
  const dept = hierarchy.departments.find(
    (d) => d.name.toLowerCase() === name.toLowerCase()
  )
  return dept?.hod_role_name ?? ''
}

/**
 * True if roleName is the HOD role for the given department in this hierarchy.
 */
export function isResolvedHodRole(
  hierarchy: CrewHierarchyConfig,
  departmentName: string,
  roleName: string
): boolean {
  return getResolvedHodRoleForDepartment(hierarchy, departmentName) === roleName
}

/**
 * Task department labels for the given crew department (for task integration).
 * Returns empty array if department not found or has no mapping.
 */
export function getResolvedTaskDepartmentsForCrewDepartment(
  hierarchy: CrewHierarchyConfig,
  departmentName: string
): string[] {
  const name = departmentName?.trim()
  if (!name) return []
  const dept = hierarchy.departments.find(
    (d) => d.name.toLowerCase() === name.toLowerCase()
  )
  if (!dept?.task_department_labels) return []
  return [...dept.task_department_labels]
}

/**
 * Returns the hierarchy's department name if the given string matches a department (case-insensitive), else null.
 * Use for "canonical" department display and validation (e.g. is this person's department in the hierarchy?).
 */
export function getResolvedCanonicalDepartmentName(
  hierarchy: CrewHierarchyConfig,
  department: string | null | undefined
): string | null {
  const d = department?.trim()
  if (!d) return null
  const found = hierarchy.departments.find(
    (dept) => dept.name.toLowerCase() === d.toLowerCase()
  )
  return found ? found.name : null
}
