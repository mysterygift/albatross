import type { MovementOrderData } from '@/lib/movement-orders/types'

export type BuildMovementOrderDataInput = {
  productionName: string
  shootDate: string
  dayNumber: number | null
  unitName: string
  locations: MovementOrderData['locations']
  locationContacts: MovementOrderData['locationContacts']
  movementLegs: MovementOrderData['movementLegs']
}

export function buildMovementOrderData(input: BuildMovementOrderDataInput): MovementOrderData {
  return {
    productionName: input.productionName,
    shootDate: input.shootDate,
    dayNumber: input.dayNumber,
    unitName: input.unitName,
    locations: input.locations,
    locationContacts: input.locationContacts,
    movementLegs: input.movementLegs,
  }
}
