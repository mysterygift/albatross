/**
 * Call-sheet crew requirements: read-only service that derives booked crew for a shoot day,
 * grouped by canonical crew department (C1), with HOD first and canonical role order.
 *
 * Rules:
 * - Crew on the call sheet = has a booking for the selected shoot day AND is crew (is_cast !== 1).
 * - Grouping uses canonical crew departments from C1 only (not task-mapped labels).
 * - Department order: CREW_DEPARTMENTS order; "Other" for non-canonical department at end.
 * - Within department: HOD first, then canonical role order, then name fallback.
 * - is_hod is derived from department + role_name via C1 hierarchy (not stored).
 */

import type { Person } from '@/lib/db/types'
import type { Booking } from '@/lib/db/types'
import {
  getCrewDepartmentNames,
  getCrewRolesForDepartment,
  getHodRoleForDepartment,
  type CrewDepartmentName,
} from '@/lib/people/crewDepartments'

const CANONICAL_NAMES = getCrewDepartmentNames()
const CANONICAL_SET = new Set<string>(CANONICAL_NAMES)

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

function getCanonicalDepartment(person: Person): CrewDepartmentName | 'Other' {
  const d = person.department?.trim()
  if (!d || !CANONICAL_SET.has(d)) return 'Other'
  return d as CrewDepartmentName
}

function isHod(person: Person, department: CrewDepartmentName): boolean {
  const hodRole = getHodRoleForDepartment(department)
  return (person.role_name?.trim() ?? '') === hodRole
}

function roleOrderIndex(person: Person, department: CrewDepartmentName): number {
  const roles = getCrewRolesForDepartment(department)
  const role = person.role_name?.trim() ?? ''
  const idx = roles.indexOf(role)
  return idx === -1 ? 999 : idx
}

function personToCrewRow(p: Person, department: CrewDepartmentName | 'Other', isHodRow: boolean): CallSheetCrewRow {
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
 * Returns booked crew for the shoot day, grouped by canonical crew department,
 * with HOD first and canonical role order within each department.
 * Uses C1 hierarchy only; does not use task department mapping.
 */
export function getCallSheetCrewRequirements(
  bookings: Pick<Booking, 'person_id'>[],
  crew: Person[]
): CallSheetCrewGroup[] {
  const bookedPersonIds = new Set(bookings.map((b) => b.person_id))
  const bookedCrew = crew.filter((p) => bookedPersonIds.has(p.id))
  if (bookedCrew.length === 0) return []

  const byDepartment = new Map<string | CrewDepartmentName, Person[]>()
  for (const p of bookedCrew) {
    const dept = getCanonicalDepartment(p)
    const list = byDepartment.get(dept) ?? []
    list.push(p)
    byDepartment.set(dept, list)
  }

  const departmentOrder: (CrewDepartmentName | 'Other')[] = [...CANONICAL_NAMES, 'Other']
  const groups: CallSheetCrewGroup[] = []

  for (const dept of departmentOrder) {
    const people = byDepartment.get(dept)
    if (!people || people.length === 0) continue

    const isCanonical = dept !== 'Other'
    const sorted = [...people].sort((a, b) => {
      if (isCanonical) {
        const hodA = isHod(a, dept as CrewDepartmentName) ? -1 : 0
        const hodB = isHod(b, dept as CrewDepartmentName) ? -1 : 0
        if (hodA !== hodB) return hodA - hodB
        const roleA = roleOrderIndex(a, dept as CrewDepartmentName)
        const roleB = roleOrderIndex(b, dept as CrewDepartmentName)
        if (roleA !== roleB) return roleA - roleB
      }
      return (a.name ?? '').localeCompare(b.name ?? '')
    })

    const rows: CallSheetCrewRow[] = sorted.map((p) =>
      personToCrewRow(p, dept, isCanonical && isHod(p, dept as CrewDepartmentName))
    )
    groups.push({ department: dept, rows })
  }

  return groups
}
