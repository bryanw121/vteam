import { supabaseRestConfig } from './_lib/eventPreview'
import { STARTUP_CACHE_CONTROL, STARTUP_ERROR_CACHE_CONTROL, fetchStartupConfig } from './_lib/startup'

/**
 * `GET /api/startup` (#216): the update check rows and the ad lists in one
 * CDN-cached response (60 s fresh, served stale for a day while it refreshes in
 * the background), so a cold database only has to answer the feed. Anon reads,
 * the same rows RLS gives the app. The app falls back to reading Supabase
 * directly on anything but a 200.
 */
export const config = { runtime: 'edge' }

const CORS = { 'Access-Control-Allow-Origin': '*' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...CORS, Allow: 'GET, HEAD' } })
  }
  const cfg = supabaseRestConfig(process.env)
  if (!cfg) return new Response(null, { status: 503, headers: { ...CORS, 'Cache-Control': STARTUP_ERROR_CACHE_CONTROL } })
  try {
    const body = await fetchStartupConfig(cfg)
    return new Response(req.method === 'HEAD' ? null : JSON.stringify(body), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': STARTUP_CACHE_CONTROL },
    })
  } catch (err) {
    console.error('api/startup: could not read the config', err)
    return new Response(null, { status: 502, headers: { ...CORS, 'Cache-Control': STARTUP_ERROR_CACHE_CONTROL } })
  }
}
