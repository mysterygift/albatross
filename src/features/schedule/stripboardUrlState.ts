/**
 * Pure helpers for persisting stripboard state in URL search params.
 * Defaults are omitted so URLs stay clean. Invalid values never throw; they fall back.
 *
 * Params: `q` (search), `loc` (location id, `none` = no location),
 * `bloc` (shooting bloc filter, default `all`), `day` (active shoot day).
 */
export const LOCATION_NONE_PARAM = 'none'
export const DEFAULT_BLOC_FILTER = 'all'

export interface StripboardUrlState {
  q: string
  /** `undefined` = no location filter, `null` = scenes with no location. */
  locationId: string | null | undefined
  bloc: string
  day: string | null
}

export function parseStripboardParams(sp: URLSearchParams): StripboardUrlState {
  const loc = sp.get('loc')
  const locationId = !loc ? undefined : loc === LOCATION_NONE_PARAM ? null : loc
  return {
    q: sp.get('q') ?? '',
    locationId,
    bloc: sp.get('bloc') || DEFAULT_BLOC_FILTER,
    day: sp.get('day') || null,
  }
}

export type StripboardUrlPatch = Partial<{
  q: string
  locationId: string | null | undefined
  bloc: string
  day: string | null
}>

function setOrDelete(next: URLSearchParams, key: string, value: string | null) {
  if (value == null || value === '') next.delete(key)
  else next.set(key, value)
}

/** Returns a new URLSearchParams with `patch` applied (keys absent from the patch are kept). */
export function applyStripboardParams(
  prev: URLSearchParams,
  patch: StripboardUrlPatch
): URLSearchParams {
  const next = new URLSearchParams(prev)
  if ('q' in patch) setOrDelete(next, 'q', patch.q ?? null)
  if ('locationId' in patch) {
    const id = patch.locationId
    setOrDelete(next, 'loc', id === undefined ? null : id === null ? LOCATION_NONE_PARAM : id)
  }
  if ('bloc' in patch) {
    setOrDelete(next, 'bloc', patch.bloc === DEFAULT_BLOC_FILTER ? null : (patch.bloc ?? null))
  }
  if ('day' in patch) setOrDelete(next, 'day', patch.day ?? null)
  return next
}
