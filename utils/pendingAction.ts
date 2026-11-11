import { Platform } from 'react-native'
import { resolveJoinAction } from '../hooks/event/derive'
import type { AttendanceStatus, JoinOffer, PendingAction, PendingActionTake } from '../types'

/**
 * The join a guest started (#229). They tap Join, sign up or in, and come back
 * to the same game with one tap to confirm. Kept in memory and mirrored to
 * sessionStorage on web (the Google sign-in there is a full-page redirect),
 * like the post-sign-in redirect in `authGate.ts`. Expires after 30 minutes;
 * cleared on sign-out.
 */
export const PENDING_ACTION_TTL_MS = 30 * 60_000
const STORAGE_KEY = 'vteam.pendingAction'
let pending: PendingAction | null = null
/** Set once a resumed join was offered: player setup waits until after it (`usePlayerSetupGate`). */
let resumedThisSession = false

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function isPendingAction(v: unknown): v is PendingAction {
  const a = v as PendingAction | null
  return !!a && a.kind === 'join' && typeof a.eventId === 'string' && typeof a.title === 'string'
    && typeof a.startsAt === 'string' && typeof a.at === 'number'
}

function read(): PendingAction | null {
  if (pending) return pending
  try {
    const raw = webStorage()?.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : null
    pending = isPendingAction(parsed) ? parsed : null
  } catch {
    pending = null
  }
  return pending
}

export function setPendingAction(action: PendingAction): void {
  pending = action
  try { webStorage()?.setItem(STORAGE_KEY, JSON.stringify(action)) } catch { /* memory copy still works */ }
}

export function clearPendingAction(): void {
  pending = null
  try { webStorage()?.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** The saved action if it is still fresh (the sign-up screen's context card). Doesn't clear it. */
export function peekPendingAction(now: number = Date.now()): PendingAction | null {
  const a = read()
  return a && now - a.at <= PENDING_ACTION_TTL_MS ? a : null
}

/**
 * On the event page, once signed in: hand over (and clear) the action saved for
 * this event. Another event's action is left alone.
 */
export function takePendingAction(eventId: string, now: number = Date.now()): PendingActionTake {
  const a = read()
  if (!a || a.eventId !== eventId) return null
  clearPendingAction()
  if (now - a.at > PENDING_ACTION_TTL_MS) return { status: 'expired' }
  resumedThisSession = true
  return { status: 'ok', action: a }
}

/** Player setup waits while a join is pending, and for the rest of the session once one resumed (it shows on the event instead). */
export function joinFlowHoldsPlayerSetup(now: number = Date.now()): boolean {
  return resumedThisSession || peekPendingAction(now) !== null
}

/**
 * Pure: what the "Grab your spot?" sheet offers, using the join footer's own
 * rules (`resolveJoinAction`), so paid, approval and waitlist rules match the
 * button. Nothing when they are already in, waitlisted, requested or denied,
 * host the game, or it is over or cancelled.
 */
export function shouldOfferJoin(
  status: Pick<AttendanceStatus, 'isAttending' | 'isWaitlisted' | 'isRequested' | 'isDenied' | 'isFull' | 'isOwner'>,
  event: { cancelled: boolean; over: boolean; requiresApproval: boolean },
): JoinOffer | null {
  if (event.cancelled || event.over || status.isOwner) return null
  const action = resolveJoinAction({ ...status, requiresApproval: event.requiresApproval })
  return action === 'join' || action === 'waitlist' || action === 'request' ? action : null
}

/** Test-only. */
export function __resetPendingAction(): void {
  pending = null
  resumedThisSession = false
}
