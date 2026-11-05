/**
 * Edge Function: login-with-username
 *
 * Signs a user in by username + password without ever telling the caller the
 * account's email. The username is resolved to an email here, with the service
 * role (get_email_by_username is not executable by clients), and the password
 * is checked by Supabase Auth. The response is either the new session or a
 * generic "Incorrect username or password", identical for an unknown username,
 * a wrong password and any Auth-side failure (including Auth's own 429, which
 * only real usernames can reach), and padded to a minimum duration so timing
 * does not tell them apart either.
 *
 * POST { username, password } -> 200 { access_token, refresh_token, expires_in, expires_at, token_type }
 *                              -> 401 { error: 'Incorrect username or password' }
 *                              -> 429 { error } from this function's own limiter, which counts
 *                                 every attempt before the lookup (existing username or not)
 *
 * The app then calls supabase.auth.setSession({ access_token, refresh_token }).
 *
 * Rate limits (public.check_rate_limit): LOGIN_LIMITS.perUsername attempts per
 * username and LOGIN_LIMITS.perIp per IP every 15 minutes.
 *
 * IP forwarding: every sign-in reaches Supabase Auth from this function, so
 * without forwarding Auth's per-IP limit would count all users as one IP (one
 * attacker could lock everyone out). When the project has a secret API key
 * (SUPABASE_SECRET_KEYS) the password grant is sent with it plus
 * `Sb-Forwarded-For: <caller IP>`, and Auth counts the caller's IP — provided
 * "IP address forwarding" is enabled (Authentication > Rate Limits, or the
 * management API's security_sb_forwarded_for_enabled). Without a secret key the
 * function falls back to the anon key (no forwarding) and logs a warning.
 *
 * Deployed with verify_jwt = false (supabase/config.toml): the caller is not
 * signed in yet.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a fake database, a stubbed Auth endpoint and an instant clock.
 */

import { corsHeaders } from '../_shared/cors.ts'
import type { Deps } from '../_shared/deps.ts'
import {
  clientIp,
  GENERIC_LOGIN_ERROR,
  LOGIN_LIMITS,
  parseLoginBody,
  passwordGrantOutcome,
  remainingDelayMs,
  secretKeyFromEnv,
  TOO_MANY_ATTEMPTS,
} from '../_shared/usernameLogin.ts'

const UNAVAILABLE = 'Sign-in is unavailable right now. Please try again.'

/** Timing hooks, so tests need not wait out the minimum response time. */
export type LoginTiming = {
  sleep: (ms: number) => Promise<void>
  /** Extra padding in ms, 0..150 in production. */
  jitterMs: () => number
}

const realTiming: LoginTiming = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  jitterMs: () => Math.floor(Math.random() * 150),
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}

export function createHandler(deps: Deps, timing: LoginTiming = realTiming) {
  let warnedNoForwarding = false

  /** Password grant against Supabase Auth, forwarding the caller's IP when a secret key exists. */
  async function passwordGrant(email: string, password: string, ip: string | null) {
    const url = deps.env('SUPABASE_URL')
    const secret = secretKeyFromEnv(deps.env('SUPABASE_SECRET_KEYS'))
    const anon = deps.env('SUPABASE_ANON_KEY')
    if (!url || (!secret && !anon)) throw new Error('SUPABASE_URL / API key are not set')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (secret) {
      // Secret keys go on `apikey` only (they are not JWTs).
      headers.apikey = secret
      if (ip) headers['Sb-Forwarded-For'] = ip
    } else {
      headers.apikey = anon as string
      headers.Authorization = `Bearer ${anon}`
      if (!warnedNoForwarding) {
        warnedNoForwarding = true
        console.warn("[login-with-username] no secret API key: Supabase Auth sees this function's IP for every sign-in (see README)")
      }
    }
    const res = await deps.fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    })
    const body = await res.json().catch(() => null)
    if (res.status === 429) console.warn('[login-with-username] Supabase Auth rate-limited a sign-in')
    return passwordGrantOutcome(res.status, body)
  }

  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, deps.env)
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

    const startedAt = deps.now()
    const finish = async (body: unknown, status: number) => {
      await timing.sleep(remainingDelayMs(startedAt, deps.now(), timing.jitterMs()))
      return json(body, status, cors)
    }

    let input
    try {
      input = parseLoginBody(await req.json())
    } catch {
      input = null
    }
    if (!input) return finish({ error: GENERIC_LOGIN_ERROR }, 401)

    try {
      const service = deps.getClient()
      const ip = clientIp(req.headers.get('x-forwarded-for'))

      // Counted for every attempt, before we know whether the username exists,
      // so this 429 says nothing about which accounts exist.
      const keys: [string, number][] = [[`login_user:${input.username}`, LOGIN_LIMITS.perUsername]]
      if (ip) keys.push([`login_ip:${ip}`, LOGIN_LIMITS.perIp])
      for (const [key, max] of keys) {
        const { data: allowed, error: limitError } = await service.rpc('check_rate_limit', {
          p_key: key,
          p_max: max,
          p_window_seconds: LOGIN_LIMITS.windowSeconds,
        })
        // A broken limiter must not lock everyone out: log and carry on.
        if (limitError) console.error('[login-with-username] rate limit check failed:', limitError.message)
        else if (allowed === false) return finish({ error: TOO_MANY_ATTEMPTS }, 429)
      }

      const { data: email, error: lookupError } = await service.rpc('get_email_by_username', { p_username: input.username })
      if (lookupError) {
        console.error('[login-with-username] lookup failed:', lookupError.message)
        return finish({ error: UNAVAILABLE }, 500)
      }
      if (typeof email !== 'string' || !email) return finish({ error: GENERIC_LOGIN_ERROR }, 401)

      const outcome = await passwordGrant(email, input.password, ip)
      if (outcome.kind !== 'session') return finish({ error: GENERIC_LOGIN_ERROR }, 401)
      return finish(outcome.session, 200)
    } catch (e) {
      console.error('[login-with-username] failed:', (e as Error)?.message)
      return finish({ error: UNAVAILABLE }, 500)
    }
  }
}
