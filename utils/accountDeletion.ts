import type { AccountDeletionPlan } from '../types'

/** Must match REAUTH_MAX_AGE_SECONDS in supabase/functions/_shared/accountDeletion.ts (the server decides). */
export const REAUTH_MAX_AGE_SECONDS = 10 * 60

/** True when deleting the account deletes or hands over nothing beyond the person's own data. */
export function deletionPlanIsEmpty(plan: Pick<AccountDeletionPlan, 'clubs' | 'tournaments' | 'events' | 'past_events_kept'>): boolean {
  return plan.clubs.length === 0 && plan.tournaments.length === 0 && plan.events.length === 0 && plan.past_events_kept === 0
}

/**
 * Seconds since the person last signed in, from the access token's `amr` claim
 * (kept across refreshes), or null when unknown. Only used to ask for a fresh
 * sign-in up front; the delete-account function enforces it.
 */
export function secondsSinceSignIn(accessToken: string | null | undefined, nowSeconds: number): number | null {
  const part = accessToken?.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const amr = (JSON.parse(atob(b64)) as { amr?: { timestamp?: number }[] }).amr
    const times = (Array.isArray(amr) ? amr : []).map(a => Number(a?.timestamp)).filter(Number.isFinite)
    return times.length ? nowSeconds - Math.max(...times) : null
  } catch {
    return null
  }
}

/** Whether the confirm screen should ask the person to sign in again before deleting. */
export function needsRecentSignIn(accessToken: string | null | undefined, nowSeconds: number): boolean {
  const age = secondsSinceSignIn(accessToken, nowSeconds)
  // A little margin so the check doesn't pass here and fail on the server.
  return age === null || age > REAUTH_MAX_AGE_SECONDS - 60
}
