import type { ShootDay } from '@/lib/db/types'
import {
  applyMovementOrderLegInputs,
  type MovementOrderInputs,
} from '@/lib/movement-orders/movementOrderInputs'
import type { MovementOrderData } from '@/lib/movement-orders/types'

export type BuildMovementOrderDataInput = {
  productionName: string
  shootDay: Pick<
    ShootDay,
    | 'shoot_date'
    | 'day_number'
    | 'call_time'
    | 'wrap_time'
    | 'parking_base_address'
    | 'special_notes'
    | 'hospital_name'
    | 'hospital_address'
    | 'police_station_name'
    | 'police_station_address'
  >
  totalShootDays: number | null
  shootingBlocLabel?: string | null
  unitName: string
  /** Hand-entered values for this shoot day + unit. */
  inputs: MovementOrderInputs
  locations: MovementOrderData['locations']
  locationContacts: MovementOrderData['locationContacts']
  movementLegs: MovementOrderData['movementLegs']
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function buildMovementOrderData(input: BuildMovementOrderDataInput): MovementOrderData {
  const { shootDay } = input
  return {
    productionName: input.productionName,
    shootDate: shootDay.shoot_date,
    dayNumber: shootDay.day_number ?? null,
    totalShootDays: input.totalShootDays,
    unitName: input.unitName,
    callTime: clean(shootDay.call_time),
    wrapTime: clean(shootDay.wrap_time),
    unitBaseTime: input.inputs.unitBaseTime,
    unitBaseAddress: clean(shootDay.parking_base_address),
    revisionLabel: input.inputs.revisionLabel,
    issuedAt: null,
    shootingBlocLabel: clean(input.shootingBlocLabel),
    safety: {
      hospitalName: clean(shootDay.hospital_name),
      hospitalAddress: clean(shootDay.hospital_address),
      policeStationName: clean(shootDay.police_station_name),
      policeStationAddress: clean(shootDay.police_station_address),
      notes: clean(shootDay.special_notes),
    },
    locations: input.locations,
    locationContacts: input.locationContacts,
    movementLegs: applyMovementOrderLegInputs(input.movementLegs, input.inputs),
  }
}
