/**
 * Edge Function: read-roster
 *
 * Scorekeeper "Scan roster": the app sends one photo of a roster, lineup card or team list;
 * a vision model reads jersey numbers and names, and the cleaned list comes back for the
 * scorer to review before anything is added. The photo is not stored.
 *
 * Responses:
 *   200 { teamName, players: [{ number, name?, libero?, captain? }] }
 *   400 bad body          401 no / bad user JWT          429 too many scans this hour
 *   503 { error: 'scan not configured' }   OPENAI_API_KEY is not set
 *   502 the model provider failed
 *
 * Secrets: OPENAI_API_KEY (required), ALLOWED_ORIGINS (optional CORS allow-list).
 * Deployed with verify_jwt = true (supabase/config.toml).
 */

import { getServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { allowScan, OPENAI_URL, openaiPayload, parseScanRequest, rosterFromCompletion } from '../_shared/rosterScan.ts'

const scans = new Map<string, number[]>()

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { error: 'sign in required' })

  let parsed
  try {
    parsed = parseScanRequest(await req.json())
  } catch {
    return json(400, { error: 'invalid JSON' })
  }
  if (typeof parsed === 'string') return json(400, { error: parsed })

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) {
    console.warn('[read-roster] OPENAI_API_KEY is not set')
    return json(503, { error: 'scan not configured' })
  }

  try {
    const { data: auth, error: authError } = await getServiceClient().auth.getUser(jwt)
    if (authError || !auth?.user) return json(401, { error: 'sign in required' })
    if (!allowScan(scans, auth.user.id, Date.now())) return json(429, { error: 'too many scans, try again later' })

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(openaiPayload(parsed)),
    })
    if (!res.ok) {
      console.error('[read-roster] provider error', res.status, (await res.text().catch(() => '')).slice(0, 500))
      return json(502, { error: 'could not read the photo' })
    }
    return json(200, rosterFromCompletion(await res.json()))
  } catch (err) {
    console.error('[read-roster]', err)
    return json(500, { error: 'internal error' })
  }
})
