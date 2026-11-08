/**
 * Pure pieces of the login-with-username function, kept free of Deno globals
 * so jest can test them (__tests__/usernameLogin.test.ts).
 */

/** The one message for an unknown username and a wrong password alike. */
export const GENERIC_LOGIN_ERROR = 'Incorrect username or password'

/**
 * Every failed or successful attempt takes at least this long, so response
 * time does not reveal whether the username exists (an unknown username would
 * otherwise return before the password check).
 */
export const MIN_RESPONSE_MS = 700

export type LoginInput = { username: string; password: string }

/** Normalized input, or null when the body is not a plausible login. */
export function parseLoginBody(body: unknown): LoginInput | null {
  if (!body || typeof body !== 'object') return null
  const { username, password } = body as Record<string, unknown>
  if (typeof username !== 'string' || typeof password !== 'string') return null
  const u = username.trim().toLowerCase()
  if (!u || u.length > 64 || u.includes('@')) return null
  if (!password || password.length > 128) return null
  return { username: u, password }
}

/** How long to wait before answering, given when the request started. */
export function remainingDelayMs(startedAt: number, now: number, jitterMs: number): number {
  return Math.max(0, MIN_RESPONSE_MS + jitterMs - (now - startedAt))
}

/** Sign-in attempts allowed per window (#11). Generous: CI signs the e2e account in often. */
export const LOGIN_LIMITS = {
  windowSeconds: 15 * 60,
  perIp: 100,
  perUsername: 30,
} as const

export const TOO_MANY_ATTEMPTS = 'Too many sign-in attempts. Please wait a few minutes and try again.'

/** The caller's IP as the gateway reports it (first X-Forwarded-For hop), or null. */
export function clientIp(forwardedFor: string | null): string | null {
  const first = (forwardedFor ?? '').split(',')[0]?.trim()
  return first ? first.slice(0, 64) : null
}

/**
 * The project's secret API key (`sb_secret_...`) from SUPABASE_SECRET_KEYS (a
 * JSON object keyed by key name; Supabase sets it once secret keys exist under
 * Settings > API Keys). Null when absent or malformed. Supabase Auth only
 * honours `Sb-Forwarded-For` on requests made with a secret key.
 */
export function secretKeyFromEnv(raw: string | undefined, name = 'default'): string | null {
  if (!raw) return null
  try {
    const key = (JSON.parse(raw) as Record<string, unknown>)[name]
    return typeof key === 'string' && key.startsWith('sb_secret_') ? key : null
  } catch {
    return null
  }
}

/** What Supabase Auth's password grant returned, reduced to what the function answers with. */
export type PasswordGrantOutcome =
  | { kind: 'session'; session: { access_token: string; refresh_token: string; expires_in: number; expires_at?: number; token_type: string } }
  | { kind: 'rejected' }

/**
 * Map an Auth /token response to an outcome. Every failure, including Auth's
 * own 429, becomes `rejected`, which the function answers with the generic
 * error: Auth only ever sees real usernames, so a distinct 429 would reveal
 * that the username exists.
 */
export function passwordGrantOutcome(status: number, body: unknown): PasswordGrantOutcome {
  const b = (body ?? {}) as Record<string, unknown>
  if (status === 200 && typeof b.access_token === 'string' && typeof b.refresh_token === 'string') {
    return {
      kind: 'session',
      session: {
        access_token: b.access_token,
        refresh_token: b.refresh_token,
        expires_in: Number(b.expires_in ?? 3600),
        expires_at: typeof b.expires_at === 'number' ? b.expires_at : undefined,
        token_type: typeof b.token_type === 'string' ? b.token_type : 'bearer',
      },
    }
  }
  return { kind: 'rejected' }
}
