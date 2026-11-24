// Pure rules behind the event screen's flows (#354). The hooks in hooks/event/ hold the
// state; these decide what it should be, so they can be tested without rendering.
import type {
  AttendanceStatus,
  EventWithDetails,
  JoinIntentDecision,
  JoinIntentStatus,
  LeaveSheetContent,
  MentionSource,
  MentionUser,
  PendingActionTake,
  Profile,
} from '../types'
import { profileDisplayName } from './index'
import { shouldOfferJoin } from './pendingAction'
import { hostWillBeTold, leaveConsequences, leaveSubtitle } from './leaveConsequences'
import { formatDate, formatTime } from './dateFormat'
import { parseEventDate } from './eventDate'

/** Everyone who could be @mentioned, in order: attendees, co-hosts, the host (with repeats). */
export function mentionProfiles(src: MentionSource): Profile[] {
  const list: Profile[] = [...src.attendees]
  src.cohostProfiles.forEach(p => { if (p) list.push(p) })
  if (src.host) list.push(src.host)
  return list
}

/** The @mention picker: each person once, never the viewer. */
export function mentionableUsers(profiles: readonly (Profile | null | undefined)[], viewerId: string | null): MentionUser[] {
  const seen = new Set<string>()
  const out: MentionUser[] = []
  for (const p of profiles) {
    if (!p || seen.has(p.id) || p.id === viewerId) continue
    seen.add(p.id)
    out.push({ id: p.id, username: p.username, displayName: profileDisplayName(p) })
  }
  return out
}

/** username → profile id, so a mention in a comment opens that profile. */
export function usernameIds(profiles: readonly (Profile | null | undefined)[]): Map<string, string> {
  const m = new Map<string, string>()
  profiles.forEach(p => { if (p?.username) m.set(p.username, p.id) })
  return m
}

/**
 * A guest's saved Join (#229), now that they're signed in and the event has loaded:
 * offer the same signup the footer would, or say why not.
 */
export function joinIntentDecision(
  taken: PendingActionTake,
  status: JoinIntentStatus,
  event: { cancelled: boolean; over: boolean; requiresApproval: boolean },
): JoinIntentDecision {
  if (!taken) return { outcome: 'none' }
  if (taken.status === 'expired') return { outcome: 'expired' }
  const offer = shouldOfferJoin(status, event)
  return offer ? { outcome: 'offer', offer } : { outcome: 'skipped' }
}

/** "Sat 4:00 PM" for the join-intent sheet. */
export function joinIntentWhen(eventDate: string | null | undefined): string {
  if (!eventDate) return ''
  const start = parseEventDate(eventDate)
  return `${formatDate(start, { weekday: 'short' })} ${formatTime(start, { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

/**
 * The leave sheet's content when it opens (#171). The reason chips show only when the
 * host is told anyway (a late dropout) and the viewer isn't the host.
 */
export function leaveSheetContent(
  event: EventWithDetails,
  status: Pick<AttendanceStatus, 'count' | 'isFull' | 'spotsLeft' | 'waitlistCount'>,
  viewer: { userId: string | null; isHostOrCohost: boolean; paid: boolean; hostName: string },
  now: number,
): LeaveSheetContent {
  const lines = leaveConsequences({ ...event, hostName: viewer.hostName }, status, { isHostOrCohost: viewer.isHostOrCohost, paid: viewer.paid }, now)
  return {
    subtitle: leaveSubtitle(event.event_date, now),
    lines,
    showReason: lines.some(l => l.kind === 'hostNotified') && !!event.created_by && event.created_by !== viewer.userId,
  }
}

/** `leave_sheet_shown` props. */
export function leaveSheetMetric(event: EventWithDetails, status: Pick<AttendanceStatus, 'isFull'>, paid: boolean, now: number) {
  return { full: status.isFull, within24h: hostWillBeTold(event.event_date, now), paid }
}
