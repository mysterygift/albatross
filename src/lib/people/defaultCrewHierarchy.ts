/**
 * Builds the default crew hierarchy config from the global canonical hierarchy.
 * Used when persisting or resetting production crew hierarchy config; does not
 * change runtime behaviour (consumers still use crewDepartments.ts).
 */

import {
  CREW_DEPARTMENTS,
  CREW_TO_TASK_DEPARTMENT_MAP,
} from './crewDepartments'
import type { CrewDepartmentConfig, CrewHierarchyConfig, CrewRoleConfig } from './crewHierarchyTypes'

const CONFIG_VERSION = 1

function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Serializes the current canonical hierarchy (CREW_DEPARTMENTS and
 * CREW_TO_TASK_DEPARTMENT_MAP) into CrewHierarchyConfig format.
 * Department and role order match the global hierarchy exactly.
 */
export function buildDefaultCrewHierarchyConfig(): CrewHierarchyConfig {
  const departments: CrewDepartmentConfig[] = CREW_DEPARTMENTS.map((def, deptIndex) => {
    const deptId = toSlug(def.name)
    const taskLabels = CREW_TO_TASK_DEPARTMENT_MAP[def.name]
      ? [...CREW_TO_TASK_DEPARTMENT_MAP[def.name]]
      : undefined
    const roles: CrewRoleConfig[] = def.roles.map((roleName, roleIndex) => ({
      id: `${deptId}--${toSlug(roleName)}`,
      name: roleName,
      sort_order: roleIndex,
    }))
    return {
      id: deptId,
      name: def.name,
      sort_order: deptIndex,
      hod_role_name: def.hodRole,
      task_department_labels: taskLabels,
      roles,
    }
  })
  return {
    version: CONFIG_VERSION,
    departments,
  }
}
