/**
 * Canonical crew department hierarchy reference.
 *
 * This module is the single source of truth for:
 * - Crew Manager: role/department dropdowns, HOD assignment and validation
 * - Task department responsibility: map crew departments to PRODUCTION_DEPARTMENTS where labels differ (Lighting → Electrical, Post-Production → Post Production, Finance → Accounts, Art → Art Department)
 * - Call-sheet crew grouping and HOD-first ordering
 *
 * No schema or UI changes in this stage; this is reference-only for future integration.
 */

export interface CrewDepartmentDefinition {
  name: CrewDepartmentName
  hodRole: string
  roles: readonly string[]
}

const CREW_DEPARTMENT_NAMES = [
  'Development',
  'Production',
  'Finance',
  'Locations',
  'Art',
  'Camera',
  'Lighting',
  'Grip',
  'Sound',
  'Post-Production',
] as const

export type CrewDepartmentName = (typeof CREW_DEPARTMENT_NAMES)[number]

/**
 * Canonical crew departments with HOD and ordered roles.
 * Mirrors src/lib/people/crew-departments.md exactly.
 */
export const CREW_DEPARTMENTS: readonly CrewDepartmentDefinition[] = [
  {
    name: 'Development',
    hodRole: 'Producer',
    roles: [
      'Studio Executive',
      'Screenwriter',
      'Script Editor',
      'Producer',
      'Executive Producer',
      'Director',
      'Casting Director',
      'Casting Assistant',
      'Researcher',
    ],
  },
  {
    name: 'Production',
    hodRole: 'Line Producer',
    roles: [
      'Production Assistant',
      'Floor Runner',
      'Production Secretary',
      'Assistant Production Coordinator',
      'Production Coordinator',
      'Production Manager',
      'Assistant Director',
      'Line Producer',
    ],
  },
  {
    name: 'Finance',
    hodRole: 'Production Accountant',
    roles: ['Cashier', 'Production Accountant', 'Finance Controller'],
  },
  {
    name: 'Locations',
    hodRole: 'Locations Manager',
    roles: [
      'Locations Marshall',
      'Locations Trainee',
      'Locations Assistant',
      'Unit Manager',
      'Assistant Locations Manager',
      'Locations Manager',
    ],
  },
  {
    name: 'Art',
    hodRole: 'Production Designer',
    roles: [
      'Art Department Trainee',
      'Costume Trainee',
      'Hair and Make Up Trainee',
      'Set Decorator',
      'Costume Designer',
      'Hair and Make Up Designer',
      'Construction Manager',
      'Production Buyer',
      'Prop Master',
      'Production Designer',
    ],
  },
  {
    name: 'Camera',
    hodRole: 'Director of Photography',
    roles: [
      'Camera Trainee',
      '2nd Assistant Camera',
      '1st Assistant Camera',
      'Camera Operator',
      'Video Assist Trainee',
      'Video Assist Operator',
      'Digital Imaging Technician',
      'Director of Photography',
    ],
  },
  {
    name: 'Lighting',
    hodRole: 'Gaffer',
    roles: ['Spark Trainee', 'Spark', 'Best Boy', 'Gaffer'],
  },
  {
    name: 'Grip',
    hodRole: 'Key Grip',
    roles: [
      'Grip Trainee',
      'Grip',
      'Dolly Grip',
      'Crane Grip',
      'Jib Grip',
      'Best Boy Grip',
      'Key Grip',
    ],
  },
  {
    name: 'Sound',
    hodRole: 'Sound Mixer',
    roles: [
      'Sound Trainee',
      'Sound Assistant',
      '2nd Assistant Sound',
      'Boom Operator',
      'Sound Mixer',
    ],
  },
  {
    name: 'Post-Production',
    hodRole: 'Post-Production Supervisor',
    roles: [
      'Post-Production Runner',
      'Assistant Editor',
      'Editor',
      'Music Editor',
      'Colourist',
      'Bookings Coordinator',
      'Archivist',
      'Supervising Sound Editor',
      'Post-Production Supervisor',
      'Deliverables Producer',
    ],
  },
]

/**
 * Task integration: when assigning tasks by crew department, map to PRODUCTION_DEPARTMENTS
 * where labels differ. E.g. Lighting → Electrical, Post-Production → Post Production,
 * Finance → Accounts, Art → Art Department. Do not modify @/lib/productions/departments in this stage.
 */

/**
 * Maps each canonical crew department to the task assigned_department value(s) used in production_tasks.
 * One crew department can map to multiple task labels (e.g. Development → Producers, Direction).
 * Use this for read-only task summaries and filtering; do not mutate tasks in this layer.
 */
export const CREW_TO_TASK_DEPARTMENT_MAP: Record<CrewDepartmentName, readonly string[]> = {
  Development: ['Producers', 'Direction'],
  Production: ['Production'],
  Finance: ['Accounts'],
  Locations: ['Locations'],
  Art: ['Art Department'],
  Camera: ['Camera'],
  Lighting: ['Electrical'],
  Grip: ['Grip'],
  Sound: ['Sound'],
  'Post-Production': ['Post Production'],
}

/** Returns task assigned_department value(s) for the given crew department. */
export function getTaskDepartmentsForCrewDepartment(
  crewDepartment: CrewDepartmentName
): string[] {
  return [...(CREW_TO_TASK_DEPARTMENT_MAP[crewDepartment] ?? [])]
}

/** Returns department names in canonical order. */
export function getCrewDepartmentNames(): CrewDepartmentName[] {
  return [...CREW_DEPARTMENT_NAMES]
}

/** Returns ordered roles for the given department. */
export function getCrewRolesForDepartment(department: CrewDepartmentName): string[] {
  const def = CREW_DEPARTMENTS.find((d) => d.name === department)
  return def ? [...def.roles] : []
}

/** Returns the Head of Department role for the given department. */
export function getHodRoleForDepartment(department: CrewDepartmentName): string {
  const def = CREW_DEPARTMENTS.find((d) => d.name === department)
  return def?.hodRole ?? ''
}

/** Returns true if roleName is the HOD role for the given department. */
export function isHodRole(department: CrewDepartmentName, roleName: string): boolean {
  return getHodRoleForDepartment(department) === roleName
}

/** Returns all crew roles in order: by department order, then by role order within each department. */
export function getAllCrewRoles(): string[] {
  return CREW_DEPARTMENTS.flatMap((d) => [...d.roles])
}

/** Returns the department whose HOD is roleName, or null if none. */
export function getDepartmentForHodRole(roleName: string): CrewDepartmentName | null {
  const def = CREW_DEPARTMENTS.find((d) => d.hodRole === roleName)
  return def ? def.name : null
}
