/**
 * Open-Meteo weather lookup for call sheets.
 * Geocoding: https://geocoding-api.open-meteo.com/v1/search
 * Forecast: https://api.open-meteo.com/v1/forecast
 * Triggered only on View/Generate from the Call Sheets page; not on page load or selection change.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

export type GeocodeResult = {
  latitude: number
  longitude: number
  timezone: string
}

export type ForecastDay = {
  weatherCode: number
  temperatureMax: number | null
  temperatureMin: number | null
  precipitationProbabilityMax: number | null
  windSpeedMax: number | null
}

/**
 * Geocode a location string. Returns first result or null if none/no query.
 */
export async function geocodeLocation(name: string): Promise<GeocodeResult | null> {
  const query = name?.trim()
  if (!query || query.length < 2) return null
  const params = new URLSearchParams({ name: query, count: '1', format: 'json' })
  const res = await fetch(`${GEOCODE_URL}?${params}`)
  if (!res.ok) return null
  const data = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; timezone: string }> }
  const first = data.results?.[0]
  if (!first) return null
  return {
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone ?? 'UTC',
  }
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
    'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max'
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timezone,
    daily: daily,
    forecast_days: '16',
  })
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

/**
 * Try geocoding with the given query, then with simpler fallbacks (e.g. "City" only) when that returns no results.
 */
async function geocodeWithFallbacks(query: string): Promise<GeocodeResult | null> {
  let geo = await geocodeLocation(query)
  if (geo) return geo
  const parts = query.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return null
  geo = await geocodeLocation(parts.slice(-2).join(', '))
  if (geo) return geo
  if (parts.length >= 2) {
    geo = await geocodeLocation(parts[parts.length - 1]!)
  }
  return geo
}

/**
 * Resolve weather for a call sheet: geocode location, fetch forecast for shoot date, return summary string.
 * Returns null on any failure (no location query, geocode fail, forecast fail).
 * Uses progressively simpler location strings when the full query returns no geocode result.
 */
export async function getWeatherSummaryForCallSheet(
  locationQuery: string,
  shootDate: string
): Promise<string | null> {
  if (!locationQuery?.trim() || !shootDate) return null
  const geocodeQuery = geocodeRelevantPart(locationQuery)
  if (!geocodeQuery) return null
  const geo = await geocodeWithFallbacks(geocodeQuery)
  if (!geo) return null
  const day = await fetchForecastForDate(
    geo.latitude,
    geo.longitude,
    geo.timezone,
    shootDate
  )
  if (!day) return null
  return buildWeatherSummary(day)
}
