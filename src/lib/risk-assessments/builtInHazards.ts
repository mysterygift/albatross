import type { HazardContent } from '@/lib/db/types'

export type BuiltInHazard = HazardContent & {
  /** Stable key (never stored). */
  key: string
}

/**
 * Built-in hazards offered under "Add hazard". Content fields are multi-line: one risk /
 * outcome / control measure per line.
 */
export const BUILT_IN_HAZARDS: readonly BuiltInHazard[] = [
  {
    key: 'manual-handling',
    name: 'Manual Handling',
    description:
      'Lifting, carrying, pushing, pulling or lowering equipment, props, set pieces and kit during load-in, shoot and wrap.',
    risks: [
      'Musculoskeletal injury (back, shoulder, neck, limbs) from lifting or carrying heavy, awkward or bulky items.',
      'Trips, slips and dropped loads causing crush, impact or trapping injuries.',
    ].join('\n'),
    outcomes: 'Strains and sprains, long-term back injury, cuts, bruising, broken bones.',
    control_measures: [
      'Assess each load (weight, size, route, destination) before moving it; do not lift if unsure.',
      'Use trolleys, sack barrows, carts or lifting aids wherever possible.',
      'Team-lift heavy or awkward items with clear communication; one person leads the lift.',
      'Keep walkways and loading routes clear, dry and well lit.',
      'Wear suitable footwear and gloves; use correct lifting technique (bend knees, keep the load close).',
      'Take regular breaks and rotate crew on repetitive handling tasks; report any injury to the first aider immediately.',
    ].join('\n'),
    at_risk_crew: 1,
    at_risk_cast: 0,
    at_risk_public: 0,
    severity_before: 4,
    probability_before: 3,
    severity_after: 2,
    probability_after: 2,
  },
  {
    key: 'drone-flying',
    name: 'Flying Drones (Internal and External)',
    description:
      'Flying drones indoors and outdoors in the designated filming spaces, by licensed operators working with all involved personnel and the Maverick crew.',
    risks: [
      'Collisions with people and property (tree branches, power lines, warehouse racking and machinery).',
      'Loss of control owing to loss of GPS connection.',
    ].join('\n'),
    outcomes: 'Serious injury to people, damage to property and equipment, loss of the drone.',
    control_measures: [
      'Drones will only be flown by competent licensed operators in line with CAA regulations and UK law.',
      'All personnel will be kept clear of designated take-off and landing zones.',
      'Visual line of sight will be maintained with the drone at all times by either the pilot or a designated spotter.',
      'All movements will be broken down step by step and coordinated with on-site personnel before filming.',
      'Drones will maintain a minimum distance of 5m above all personnel at all times.',
      'If loss of GPS connection occurs and it becomes clear that control of drones cannot be maintained, all drone operation will cease.',
    ].join('\n'),
    at_risk_crew: 1,
    at_risk_cast: 1,
    at_risk_public: 0,
    severity_before: 5,
    probability_before: 3,
    severity_after: 4,
    probability_after: 1,
  },
]

export function getBuiltInHazard(key: string): BuiltInHazard | undefined {
  return BUILT_IN_HAZARDS.find((h) => h.key === key)
}
