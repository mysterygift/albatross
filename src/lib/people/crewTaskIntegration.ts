/**
 * Read-only task integration for Crew Manager.
 * Connects crew departments to task assigned_department and surfaces HOD responsibility.
 * No task mutations or schema changes; this layer is for summaries and visibility only.
 *
 * Uses the effective production hierarchy (resolved); callers pass hierarchy from
 * getEffectiveCrewHierarchy / getEffectiveCrewHierarchyOrDefault.
 */

import type { Person } from '@/lib/db/types'
import type { ProductionTask } from '@/lib/db/types'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import {
  getResolvedCrewDepartmentNames,
  getResolvedHodRoleForDepartment,
  getResolvedTaskDepartmentsForCrewDepartment,
} from '@/lib/people/crewHierarchyResolver'

function getResolvedDepartmentSet(hierarchy: CrewHierarchyConfig): Set<string> {
  return new Set(getResolvedCrewDepartmentNames(hierarchy))
}

function getCanonicalDepartment(
  hierarchy: CrewHierarchyConfig,
  person: Person
): string | null {
  const d = person.department?.trim()
  if (!d) return null
  const set = getResolvedDepartmentSet(hierarchy)
  return set.has(d) ? d : null
}

function isPersonHodForDept(
  hierarchy: CrewHierarchyConfig,
  person: Person,
  department: string
): boolean {
  const dept = getCanonicalDepartment(hierarchy, person)
  if (dept !== department) return false
  return (
    (person.role_name?.trim() ?? '') ===
    getResolvedHodRoleForDepartment(hierarchy, department)
  )
}

export type TaskSummary = {
  total: number
  incomplete: number
  complete: number
  overdue: number
}

/** Today's date in YYYY-MM-DD for comparison with task due_date. */
function todayLocal(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

/**
 * Returns tasks whose assigned_department matches any of the task department labels
 * for the given crew department in the hierarchy.
 */
export function getTasksForCrewDepartment(
  hierarchy: CrewHierarchyConfig,
  tasks: ProductionTask[],
  crewDepartment: string
): ProductionTask[] {
  const taskDepts = getResolvedTaskDepartmentsForCrewDepartment(
    hierarchy,
    crewDepartment
  )
  if (taskDepts.length === 0) return []
  const set = new Set(taskDepts)
  return tasks.filter(
    (t) => t.assigned_department != null && set.has(t.assigned_department)
  )
}

/**
 * Returns a task summary for the given crew department (total, incomplete, complete, overdue).
 */
export function getTaskSummaryForCrewDepartment(
  hierarchy: CrewHierarchyConfig,
  tasks: ProductionTask[],
  crewDepartment: string
): TaskSummary {
  const deptTasks = getTasksForCrewDepartment(
    hierarchy,
    tasks,
    crewDepartment
  )
  const today = todayLocal()
  let incomplete = 0
  let complete = 0
  let overdue = 0
  for (const t of deptTasks) {
    if (t.is_complete) complete++
    else incomplete++
    if (t.due_date != null && t.due_date < today && !t.is_complete) overdue++
  }
  return {
    total: deptTasks.length,
    incomplete,
    complete,
    overdue,
  }
}

export type HodResponsibilityRow = {
  crewDepartment: string
  taskSummary: TaskSummary
  hasHod: boolean
  hodPerson: Person | null
}

/**
 * Returns per-department HOD responsibility summary: task counts and whether an HOD is assigned.
 * Department order and HOD derivation come from the resolved hierarchy.
 */
export function getHodResponsibilitySummary(
  hierarchy: CrewHierarchyConfig,
  crew: Person[],
  tasks: ProductionTask[]
): HodResponsibilityRow[] {
  const departments = getResolvedCrewDepartmentNames(hierarchy)
  return departments.map((crewDepartment) => {
    const taskSummary = getTaskSummaryForCrewDepartment(
      hierarchy,
      tasks,
      crewDepartment
    )
    const hodPerson =
      crew.find((p) => isPersonHodForDept(hierarchy, p, crewDepartment)) ??
      null
    return {
      crewDepartment,
      taskSummary,
      hasHod: hodPerson != null,
      hodPerson,
    }
  })
}

/**
 * Returns departments that have at least one incomplete task but no HOD in the crew list.
 */
export function getDepartmentsWithTasksButNoHod(
  hierarchy: CrewHierarchyConfig,
  crew: Person[],
  tasks: ProductionTask[]
): HodResponsibilityRow[] {
  return getHodResponsibilitySummary(hierarchy, crew, tasks).filter(
    (row) => row.taskSummary.incomplete > 0 && !row.hasHod
  )
}
