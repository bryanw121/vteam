/**
 * Shared request authentication for edge functions that are NOT called by a
 * signed-in user (Database Webhooks, pg_cron). Those functions are deployed
 * with verify_jwt = false (see supabase/config.toml), so this is the only
 * thing standing between the public internet and a service-role client.
 *
 * A request is accepted when EITHER
 *   - `Authorization: Bearer <token>` equals SUPABASE_SERVICE_ROLE_KEY, or
 *   - `x-webhook-secret: <secret>` equals WEBHOOK_SECRET (optional secret).
 *
 * `isAuthorized` is a pure function with no Deno globals so jest can import
 * it (__tests__/edgeWebhookAuth.test.ts). Keep it that way: no `Deno` at
 * module top level and no imports from URLs in this file.
 */

export type WebhookEnv = {
  serviceRoleKey?: string
  webhookSecret?: string
}

/** Minimal slice of `Headers` so tests and Deno can both pass the real thing. */
type HeaderReader = { get(name: string): string | null }

/**
 * Constant-time string comparison. Walks the longer of the two byte arrays so
 * the time taken does not depend on where (or whether) they differ, and folds
 * the length difference into the result instead of returning early.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  const len = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export function isAuthorized(headers: HeaderReader, env: WebhookEnv): boolean {
  const bearer = headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const secret = headers.get('x-webhook-secret')?.trim()

  // Unset or empty env values never match, even against an empty header.
  // Both comparisons always run so a miss on one does not skip the other.
  const bearerOk = !!env.serviceRoleKey && !!bearer && timingSafeEqual(bearer, env.serviceRoleKey)
  const secretOk = !!env.webhookSecret && !!secret && timingSafeEqual(secret, env.webhookSecret)
  return bearerOk || secretOk
}

/** Read an env var without referencing the `Deno` global directly (keeps tsc/jest happy). */
function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno
  return deno?.env.get(name)
}

/**
 * Returns a 401 Response when the request is not authorized, otherwise null.
 *   const denied = requireWebhookAuth(req, deps.env)
 *   if (denied) return denied
 * `env` defaults to Deno.env; handlers pass their deps' reader so tests can script it.
 */
export function requireWebhookAuth(req: Request, env: (name: string) => string | undefined = readEnv): Response | null {
  const ok = isAuthorized(req.headers, {
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    webhookSecret: env('WEBHOOK_SECRET'),
  })
  if (ok) return null
  return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } })
}
