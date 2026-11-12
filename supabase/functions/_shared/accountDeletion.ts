/**
 * Pure pieces of the delete-account function (no Deno globals; jest imports it).
 */

/** What the person must type on the confirm screen, sent along as proof of intent. */
export const DELETE_CONFIRMATION = 'DELETE'

/** The person must have signed in (password or email code) within this many seconds. */
export const REAUTH_MAX_AGE_SECONDS = 10 * 60

export type DeleteRequest = { confirm: string; planHash: string }

/** The request body, or null unless it carries the typed confirmation and the preview's hash. */
export function parseDeleteRequest(body: unknown): DeleteRequest | null {
  if (!body || typeof body !== 'object') return null
  const { confirm, planHash } = body as Record<string, unknown>
  if (confirm !== DELETE_CONFIRMATION) return null
  if (typeof planHash !== 'string' || !/^[0-9a-f]{32}$/.test(planHash)) return null
  return { confirm, planHash }
}

/** Storage buckets whose `<uid>/...` folder belongs to the person (uploads they made). */
export const USER_FOLDER_BUCKETS = ['avatars', 'chat-images'] as const

/** Bearer token from an Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '')
  return m ? m[1].trim() : null
}

/** Payload of a JWT (no signature check: the gateway and auth.getUser verify the token). */
export function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    return JSON.parse(atob(b64)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * When the person last proved who they are (Unix seconds), from the JWT's `amr`
 * claim: Supabase Auth records each sign-in method with a timestamp, and keeps
 * it across token refreshes (unlike `iat`). Null when absent.
 */
export function lastSignInAt(payload: Record<string, unknown> | null): number | null {
  const amr = payload?.amr
  if (!Array.isArray(amr)) return null
  const times = amr
    .map(entry => (entry && typeof entry === 'object' ? Number((entry as Record<string, unknown>).timestamp) : NaN))
    .filter(n => Number.isFinite(n))
  return times.length ? Math.max(...times) : null
}

/** Whether a sign-in at `signedInAt` is recent enough to delete the account at `nowSeconds`. */
export function isRecentSignIn(signedInAt: number | null, nowSeconds: number): boolean {
  return signedInAt !== null && nowSeconds - signedInAt <= REAUTH_MAX_AGE_SECONDS
}

/** Error codes the app reacts to. */
export const DELETE_ERRORS = {
  reauthRequired: 'reauth_required',
  planChanged: 'plan_changed',
} as const
