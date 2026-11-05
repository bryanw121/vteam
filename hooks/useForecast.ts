import { useMemo } from 'react'
import { getQueryData, prefetchQuery, queryKey, useQuery } from '../lib/query'
import { supabase } from '../lib/supabase'
import { STALE } from '../constants/cache'
import { shareUrl } from '../constants/share'
import { FORECAST_API_PATH, FORECAST_CLIENT_TIMEOUT_MS } from '../constants/weather'
import { courtId, eventCourt, forecastSummary, forecastWindow, pickForecastHours } from '../utils/forecast'
import type { EventWithDetails, Forecast, ForecastCourt, ForecastSummary } from '../types'

/**
 * Weather on outdoor games (#165). Forecasts come from our proxy
 * (`api/forecast.ts`, National Weather Service), cached per court: the
 * coordinates are rounded to 2 decimals, so every event at a court, on the feed
 * and on the event page, shares one `forecast:<lat>,<lng>` entry and one request.
 * Public data: no user scope, guests included.
 *
 * Every failure (outside the US, NWS down, a timeout, no proxy on this host)
 * is `null`, and the chip / row is simply not drawn. Nothing waits on it.
 */

export const FORECAST_PREFIX = 'forecast'

export function forecastKey(court: ForecastCourt): string {
  return queryKey(FORECAST_PREFIX, courtId(court))
}

/** `{origin}/api/forecast?lat=..&lng=..`: the page's own origin on web, `WEB_ORIGIN` on native. */
export function forecastUrl(court: ForecastCourt): string {
  return shareUrl(`${FORECAST_API_PATH}?lat=${court.lat}&lng=${court.lng}`)
}

/** One court's forecast, or null when there is none. Never throws. */
export async function fetchForecast(court: ForecastCourt): Promise<Forecast | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FORECAST_CLIENT_TIMEOUT_MS)
  try {
    const res = await fetch(forecastUrl(court), { signal: ctrl.signal })
    // 204: no forecast here. Anything that isn't JSON (a static host answering with index.html) is the same.
    if (res.status !== 200 || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const body = (await res.json()) as Forecast
    return body && Array.isArray(body.hours) && body.hours.length > 0 ? body : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The forecast for one court (the event page). `undefined` while loading, `null` when there is none. */
export function useForecast(court: ForecastCourt | null, enabled = true): Forecast | null | undefined {
  const key = court && enabled ? forecastKey(court) : null
  const { data } = useQuery(key, () => fetchForecast(court as ForecastCourt), { staleMs: STALE.forecast })
  return data
}

/**
 * Chip summaries for the feed, by event id. Only events that can show one
 * (sand/grass, not cancelled, within 7 days) are looked at. Feed rows don't
 * carry coordinates (`get_feed_span` leaves them out), so those are read in one
 * `events` query for just these ids; then one forecast request per distinct
 * court, through the same per-court cache the event page reads.
 */
export function useFeedForecasts(events: EventWithDetails[]): Map<string, ForecastSummary> {
  // Re-evaluated with the feed; a minute's drift at the 7-day edge doesn't matter.
  const now = Date.now()
  const candidates = useMemo(
    () => events.filter(e => forecastWindow(e, now) === 'show'),
    [events],
  )

  const missingIds = useMemo(
    () => [...new Set(candidates.filter(e => e.latitude === undefined || e.longitude === undefined).map(e => e.id))].sort(),
    [candidates],
  )
  const { data: coords } = useQuery(
    missingIds.length > 0 ? queryKey(FORECAST_PREFIX, 'coords', missingIds.join(',')) : null,
    async () => {
      const { data, error } = await supabase.from('events').select('id, latitude, longitude').in('id', missingIds)
      if (error) throw error
      return Object.fromEntries((data ?? []).map(r => [r.id, { latitude: r.latitude, longitude: r.longitude }])) as
        Record<string, { latitude: number | null; longitude: number | null }>
    },
    { staleMs: STALE.feed },
  )

  const courtsByEvent = useMemo(() => {
    const out = new Map<string, ForecastCourt>()
    for (const e of candidates) {
      const court = eventCourt(e.latitude !== undefined && e.longitude !== undefined ? e : coords?.[e.id] ?? {})
      if (court) out.set(e.id, court)
    }
    return out
  }, [candidates, coords])

  const courts = useMemo(() => {
    const byId = new Map<string, ForecastCourt>()
    courtsByEvent.forEach(c => byId.set(courtId(c), c))
    return [...byId.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [courtsByEvent])

  const { data: forecasts } = useQuery(
    courts.length > 0 ? queryKey(FORECAST_PREFIX, 'feed', courts.map(([id]) => id).join('|')) : null,
    async () => {
      await Promise.all(courts.map(([, c]) => prefetchQuery(forecastKey(c), () => fetchForecast(c), { staleMs: STALE.forecast })))
      return Object.fromEntries(courts.map(([id, c]) => [id, getQueryData<Forecast | null>(forecastKey(c)) ?? null])) as
        Record<string, Forecast | null>
    },
    { staleMs: STALE.forecast },
  )

  return useMemo(() => {
    const out = new Map<string, ForecastSummary>()
    if (!forecasts) return out
    for (const e of candidates) {
      const court = courtsByEvent.get(e.id)
      const forecast = court ? forecasts[courtId(court)] : null
      if (!forecast) continue
      const summary = forecastSummary(pickForecastHours(forecast.hours, e.event_date, e.duration_minutes))
      if (summary) out.set(e.id, summary)
    }
    return out
  }, [candidates, courtsByEvent, forecasts])
}
