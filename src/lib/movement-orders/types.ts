import type { PaperSize } from '@/lib/pdf/layoutKit'

/** One scene shot at a movement order location (derived from the day's scheduled strips). */
export interface MovementOrderLocationScene {
  sceneNumber: string
  /** `INT` / `EXT` / `INT/EXT`; null when unset or unknown. */
  intExt: string | null
  /** `DAY` / `NIGHT` / ...; null when unset or unknown. */
  dayNight: string | null
}

export interface MovementOrderLocation {
  id: string
  name: string
  address: string | null
  what3words: string | null
  parkingInfo: string | null
  lat: number | null
  lng: number | null
  /** Scenes scheduled at this location for the day/unit, in schedule order. */
  scenes: MovementOrderLocationScene[]
}

export interface MovementOrderLocationContact {
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

export interface MovementOrderMovementLeg {
  /** Stable key for hand-entered values; see `getMovementLegKeys`. */
  key: string
  fromLocationName: string
  toLocationName: string
  drivingTimeMinutes: number | null
  drivingDistanceText: string | null
  /** Raw metres, used only to total the day's driving. */
  drivingDistanceMeters: number | null
  walkingTimeMinutes: number | null
  walkingDistanceText: string | null
  writtenDirections: string | null
  /** Hand-entered, `HH:MM` (24h). Never computed. */
  departTime: string | null
  /** Hand-entered, `HH:MM` (24h). Never computed. */
  arriveTime: string | null
}

/** Safety details already held on the shoot day (same source as the call sheet). */
export interface MovementOrderSafety {
  hospitalName: string | null
  hospitalAddress: string | null
  policeStationName: string | null
  policeStationAddress: string | null
  notes: string | null
}

export interface MovementOrderData {
  productionName: string
  shootDate: string
  dayNumber: number | null
  /** Number of shoot days in the production, for "Day X of Y". */
  totalShootDays: number | null
  unitName: string
  /** Crew call and wrap, from the shoot day. */
  callTime: string | null
  wrapTime: string | null
  /** Hand-entered unit base opening time, `HH:MM`. */
  unitBaseTime: string | null
  /**
   * Where the unit base is, from the shoot day's parking/base address. When set, the journey
   * starts and ends at the unit base.
   */
  unitBaseAddress: string | null
  /** Hand-entered revision label such as `Draft 2`. */
  revisionLabel: string | null
  /** ISO timestamp the order was issued; defaults to now when omitted. */
  issuedAt: string | null
  /** Shooting bloc name for episodic productions (same label as the call sheet masthead). */
  shootingBlocLabel: string | null
  safety: MovementOrderSafety
  locations: MovementOrderLocation[]
  locationContacts: MovementOrderLocationContact[]
  movementLegs: MovementOrderMovementLeg[]
}

export interface MovementOrderPdfOptions {
  /** Defaults to A4. */
  paperSize?: PaperSize
}
