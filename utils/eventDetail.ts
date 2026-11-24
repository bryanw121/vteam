import type { JoinIntentOutcome, JoinOffer, MentionUser, PendingActionTake, Profile } from '../types'
import { profileDisplayName } from './index'
import { shouldOfferJoin } from './pendingAction'
import { formatDate, formatTime } from './dateFormat'

/**
 * Pure rules behind the event screen (#354): which tabs mount first, who can be
 * @mentioned, what a returning guest's pending Join becomes, and the join sheet's
 * "when" line. The hooks in hooks/event/ hold the state; these hold the decisions.
 */

/** Event tabs, in pager order. */
export const EVENT_TAB = { details: 0, people: 1, discussion: 2, cheers: 3 } as const

/** Tabs mounted on open: Details always, the one the link opened, and People next to Details (prefetched). */
export function initialMountedTabs(start: number): Set<number> {
  const initial = new Set<number>([EVENT_TAB.details, start])
  if (start === EVENT_TAB.details) initial.add(EVENT_TAB.people)
  return initial
}

/** Details and People scroll the document on mobile web; Discussion and Cheers keep the app-shell layout. */
export function usesDocScroll(isMobileWeb: boolean, tab: number): boolean {
  return isMobileWeb && (tab === EVENT_TAB.details || tab === EVENT_TAB.people)
}

type MaybeProfile = Profile | null | undefined

/**
 * People who can be @mentioned in the discussion (attendees, co-hosts, the host;
 * not the viewer, each once) and username → id for tappable mentions (the
 * viewer included, so their own name still links).
 */
export function mentionTargets(profiles: MaybeProfile[], viewerId: string | null): { mentionableUsers: MentionUser[]; usernameToId: Map<string, string> } {
  const seen = new Set<string>()
  const mentionableUsers: MentionUser[] = []
  const usernameToId = new Map<string, string>()
  for (const p of profiles) {
    if (!p) continue
    if (p.username) usernameToId.set(p.username, p.id)
    if (seen.has(p.id) || p.id === viewerId) continue
    seen.add(p.id)
    mentionableUsers.push({ id: p.id, username: p.username, displayName: profileDisplayName(p) })
  }
  return { mentionableUsers, usernameToId }
}

/**
 * A signed-in viewer is back on the game a guest Join started from (#229): what
 * to do with the saved action. `offer` opens the sheet; `outcome` is only
 * recorded (`join_intent_resumed`); null means there was nothing saved.
 */
export function joinIntentOnReturn(
  taken: PendingActionTake,
  status: Parameters<typeof shouldOfferJoin>[0],
  event: Parameters<typeof shouldOfferJoin>[1],
): { offer: JoinOffer } | { outcome: Extract<JoinIntentOutcome, 'expired' | 'skipped'> } | null {
  if (!taken) return null
  if (taken.status === 'expired') return { outcome: 'expired' }
  const offer = shouldOfferJoin(status, event)
  return offer ? { offer } : { outcome: 'skipped' }
}

/** "Sat 4:00 PM" for the join sheet, from the event's start in ms. */
export function joinIntentWhen(startMs: number): string {
  const start = new Date(startMs)
  return `${formatDate(start, { weekday: 'short' })} ${formatTime(start, { hour: 'numeric', minute: '2-digit', hour12: true })}`
}
