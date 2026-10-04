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
]

export function getBuiltInHazard(key: string): BuiltInHazard | undefined {
  return BUILT_IN_HAZARDS.find((h) => h.key === key)
}
