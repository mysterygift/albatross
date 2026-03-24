import { recordApiCall } from '@/lib/dev/apiCallTracker'
import { geocodeLocationWithOpenRouteService } from '@/lib/logistics/openRouteService'

/**
 * Open-Meteo weather for call sheets: geocode via OpenRouteService (Tauri), forecast via Open-Meteo.
 * Forecast: https://api.open-meteo.com/v1/forecast
 * Triggered only on View/Generate from the Call Sheets page; not on page load or selection change.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

export type GeocodeResult = {
  latitude: number
  longitude: number
  /** IANA zone or `auto` (Open-Meteo derives from coordinates). ORS geocode supplies `auto`. */
  timezone: string
}

export type ForecastDay = {
  weatherCode: number
  temperatureMax: number | null
  temperatureMin: number | null
  precipitationProbabilityMax: number | null
  windSpeedMax: number | null
  /** Open-Meteo daily local ISO8601, e.g. `2024-03-22T06:15`. */
  sunrise: string | null
  sunset: string | null
}

/** Summary plus sunrise/sunset strings for the call sheet PDF (local time of day). */
export type CallSheetWeatherFromApi = {
  summary: string
  sunrise: string | null
  sunset: string | null
}

/** `2024-03-22T06:15` → `06:15` (API already uses shoot-day local timezone). */
function formatSunTimeForCallSheet(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  const t = iso.trim()
  const i = t.indexOf('T')
  if (i >= 0 && t.length >= i + 6) return t.slice(i + 1, i + 6)
  return t
}

/**
 * Fetch daily forecast for a given date at coordinates. Returns that day's data or null.
 */
export async function fetchForecastForDate(
  lat: number,
  lon: number,
  timezone: string,
  dateStr: string
): Promise<ForecastDay | null> {
  const daily =
    'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,sunrise,sunset'
  const { past_days, forecast_days } = forecastWindowForShootDate(dateStr)
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timezone,
    daily: daily,
    forecast_days: String(forecast_days),
    past_days: String(past_days),
  })
  recordApiCall('open_meteo_forecast')
  const res = await fetch(`${FORECAST_URL}?${params}`)
  if (!res.ok) return null
  const data = (await res.json()) as {
    daily?: {
      time?: string[]
      weathercode?: number[]
      temperature_2m_max?: (number | null)[]
      temperature_2m_min?: (number | null)[]
      precipitation_probability_max?: (number | null)[]
      windspeed_10m_max?: (number | null)[]
      sunrise?: string[]
      sunset?: string[]
    }
  }
  const times = data.daily?.time
  if (!times?.length) return null
  const idx = times.indexOf(dateStr)
  if (idx === -1) return null
  return {
    weatherCode: data.daily?.weathercode?.[idx] ?? 0,
    temperatureMax: data.daily?.temperature_2m_max?.[idx] ?? null,
    temperatureMin: data.daily?.temperature_2m_min?.[idx] ?? null,
    precipitationProbabilityMax: data.daily?.precipitation_probability_max?.[idx] ?? null,
    windSpeedMax: data.daily?.windspeed_10m_max?.[idx] ?? null,
    sunrise: data.daily?.sunrise?.[idx] ?? null,
    sunset: data.daily?.sunset?.[idx] ?? null,
  }
}

/**
 * WMO weather code to short human-readable text. Production-friendly.
 */
export function weatherCodeToText(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45) return 'Fog'
  if (code === 48) return 'Fog (rime)'
  if (code === 51) return 'Light drizzle'
  if (code === 53) return 'Drizzle'
  if (code === 55) return 'Dense drizzle'
  if (code === 56 || code === 57) return 'Freezing drizzle'
  if (code === 61) return 'Slight rain'
  if (code === 63) return 'Moderate rain'
  if (code === 65) return 'Heavy rain'
  if (code === 66 || code === 67) return 'Freezing rain'
  if (code === 71 || code === 73 || code === 75) return 'Snow'
  if (code === 77) return 'Snow grains'
  if (code === 80) return 'Slight rain showers'
  if (code === 81) return 'Rain showers'
  if (code === 82) return 'Heavy rain showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code === 95) return 'Thunderstorm'
  if (code === 96 || code === 99) return 'Thunderstorm with hail'
  if (code >= 1 && code <= 3) return 'Partly cloudy'
  if (code >= 51 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code >= 85 && code <= 86) return 'Snow showers'
  if (code >= 95 && code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

/**
 * Build a concise call-sheet weather summary from forecast day data.
 */
export function buildWeatherSummary(day: ForecastDay): string {
  const parts: string[] = [weatherCodeToText(day.weatherCode)]
  if (day.temperatureMax != null || day.temperatureMin != null) {
    const high = day.temperatureMax != null ? `High ${Math.round(day.temperatureMax)}°C` : ''
    const low = day.temperatureMin != null ? `Low ${Math.round(day.temperatureMin)}°C` : ''
    const temps = [high, low].filter(Boolean).join(' / ')
    if (temps) parts.push(temps)
  }
  if (day.precipitationProbabilityMax != null && day.precipitationProbabilityMax > 0) {
    parts.push(`Precip ${Math.round(day.precipitationProbabilityMax)}%`)
  }
  if (day.windSpeedMax != null && day.windSpeedMax >= 10) {
    parts.push(`Wind ${Math.round(day.windSpeedMax)} km/h`)
  }
  return parts.join(' / ')
}

/**
 * For call-sheet location strings like "Bank Interior, Canary Wharf, London", the part before the first comma
 * is the script location name (e.g. "Bank Interior"); the rest are real places. Return the portion to use for geocoding.
 */
function geocodeRelevantPart(locationQuery: string): string {
  const trimmed = locationQuery.trim()
  const commaIdx = trimmed.indexOf(',')
  if (commaIdx === -1) return trimmed
  const after = trimmed.slice(commaIdx + 1).trim()
  return after || trimmed
}

async function geocodeQueryWithOpenRouteService(
  query: string,
  orsApiKey?: string | null
): Promise<GeocodeResult | null> {
  const q = query.trim()
  if (q.length < 2) return null
  const coords = await geocodeLocationWithOpenRouteService(q, orsApiKey)
  if (!coords) return null
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    timezone: 'auto',
  }
}

