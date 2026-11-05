/**
 * Edge Function: places-proxy
 *
 * Proxies Google Places API requests server-side to avoid CORS issues
 * and keep the API key out of the client bundle.
 *
 * POST body:
 *   { action: 'autocomplete', input: string, sessiontoken: string }
 *   { action: 'details', place_id: string, sessiontoken: string }
 *
 * Set GOOGLE_MAPS_KEY in Supabase Dashboard → Edge Functions → Secrets
 *
 * Auth: deployed with verify_jwt = true (supabase/config.toml), so the gateway
 * rejects calls without a valid user JWT. supabase.functions.invoke sends one.
 *
 * CORS: set ALLOWED_ORIGINS (comma-separated, e.g.
 * "https://vteam.example.com,http://localhost:8081") to restrict browser callers.
 * Unset keeps the old behaviour (`*`). Native apps send no Origin header and are
 * unaffected either way.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a stubbed network.
 */

import type { Deps } from '../_shared/deps.ts'

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'

function corsHeaders(req: Request, env: Deps['env']): Record<string, string> {
  const allowed = (env('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  if (!allowed.length) {
    return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': ALLOW_HEADERS }
  }
  const headers: Record<string, string> = { 'Access-Control-Allow-Headers': ALLOW_HEADERS, Vary: 'Origin' }
  const origin = req.headers.get('Origin')
  // A non-listed origin gets no Allow-Origin header, so the browser blocks the response.
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

const LOCATION  = '30.2672,-97.7431' // Austin, TX
const RADIUS    = '50000'

export function createHandler(deps: Pick<Deps, 'fetch' | 'env'>) {
  return async (req: Request): Promise<Response> => {
    const CORS_HEADERS = corsHeaders(req, deps.env)
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: CORS_HEADERS })
    }

    const GOOGLE_KEY = deps.env('GOOGLE_MAPS_KEY')
    if (!GOOGLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing GOOGLE_MAPS_KEY secret' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    let body: { action: string; input?: string; place_id?: string; sessiontoken: string }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    try {
      let url: string

      if (body.action === 'autocomplete' && body.input) {
        // NOTE: `types` is deliberately omitted. The legacy Autocomplete API accepts
        // exactly ONE type collection and they cannot be combined, so the previous
        // `types: 'establishment'` made street addresses impossible to return —
        // searching "1100 Congress Ave" found nothing while "Gregory Gym" worked.
        // Omitting it returns establishments AND addresses, which is what a venue
        // picker needs. Do not set it back to a single collection.
        const params = new URLSearchParams({
          input: body.input,
          location: LOCATION,
          radius: RADIUS,
          components: 'country:us',
          sessiontoken: body.sessiontoken,
          key: GOOGLE_KEY,
        })
        url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
      } else if (body.action === 'details' && body.place_id) {
        const params = new URLSearchParams({
          place_id: body.place_id,
          fields: 'geometry',
          sessiontoken: body.sessiontoken,
          key: GOOGLE_KEY,
        })
        url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`
      } else {
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      const res  = await deps.fetch(url)
      const data = await res.json()

      return new Response(JSON.stringify(data), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    } catch (err) {
      // Never echo the error: fetch errors can name the request URL, which
      // carries the key. Log it with the key redacted instead.
      console.error('places-proxy: Google request failed', String(err).replaceAll(GOOGLE_KEY, '[redacted]'))
      return new Response(JSON.stringify({ error: 'Places request failed' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
  }
}
