/**
 * Call-sheet crew requirements: read-only service that derives booked crew for a shoot day,
 * grouped by crew department from the effective hierarchy, with HOD first and role order.
 *
 * Rules:
 * - Crew on the call sheet = has a booking for the selected shoot day AND is crew (is_cast !== 1).
 * - Grouping uses department names from the resolved hierarchy; "Other" for non-canonical department at end.
 * - Department order: resolved hierarchy order; "Other" at end.
 * - Within department: HOD first, then role order from hierarchy, then name fallback.
 * - is_hod is derived from department + role_name via the resolved hierarchy (not stored).
 */

import type { Person } from '@/lib/db/types'
import type { Booking } from '@/lib/db/types'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import {
  getResolvedCrewDepartmentNames,
  getResolvedCrewRolesForDepartment,
  getResolvedHodRoleForDepartment,
} from '@/lib/people/crewHierarchyResolver'

export type CallSheetCrewRow = {
  person_id: string
  name: string
  department: string | null
  role_name: string | null
  phone: string | null
  email: string | null
  is_hod: boolean
}

export type CallSheetCrewGroup = {
  department: string
  rows: CallSheetCrewRow[]
}

function getResolvedDepartmentSet(hierarchy: CrewHierarchyConfig): Set<string> {
  return new Set(getResolvedCrewDepartmentNames(hierarchy))
}

function getCanonicalDepartment(
  hierarchy: CrewHierarchyConfig,
  person: Person
): string | 'Other' {
  const d = person.department?.trim()
  if (!d) return 'Other'
  const set = getResolvedDepartmentSet(hierarchy)
  return set.has(d) ? d : 'Other'
}

function isHod(
  hierarchy: CrewHierarchyConfig,
  person: Person,
  department: string
): boolean {
  const hodRole = getResolvedHodRoleForDepartment(hierarchy, department)
  return (person.role_name?.trim() ?? '') === hodRole
}

function roleOrderIndex(
  hierarchy: CrewHierarchyConfig,
  person: Person,
  department: string
): number {
  const roles = getResolvedCrewRolesForDepartment(hierarchy, department)
  const role = person.role_name?.trim() ?? ''
  const idx = roles.indexOf(role)
  return idx === -1 ? 999 : idx
}

function personToCrewRow(
  p: Person,
  department: string | 'Other',
  isHodRow: boolean
): CallSheetCrewRow {
  return {
    person_id: p.id,
    name: p.name,
    department: p.department ?? null,
    role_name: p.role_name ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    is_hod: isHodRow,
  }
}

/**
 * Returns booked crew for the shoot day, grouped by crew department from the hierarchy,
 * with HOD first and role order within each department.
 */
export function getCallSheetCrewRequirements(
  hierarchy: CrewHierarchyConfig,
  bookings: Pick<Booking, 'person_id'>[],
  crew: Person[]
): CallSheetCrewGroup[] {
  const bookedPersonIds = new Set(bookings.map((b) => b.person_id))
  const bookedCrew = crew.filter((p) => bookedPersonIds.has(p.id))
  if (bookedCrew.length === 0) return []

  const byDepartment = new Map<string, Person[]>()
  for (const p of bookedCrew) {
    const dept = getCanonicalDepartment(hierarchy, p)
    const list = byDepartment.get(dept) ?? []
    list.push(p)
    byDepartment.set(dept, list)
  }

  const departmentOrder: string[] = [
    ...getResolvedCrewDepartmentNames(hierarchy),
    'Other',
  ]
  const groups: CallSheetCrewGroup[] = []

  for (const dept of departmentOrder) {
    const people = byDepartment.get(dept)
    if (!people || people.length === 0) continue

    const isCanonical = dept !== 'Other'
    const sorted = [...people].sort((a, b) => {
      if (isCanonical) {
        const hodA = isHod(hierarchy, a, dept) ? -1 : 0
        const hodB = isHod(hierarchy, b, dept) ? -1 : 0
        if (hodA !== hodB) return hodA - hodB
        const roleA = roleOrderIndex(hierarchy, a, dept)
        const roleB = roleOrderIndex(hierarchy, b, dept)
        if (roleA !== roleB) return roleA - roleB
      }
      return (a.name ?? '').localeCompare(b.name ?? '')
    })

    const rows: CallSheetCrewRow[] = sorted.map((p) =>
      personToCrewRow(
        p,
        dept,
        isCanonical && isHod(hierarchy, p, dept)
      )
    )
    groups.push({ department: dept, rows })
  }

  return groups
}
