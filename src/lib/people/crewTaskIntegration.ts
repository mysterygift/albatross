/**
 * Read-only task integration for Crew Manager.
 * Connects crew departments to task assigned_department and surfaces HOD responsibility.
 * No task mutations or schema changes; this layer is for summaries and visibility only.
 */

import type { Person } from '@/lib/db/types'
import type { ProductionTask } from '@/lib/db/types'
import {
  getCrewDepartmentNames,
  getHodRoleForDepartment,
  getTaskDepartmentsForCrewDepartment,
  type CrewDepartmentName,
} from '@/lib/people/crewDepartments'

const CANONICAL_SET = new Set<string>(getCrewDepartmentNames())

function getCanonicalDepartment(person: Person): CrewDepartmentName | null {
  const d = person.department?.trim()
  if (!d) return null
  return CANONICAL_SET.has(d) ? (d as CrewDepartmentName) : null
}

function isPersonHodForDept(person: Person, department: CrewDepartmentName): boolean {
  const dept = getCanonicalDepartment(person)
  if (dept !== department) return false
  return (person.role_name?.trim() ?? '') === getHodRoleForDepartment(department)
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
 * for the given crew department.
 */
export function getTasksForCrewDepartment(
  tasks: ProductionTask[],
  crewDepartment: CrewDepartmentName
): ProductionTask[] {
  const taskDepts = getTaskDepartmentsForCrewDepartment(crewDepartment)
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
  tasks: ProductionTask[],
  crewDepartment: CrewDepartmentName
): TaskSummary {
  const deptTasks = getTasksForCrewDepartment(tasks, crewDepartment)
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
  crewDepartment: CrewDepartmentName
  taskSummary: TaskSummary
  hasHod: boolean
  hodPerson: Person | null
}

/**
 * Returns per-department HOD responsibility summary: task counts and whether an HOD is assigned.
 */
export function getHodResponsibilitySummary(
  crew: Person[],
  tasks: ProductionTask[]
): HodResponsibilityRow[] {
  const departments = getCrewDepartmentNames()
  return departments.map((crewDepartment) => {
    const taskSummary = getTaskSummaryForCrewDepartment(tasks, crewDepartment)
    const hodPerson =
      crew.find((p) => isPersonHodForDept(p, crewDepartment)) ?? null
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
  crew: Person[],
  tasks: ProductionTask[]
): HodResponsibilityRow[] {
  return getHodResponsibilitySummary(crew, tasks).filter(
    (row) => row.taskSummary.incomplete > 0 && !row.hasHod
  )
}
