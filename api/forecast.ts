import { FORECAST_CACHE_CONTROL, FORECAST_EMPTY_CACHE_CONTROL } from '../constants/weather'
import { fetchNwsForecast, parseCourt } from './_lib/forecast'

/**
 * `GET /api/forecast?lat=30.27&lng=-97.77` (#165): the hourly forecast for an
 * outdoor court, from the National Weather Service, trimmed to
 * `{ updatedAt, hours: [{ t, tempF, pop, windMph, short, icon, rh }] }`.
 *
 * A proxy rather than the browser calling NWS directly: browsers can't set the
 * User-Agent NWS asks for, and the CDN cache (`s-maxage=1800`) collapses every
 * viewer of a court into one upstream call per 30 minutes. Native uses the
 * same endpoint. Public, read-only, no Supabase and no secrets (the contact in
 * the User-Agent comes from `NWS_CONTACT`).
 *
 * Coordinates are rounded to 2 decimals before the call, so every event at a
 * court shares one cache entry. Bad coordinates → 400; no forecast (outside
 * the US, NWS error, timeout) → 204, cached for 10 minutes. The app hides the
 * forecast on anything but a 200.
 */
export const config = { runtime: 'edge' }

const CORS = { 'Access-Control-Allow-Origin': '*' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...CORS, Allow: 'GET, HEAD' } })
  }
  const url = new URL(req.url)
  const court = parseCourt(url.searchParams.get('lat'), url.searchParams.get('lng'))
  if (!court) {
    return new Response(null, { status: 400, headers: { ...CORS, 'Cache-Control': FORECAST_EMPTY_CACHE_CONTROL } })
  }
  const forecast = await fetchNwsForecast(court, fetch, process.env)
  if (!forecast) {
    return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': FORECAST_EMPTY_CACHE_CONTROL } })
  }
  return new Response(req.method === 'HEAD' ? null : JSON.stringify(forecast), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': FORECAST_CACHE_CONTROL },
  })
}
