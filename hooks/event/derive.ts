import type {
  AttendanceStatus,
  EventAttendeeWithProfile,
  EventGuest,
  EventWithDetails,
  JoinAction,
  JoinActionState,
  Profile,
  TeamAssignment,
  RandomizeResult, TeamSource,
} from '../../types'
import { eventAttendeeRows, normalizeVolleyballPositions, normalizeVolleyballSkillLevel } from '../../utils'

/**
 * Pure derivations for the event detail screen. Everything the screen used to
 * keep in parallel `useState`s (attendees, waitlist, requests, adder names,
 * team assignments) is computed from the cached rows instead, so an optimistic
 * `setQueryData` on one key updates every view of it.
 */

/** `event_attendees` rows from the detail embed (empty for a list-shaped count embed). */
export function attendeeRowsWithProfiles(event: EventWithDetails | undefined): EventAttendeeWithProfile[] {
  if (!event) return []
  return eventAttendeeRows(event) as EventAttendeeWithProfile[]
}

export function profileFromAttendeeEmbed(a: EventAttendeeWithProfile): Profile | null {
  const p = a.profiles
  if (!p) return null
  return {
    id: p.id,
    username: p.username,
    first_name: p.first_name,
    last_name: p.last_name,
    avatar_url: p.avatar_url,
    selected_border: p.selected_border ?? null,
    position: normalizeVolleyballPositions(p.position),
    skill_level: normalizeVolleyballSkillLevel(p.skill_level),
    created_at: '',
  }
}

const byJoinedAt = (a: { joined_at: string }, b: { joined_at: string }) =>
  new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()

function profilesOf(rows: EventAttendeeWithProfile[]): Profile[] {
  return rows.map(profileFromAttendeeEmbed).filter((p): p is Profile => p !== null)
}

/** Split attendee + guest rows into the lists the tabs render. */
export function deriveRoster(event: EventWithDetails | undefined, allGuests: EventGuest[] | undefined) {
  const rows = attendeeRowsWithProfiles(event)
  const attendingRows = rows.filter(a => a.status === 'attending')
  const waitlistRows = rows.filter(a => a.status === 'waitlisted').sort(byJoinedAt)
  const requestedRows = rows.filter(a => a.status === 'requested').sort(byJoinedAt)
  const guests = allGuests ?? []
  const adderUsernames: Record<string, string> = {}
  for (const g of guests) {
    if (g.adder?.username) adderUsernames[g.added_by] = g.adder.username
  }
  return {
    rows,
    attendingRows,
    waitlistRows,
    attendees: profilesOf(attendingRows),
    waitlistProfiles: profilesOf(waitlistRows),
    requestedProfiles: profilesOf(requestedRows),
    attendingGuests: guests.filter(g => g.status === 'attending'),
    waitlistGuests: guests.filter(g => g.status === 'waitlisted'),
    adderUsernames,
  }
}

/** Saved team assignments keyed by user id (attendees) or guest id. */
export function deriveAssignments(
  attendingRows: Array<TeamSource & { user_id: string }>,
  attendingGuests: Array<TeamSource & { id: string }>,
): { assignments: Record<string, TeamAssignment>; maxTeam: number } {
  const assignments: Record<string, TeamAssignment> = {}
  let maxTeam = 1
  const add = (key: string, src: TeamSource) => {
    const team = src.team_number ?? null
    assignments[key] = { team, pinned: src.team_pinned ?? false }
    if (team && team > maxTeam) maxTeam = team
  }
  attendingRows.forEach(a => add(a.user_id, a))
  attendingGuests.forEach(g => add(g.id, g))
  return { assignments, maxTeam }
}

const sameAssignment = (a: TeamAssignment | undefined, b: TeamAssignment | undefined) =>
  a?.team === b?.team && a?.pinned === b?.pinned

/**
 * Three-way merge of the host's unsaved team edits with fresh server state.
 * For each player on the server: keep the local draft if the server value is
 * unchanged since the last sync (`base`), otherwise take the server's. Players
 * no longer on the server drop out; new ones arrive with the server's value.
 */
export function mergeAssignments(
  base: Record<string, TeamAssignment>,
  local: Record<string, TeamAssignment>,
  server: Record<string, TeamAssignment>,
): Record<string, TeamAssignment> {
  const next: Record<string, TeamAssignment> = {}
  for (const key of Object.keys(server)) {
    next[key] = key in local && sameAssignment(base[key], server[key]) ? local[key] : server[key]
  }
  return next
}

