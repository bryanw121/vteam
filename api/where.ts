import { nearestFeedRegion } from '../utils/feedRegion'

/**
 * `GET /api/where` → `{ region: "dallas" | null }`: the covered city nearest the caller, worked out
 * from the approximate location Vercel attaches to every request (`x-vercel-ip-latitude` /
 * `-longitude`, looked up from the caller's network address). Used when a viewer hasn't picked a
 * city and their profile's home city isn't one vteam covers, so a guest in Dallas opens on Dallas.
 *
 * Nothing is stored or logged, and only the region id is sent back, never coordinates. No
 * Supabase, no secrets. The answer depends on who asks, so it is never cached by the CDN.
 * `null` when the location is unknown or too far from any covered city (the app keeps Austin).
 */
export const config = { runtime: 'edge' }

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

const num = (v: string | null): number => (v != null && v.trim() !== '' ? Number(v) : NaN)

export default function handler(req: Request): Response {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { 'Access-Control-Allow-Origin': '*', Allow: 'GET, HEAD' } })
  }
  const region = nearestFeedRegion(num(req.headers.get('x-vercel-ip-latitude')), num(req.headers.get('x-vercel-ip-longitude')))
  return new Response(req.method === 'HEAD' ? null : JSON.stringify({ region }), { status: 200, headers: HEADERS })
}
