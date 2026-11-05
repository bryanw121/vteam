/**
 * Weather on outdoor games (#165): which events get a forecast, which hours of
 * it matter, and what the card chip and the event page say. Pure; the data
 * comes from `useForecast` / `useFeedForecasts`.
 */
import {
  FORECAST_COORD_DECIMALS,
  FORECAST_COPY,
  FORECAST_DEFAULT_EMOJI,
  FORECAST_HEAT_EMOJI,
  FORECAST_HEAT_WARN_F,
  FORECAST_ICON_EMOJI,
  FORECAST_LEAD_HOURS,
  FORECAST_NIGHT_CLEAR_EMOJI,
  FORECAST_RAIN_EMOJI,
  FORECAST_RAIN_WARN_POP,
  FORECAST_SURFACES,
  FORECAST_WINDOW_DAYS,
} from '../constants/weather'
import { DEFAULT_DURATION_MINUTES } from '../constants/events'
import { parseEventDate } from './eventDate'
import type { ForecastCell, ForecastCourt, ForecastHour, ForecastSummary, ForecastWindow } from '../types'

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

/** The fields an event (feed row or detail row) needs for a forecast. */
type ForecastEvent = {
  event_date: string
  surface?: string | null
  cancelled_at?: string | null
  latitude?: number | null
  longitude?: number | null
  _external?: unknown
  _isTournament?: boolean
}

/**
 * Whether an event gets a forecast now: sand or grass, not cancelled, a club
 * event (outside sessions have no coordinates yet), starting between now and
 * 7 days from now (`show`), or later than that (`later`: the event page says
 * when it will appear). Coordinates are checked separately (`eventCourt`):
 * feed rows don't carry them.
 */
export function forecastWindow(event: ForecastEvent, now: number): ForecastWindow {
  if (event._external || event._isTournament) return null
  if (!event.surface || !(FORECAST_SURFACES as readonly string[]).includes(event.surface)) return null
  if (event.cancelled_at) return null
  const start = parseEventDate(event.event_date).getTime()
  if (!Number.isFinite(start) || start <= now) return null
  return start - now > FORECAST_WINDOW_DAYS * DAY_MS ? 'later' : 'show'
}

/** Round to the forecast cache grid (2 decimals, about 1 km: one request per court). */
export function roundCourtCoord(value: number): number {
  const f = 10 ** FORECAST_COORD_DECIMALS
  return Math.round(value * f) / f
}

/** The event's court on the cache grid, or null without usable coordinates. */
export function eventCourt(event: Pick<ForecastEvent, 'latitude' | 'longitude'>): ForecastCourt | null {
  const { latitude: lat, longitude: lng } = event
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  return { lat: roundCourtCoord(lat), lng: roundCourtCoord(lng) }
}

/** Stable string for a court (`30.27,-97.77`): the cache key part. */
export function courtId(court: ForecastCourt): string {
  return `${court.lat.toFixed(FORECAST_COORD_DECIMALS)},${court.lng.toFixed(FORECAST_COORD_DECIMALS)}`
}

/** A forecast chip / row shows: outdoor, has coordinates, not cancelled, starts within 7 days. */
export function shouldShowForecast(event: ForecastEvent, now: number): boolean {
  return forecastWindow(event, now) === 'show' && eventCourt(event) !== null
}

/**
 * The hours the event page shows: from one hour before the start through the
 * hour that begins at the end (`inGame` marks the hours the game overlaps).
 * Absolute instants, so midnight and DST changes need nothing special.
 */
export function pickForecastHours(hours: ForecastHour[], start: string, durationMinutes: number | null | undefined): ForecastCell[] {
  const startMs = parseEventDate(start).getTime()
  const endMs = startMs + (durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000
  const from = startMs - FORECAST_LEAD_HOURS * HOUR_MS
  const cells: ForecastCell[] = []
  for (const h of hours) {
    const t = Date.parse(h.t)
    if (!Number.isFinite(t)) continue
    if (t + HOUR_MS <= from || t > endMs) continue
    cells.push({ ...h, inGame: t < endMs && t + HOUR_MS > startMs })
  }
  return cells.sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
}

/**
 * Heat index (°F), the NWS formula: Steadman's simple form, then the Rothfusz
 * regression with its low- and high-humidity adjustments when that is ≥ 80°F.
 * https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
 */
export function heatIndexF(tempF: number, rh: number): number {
  const T = tempF
  const R = rh
  const simple = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + R * 0.094)
  if ((simple + T) / 2 < 80) return simple
  let hi = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T
    - 0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R
  if (R < 13 && T >= 80 && T <= 112) hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17)
  else if (R > 85 && T >= 80 && T <= 87) hi += ((R - 85) / 10) * ((87 - T) / 5)
  return hi
}

/** Emoji for an NWS icon condition (`day/skc` → ☀️, `night/skc` → 🌙). */
export function forecastEmoji(icon: string): string {
  const [part, code] = icon.split('/')
  if (!code) return FORECAST_DEFAULT_EMOJI
  if (part === 'night' && (code === 'skc' || code === 'few')) return FORECAST_NIGHT_CLEAR_EMOJI
  return FORECAST_ICON_EMOJI[code] ?? FORECAST_DEFAULT_EMOJI
}

/**
 * What the chip and the event page say about the game hours (the `inGame`
 * cells, or every cell when none is). Heat first (a safety cue), then rain,
 * else the NWS short forecast. Null when there are no hours.
 */
export function forecastSummary(cells: (ForecastHour & { inGame?: boolean })[]): ForecastSummary | null {
  const game = cells.some(c => c.inGame) ? cells.filter(c => c.inGame) : cells
  if (game.length === 0) return null
  const first = game[0]
  const pop = Math.max(...game.map(h => h.pop))
  const wind = Math.max(...game.map(h => h.windMph))
  const temps = game.map(h => h.tempF)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  const feels = Math.round(Math.max(...game.map(h => heatIndexF(h.tempF, h.rh))))
  const tempText = lo === hi ? `${hi}°F` : `${lo}–${hi}°F`

  // Dry heat can put the heat index below the air temperature: warn on whichever is higher.
  const hot = Math.max(feels, hi)
  if (hot >= FORECAST_HEAT_WARN_F) {
    return {
      tone: 'heat',
      emoji: FORECAST_HEAT_EMOJI,
      chipLabel: `${FORECAST_HEAT_EMOJI} ${hot}°`,
      headline: FORECAST_COPY.heatHeadline(hot),
      detail: `${first.short || tempText} · wind ${wind} mph · ${pop}% rain. ${FORECAST_COPY.heatAdvice}`,
      a11yLabel: `Forecast: hot, feels like ${hot} degrees`,
    }
  }
  if (pop >= FORECAST_RAIN_WARN_POP) {
    return {
      tone: 'rain',
      emoji: FORECAST_RAIN_EMOJI,
      chipLabel: `${FORECAST_RAIN_EMOJI} ${pop}% rain`,
      headline: FORECAST_COPY.rainHeadline,
      detail: `${tempText} · wind ${wind} mph · ${pop}% chance of rain`,
      a11yLabel: `Forecast: ${pop} percent chance of rain`,
    }
  }
  const emoji = forecastEmoji(first.icon)
  return {
    tone: 'neutral',
    emoji,
    chipLabel: `${emoji} ${first.tempF}°`,
    headline: first.short || tempText,
    detail: `${tempText} · wind ${wind} mph · ${pop}% chance of rain`,
    a11yLabel: `Forecast: ${first.short ? `${first.short.toLowerCase()}, ` : ''}${first.tempF} degrees`,
  }
}