/** Shuffle unpinned players into equal teams around the pinned ones. */
export function randomizeAssignments(
  playerIds: string[],
  assignments: Record<string, TeamAssignment>,
  numTeams: number,
  random: () => number = Math.random,
): RandomizeResult {
  const totalPlayers = playerIds.length
  if (totalPlayers % numTeams !== 0) {
    return {
      ok: false,
      title: 'Unequal teams',
      message: `${totalPlayers} players can't be split into ${numTeams} equal teams. Adjust the team count so it divides evenly.`,
    }
  }
  const target = totalPlayers / numTeams

  const pinnedCount: Record<number, number> = {}
  for (let t = 1; t <= numTeams; t++) pinnedCount[t] = 0
  for (const id of playerIds) {
    const a = assignments[id]
    if (a?.pinned && a.team !== null) pinnedCount[a.team]++
  }
  for (let t = 1; t <= numTeams; t++) {
    if (pinnedCount[t] > target) {
      return {
        ok: false,
        title: 'Too many pinned',
        message: `Team ${t} already has ${pinnedCount[t]} pinned players but can only hold ${target}.`,
      }
    }
  }

  const slots: number[] = []
  for (let t = 1; t <= numTeams; t++) {
    for (let i = 0; i < target - pinnedCount[t]; i++) slots.push(t)
  }
  const unpinned = playerIds.filter(id => !assignments[id]?.pinned)
  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
  shuffle(unpinned)
  shuffle(slots)

  const next = { ...assignments }
  unpinned.forEach((id, i) => { next[id] = { team: slots[i], pinned: false } })
  return { ok: true, assignments: next }
}

/** `event_date` with a `Z` appended when the DB returned it without an offset. */
export function eventDateMs(eventDate: string): number {
  return new Date(/[Z+]/.test(eventDate) ? eventDate : eventDate + 'Z').getTime()
}

export function isEventOver(event: EventWithDetails | undefined, now: number = Date.now()): boolean {
  if (!event) return false
  return now > eventDateMs(event.event_date) + (event.duration_minutes ?? 120) * 60_000
}

/** The viewer's relationship to the event, from the cached rows. */
export function computeEventStatus(args: {
  event: EventWithDetails | undefined
  rows: EventAttendeeWithProfile[]
  attendingGuestCount: number
  userId: string | null
  isHostOrCohost: boolean
}): AttendanceStatus {
  const { event, rows, attendingGuestCount, userId, isHostOrCohost } = args
  const attending = rows.filter(a => a.status === 'attending')
  const waitlist = rows.filter(a => a.status === 'waitlisted').sort(byJoinedAt)
  const waitlistIdx = waitlist.findIndex(a => a.user_id === userId)
  const total = attending.length + attendingGuestCount
  const mine = rows.find(a => a.user_id === userId && (a.status === 'requested' || a.status === 'denied'))
  const max = event?.max_attendees
  return {
    count: total,
    spotsLeft: max ? max - total : null,
    isFull: max ? total >= max : false,
    isAttending: attending.some(a => a.user_id === userId),
    isOwner: isHostOrCohost,
    isWaitlisted: waitlistIdx !== -1,
    waitlistPosition: waitlistIdx !== -1 ? waitlistIdx + 1 : null,
    waitlistCount: waitlist.length,
    isRequested: mine?.status === 'requested',
    isDenied: mine?.status === 'denied',
    denialReason: mine?.status === 'denied' ? (mine.denial_reason ?? null) : null,
  }
}

/**
 * The join footer's primary action. Order is load-bearing, most specific first:
 *  1. the viewer's existing row (attending / waitlisted / requested / denied);
 *  2. capacity: a full event offers the waitlist, whatever the approval setting
 *     (approval used to be checked first, so a full paid event kept offering
 *     "Request to Join" and its waitlist was unreachable);
 *  3. the host's approval setting (`events.requires_approval`, never price);
 *  4. otherwise a plain join.
 */
export function resolveJoinAction(s: JoinActionState): JoinAction {
  if (s.isAttending) return 'leave'
  if (s.isWaitlisted) return 'leave-waitlist'
  if (s.isRequested) return 'cancel-request'
  if (s.isDenied) return 'rerequest'
  if (s.isFull) return 'waitlist'
  if (s.requiresApproval) return 'request'
  return 'join'
}

/** Who sees payment UI at all: paid events only, and only the attendee or a host/co-host. */
export function paymentVisibility(args: {
  event: Pick<EventWithDetails, 'price'> | undefined
  userId: string | null
  status: Pick<AttendanceStatus, 'isAttending' | 'isWaitlisted' | 'isOwner'>
  isHostOrCohost: boolean
}) {
  const paid = !!args.event && args.event.price != null && args.event.price > 0
  const onRoster = args.status.isAttending || args.status.isWaitlisted
  return {
    /** The viewer can set their own flag (any attendee who isn't the creator). */
    canToggle: paid && !!args.userId && onRoster && !args.status.isOwner,
    /** The viewer sees everyone's flags on the roster. */
    canSeeAll: paid && !!args.userId && args.isHostOrCohost,
  }
}

/** How many attending players (not +1 guests) marked "I've paid". */
export function attendeesPaid(attendees: Pick<Profile, 'id'>[], paidUserIds: ReadonlySet<string>): number {
  return attendees.reduce((n, p) => (paidUserIds.has(p.id) ? n + 1 : n), 0)
}
