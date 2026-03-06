import type { Location, Person } from '@/lib/db/types'

export type LineItemReadProps = {
  details: unknown
  /** Optional: for formatting amounts in read view */
  format?: (amount: number, currency: string) => { formatted: string }
  productionCurrency?: string
}

export type LineItemEditProps<T = unknown> = {
  initialDetails: T | null
  productionId: string
  people: Person[]
  locations: Location[]
  format: (amount: number, currency: string) => { formatted: string }
  productionCurrency: string
  /** Optional: call to push a suggested amount into the base form (e.g. "Use calculated amount"). */
  onEstimatedCostSuggest?: (amount: number) => void
}

/** Ref handle for type-specific editors so the panel can read current details on save. */
export type LineItemEditorRef = {
  getDetails: () => unknown
  isDirty: () => boolean
}
