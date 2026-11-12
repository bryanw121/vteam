/**
 * The pure half of `api/forecast.ts` (#165): coordinate validation, the two
 * National Weather Service calls (`/points/{lat},{lng}` → `forecastHourly`),
 * and trimming the hourly periods to what the app draws. Only `fetch` and
 * import-free app modules, so it runs in the Edge runtime and under Jest.
 *
 * NWS: https://www.weather.gov/documentation/services-web-API ("open data,
 * free to use for any purpose"; no key, but a User-Agent with contact info).
 */
import { FORECAST_COORD_DECIMALS } from '../../constants/weather'
import type { Forecast, ForecastCourt, ForecastHour } from '../../types'

export const NWS_BASE = 'https://api.weather.gov'

/** Each NWS call is abandoned after this long (the proxy answers 204 and the app hides the row). */
export const NWS_TIMEOUT_MS = 5000

/** At most this many hourly periods (NWS sends about 156: six and a half days). */
export const MAX_FORECAST_HOURS = 168

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Env = Record<string, string | undefined>

/** Round to the cache grid (2 decimals, about 1 km). */
export function roundCoord(value: number): number {
  const f = 10 ** FORECAST_COORD_DECIMALS
  return Math.round(value * f) / f
}

/** `?lat=&lng=` → a rounded court, or null when either is missing, not a number or out of range. */
export function parseCourt(lat: string | null, lng: string | null): ForecastCourt | null {
  if (lat == null || lng == null || lat.trim() === '' || lng.trim() === '') return null
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null
  return { lat: roundCoord(la), lng: roundCoord(ln) }
}

/** The User-Agent NWS asks for: app, site, and a contact from `NWS_CONTACT`. */
export function nwsUserAgent(env: Env): string {
  const contact = (env.NWS_CONTACT ?? '').trim()
  return contact ? `vteam (vteamvolleyball.com, ${contact})` : 'vteam (vteamvolleyball.com)'
}

/** "5 mph", "5 to 10 mph" → the top of the range; 0 when unreadable. */
export function parseWindMph(value: unknown): number {
  if (typeof value !== 'string') return 0
  const nums = value.match(/\d+(\.\d+)?/g)
  if (!nums) return 0
  return Math.round(Math.max(...nums.map(Number)))
}

/** `https://api.weather.gov/icons/land/day/rain_showers,40?size=small` → `day/rain_showers`. */
export function parseIcon(url: unknown): string {
  if (typeof url !== 'string') return ''
  const m = url.match(/\/icons\/land\/(day|night)\/([a-z_]+)/)
  return m ? `${m[1]}/${m[2]}` : ''
}

const quantity = (q: unknown): number => {
  const v = q && typeof q === 'object' ? (q as { value?: unknown }).value : null
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** One NWS hourly period → a `ForecastHour`, or null when it has no start time or temperature. */
export function trimPeriod(p: unknown): ForecastHour | null {
  if (!p || typeof p !== 'object') return null
  const r = p as Record<string, unknown>
  if (typeof r.startTime !== 'string' || Number.isNaN(Date.parse(r.startTime))) return null
  if (typeof r.temperature !== 'number' || !Number.isFinite(r.temperature)) return null
  const tempF = r.temperatureUnit === 'C' ? r.temperature * 9 / 5 + 32 : r.temperature
  return {
    t: r.startTime,
    tempF: Math.round(tempF),
    pop: Math.round(Math.min(100, Math.max(0, quantity(r.probabilityOfPrecipitation)))),
    windMph: parseWindMph(r.windSpeed),
    short: typeof r.shortForecast === 'string' ? r.shortForecast : '',
    icon: parseIcon(r.icon),
    rh: Math.round(Math.min(100, Math.max(0, quantity(r.relativeHumidity)))),
  }
}

/** The `forecastHourly` GeoJSON → `Forecast`, or null when it has no usable periods. */
export function trimForecast(json: unknown): Forecast | null {
  const props = json && typeof json === 'object' ? (json as { properties?: Record<string, unknown> }).properties : null
  const periods = props && Array.isArray(props.periods) ? props.periods : null
  if (!periods) return null
  const hours = periods.map(trimPeriod).filter((h): h is ForecastHour => h !== null).slice(0, MAX_FORECAST_HOURS)
  if (hours.length === 0) return null
  const updatedAt = typeof props?.updateTime === 'string' ? props.updateTime
    : typeof props?.generatedAt === 'string' ? props.generatedAt
    : new Date().toISOString()
  return { updatedAt, hours }
}

async function getJson(url: string, fetchImpl: FetchLike, userAgent: string): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), NWS_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * `/points` then `forecastHourly` for one court. Null on any failure: a point
 * outside the US (404), NWS down (5xx), a timeout, or a body we can't read.
 */
export async function fetchNwsForecast(court: ForecastCourt, fetchImpl: FetchLike, env: Env): Promise<Forecast | null> {
  const ua = nwsUserAgent(env)
  const points = await getJson(`${NWS_BASE}/points/${court.lat},${court.lng}`, fetchImpl, ua)
  const hourlyUrl = points && typeof points === 'object'
    ? (points as { properties?: { forecastHourly?: unknown } }).properties?.forecastHourly
    : null
  // Only ever follow a link back to NWS itself.
  if (typeof hourlyUrl !== 'string' || !hourlyUrl.startsWith(`${NWS_BASE}/`)) return null
  const hourly = await getJson(hourlyUrl, fetchImpl, ua)
  return hourly ? trimForecast(hourly) : null
}