/**
 * Try OpenRouteService geocoding with the given query, then simpler comma-separated fallbacks.
 */
async function geocodeWithFallbacks(
  query: string,
  orsApiKey?: string | null
): Promise<GeocodeResult | null> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return null

  let geo = await geocodeQueryWithOpenRouteService(trimmed, orsApiKey)
  if (geo) return geo

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return null

  const lastTwo = parts.slice(-2).join(', ')
  if (lastTwo !== trimmed) {
    geo = await geocodeQueryWithOpenRouteService(lastTwo, orsApiKey)
    if (geo) return geo
  }

  const last = parts[parts.length - 1]!
  if (last.length >= 2 && last !== trimmed && last !== lastTwo) {
    geo = await geocodeQueryWithOpenRouteService(last, orsApiKey)
  }
  return geo
}

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/** Open-Meteo daily `time` must include the shoot date; past shoots need `past_days`, future shoots need enough `forecast_days`. */
function forecastWindowForShootDate(shootDateStr: string): { past_days: number; forecast_days: number } {
  const shoot = parseYmd(shootDateStr)
  if (!shoot) return { past_days: 0, forecast_days: 16 }

  const now = new Date()
  const tUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const sUtc = Date.UTC(shoot.y, shoot.m - 1, shoot.d)
  const diffDays = Math.round((sUtc - tUtc) / 86400000)

  const MAX_PAST = 92
  const MAX_FORECAST = 16

  if (diffDays < 0) {
    const past = Math.min(Math.max(-diffDays, 1), MAX_PAST)
    return { past_days: past, forecast_days: MAX_FORECAST }
  }

  const futureSpan = Math.min(Math.max(diffDays + 1, 1), MAX_FORECAST)
  return { past_days: 0, forecast_days: futureSpan }
}

export type GetWeatherForCallSheetOptions = {
  /** Raw address line (no scene heading); tried if primary geocode queries fail. */
  addressHint?: string | null
  /** Optional ORS key; if omitted, uses Settings → OpenRouteService API key. */
  orsApiKey?: string | null
}

/**
 * Resolve weather + sunrise/sunset for a call sheet: geocode, fetch forecast for shoot date.
 * Returns null on any failure (no location query, geocode fail, forecast fail).
 */
export async function getWeatherForCallSheet(
  locationQuery: string,
  shootDate: string,
  options?: GetWeatherForCallSheetOptions
): Promise<CallSheetWeatherFromApi | null> {
  if (!locationQuery?.trim() || !shootDate) return null
  const full = locationQuery.trim()
  const geocodeQuery = geocodeRelevantPart(locationQuery)
  if (!geocodeQuery) return null

  const orsKey = options?.orsApiKey
  let geo = await geocodeWithFallbacks(geocodeQuery, orsKey)
  if (!geo && full !== geocodeQuery) {
    geo = await geocodeWithFallbacks(full, orsKey)
  }
  const hint = options?.addressHint?.trim()
  if (!geo && hint && hint.length >= 2 && hint !== geocodeQuery && hint !== full) {
    geo = await geocodeWithFallbacks(hint, orsKey)
  }
  if (!geo) return null
  const day = await fetchForecastForDate(
    geo.latitude,
    geo.longitude,
    geo.timezone,
    shootDate
  )
  if (!day) return null
  return {
    summary: buildWeatherSummary(day),
    sunrise: formatSunTimeForCallSheet(day.sunrise),
    sunset: formatSunTimeForCallSheet(day.sunset),
  }
}

/**
 * Summary string only; same lookup as {@link getWeatherForCallSheet}.
 */
export async function getWeatherSummaryForCallSheet(
  locationQuery: string,
  shootDate: string,
  options?: GetWeatherForCallSheetOptions
): Promise<string | null> {
  const r = await getWeatherForCallSheet(locationQuery, shootDate, options)
  return r?.summary ?? null
}
