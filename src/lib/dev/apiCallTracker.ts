/**
 * Session-scoped counters for outbound external API usage (dev tooling).
 * Enabled only when the user turns on tracking in Settings → Developer Tools.
 */

export const API_CALL_TRACKING_SETTING_KEY = 'enable_api_call_tracking'

export const API_CALL_TRACKER_IDS = [
  'openrouteservice',
  'open_meteo_forecast',
  'currency_conversion_api',
] as const

export type ApiCallTrackerId = (typeof API_CALL_TRACKER_IDS)[number]

export const API_CALL_TRACKER_LABELS: Record<ApiCallTrackerId, string> = {
  openrouteservice: 'OpenRouteService (geocode + directions via Tauri)',
  open_meteo_forecast: 'Open-Meteo (forecast only)',
  currency_conversion_api: 'Currency conversion API (Fawaz / jsDelivr)',
}

const counts: Record<ApiCallTrackerId, number> = {
  openrouteservice: 0,
  open_meteo_forecast: 0,
  currency_conversion_api: 0,
}

let trackingEnabled = false

const listeners = new Set<() => void>()

function emit() {
  for (const cb of listeners) cb()
}

export function setApiCallTrackingEnabled(enabled: boolean): void {
  trackingEnabled = enabled
}

/** Increment when an outbound request is issued (not when serving from app cache). */
export function recordApiCall(id: ApiCallTrackerId): void {
  if (!trackingEnabled) return
  counts[id] += 1
  emit()
}

export function getApiCallCounts(): Record<ApiCallTrackerId, number> {
  return { ...counts }
}

export function subscribeApiCallTracker(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}
