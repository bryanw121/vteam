/**
 * CORS for functions called from the web app (same rules as places-proxy).
 * ALLOWED_ORIGINS: comma-separated browser origins; unset means `*`. Native
 * apps send no Origin header and are unaffected.
 */
const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'

export function corsHeaders(
  req: Request,
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
): Record<string, string> {
  const allowed = (env('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  if (!allowed.length) {
    return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': ALLOW_HEADERS }
  }
  const headers: Record<string, string> = { 'Access-Control-Allow-Headers': ALLOW_HEADERS, Vary: 'Origin' }
  const origin = req.headers.get('Origin')
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
