export const PRODUCTION_DEPARTMENTS = [
  'Production',
  'Producers',
  'Direction',
  'Camera',
  'Grip',
  'Electrical',
  'Sound',
  'Art Department',
  'Locations',
  'Wardrobe',
  'Hair & Make-up',
  'Special Effects',
  'Post Production',
  'Accounts',
  'Legal',
  'Publicity / Marketing',
  'Transport',
  'AD Department',
  'Cast',
  'Other',
] as const

export type ProductionDepartment = (typeof PRODUCTION_DEPARTMENTS)[number]
