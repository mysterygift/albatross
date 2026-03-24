export interface MovementOrderLocation {
  id: string
  name: string
  address: string | null
  what3words: string | null
  parkingInfo: string | null
  lat: number | null
  lng: number | null
}

export interface MovementOrderLocationContact {
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

export interface MovementOrderMovementLeg {
  fromLocationName: string
  toLocationName: string
  drivingTimeMinutes: number | null
  drivingDistanceText: string | null
  walkingTimeMinutes: number | null
  walkingDistanceText: string | null
  writtenDirections: string | null
}

export interface MovementOrderData {
  productionName: string
  shootDate: string
  dayNumber: number | null
  unitName: string
  locations: MovementOrderLocation[]
  locationContacts: MovementOrderLocationContact[]
  movementLegs: MovementOrderMovementLeg[]
}
