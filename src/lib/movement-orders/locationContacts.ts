import type { Person } from '@/lib/db/types'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import { getResolvedCanonicalDepartmentName } from '@/lib/people/crewHierarchyResolver'
import type { MovementOrderLocationContact } from '@/lib/movement-orders/types'

export function getMovementOrderLocationContacts(
  crew: Person[],
  hierarchy: CrewHierarchyConfig
): MovementOrderLocationContact[] {
  return crew
    .filter((person) => {
      const canonicalDepartment = getResolvedCanonicalDepartmentName(
        hierarchy,
        person.department
      )
      return canonicalDepartment === 'Locations'
    })
    .map((person) => ({
      name: person.name,
      role: person.role_name?.trim() || null,
      phone: person.phone?.trim() || null,
      email: person.email?.trim() || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
