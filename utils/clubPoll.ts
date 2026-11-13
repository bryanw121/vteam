import type { ClubPoll, ClubPollDraftOption, ClubPollOption, ClubPollTally, ClubPostWithFeed } from '../types'

export const POLL_QUESTION_MAX = 140
export const POLL_OPTION_MAX = 80
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 10
/** A new poll closes this long after it is posted unless the owner picks otherwise. */
export const POLL_DEFAULT_OPEN_HOURS = 48

/** The poll on a post, whichever shape PostgREST used for the one-to-one embed. */
export function pollOf(post: Pick<ClubPostWithFeed, 'club_polls'>): ClubPoll | null {
  const p = post.club_polls
  if (!p) return null
  return Array.isArray(p) ? p[0] ?? null : p
}

export function isPollClosed(poll: Pick<ClubPoll, 'closes_at'>, nowMs: number): boolean {
  return !!poll.closes_at && Date.parse(poll.closes_at) <= nowMs
}

/** Counts, the viewer's picks and (once closed) the winners: most votes, all tied ones, none when nobody voted. */
export function tallyPoll(poll: ClubPoll, me: string | null, nowMs: number): ClubPollTally {
  const options = [...poll.club_poll_options].sort((a, b) => a.position - b.position)
  const voters = new Set(options.flatMap(o => o.club_poll_votes.map(v => v.user_id))).size
  const top = Math.max(0, ...options.map(o => o.club_poll_votes.length))
  const closed = isPollClosed(poll, nowMs)
  const winners = closed && top > 0 ? options.filter(o => o.club_poll_votes.length === top) : []
  return {
    voters,
    closed,
    winners,
    myOptionIds: me ? options.filter(o => o.club_poll_votes.some(v => v.user_id === me)).map(o => o.id) : [],
    options: options.map(o => ({
      option: o,
      count: o.club_poll_votes.length,
      share: voters ? o.club_poll_votes.length / voters : 0,
      mine: !!me && o.club_poll_votes.some(v => v.user_id === me),
      winner: winners.includes(o),
    })),
  }
}

/** The viewer's picks after tapping an option: single choice replaces, multi toggles. */
export function nextPicks(current: readonly string[], optionId: string, multi: boolean): string[] {
  if (!multi) return current.length === 1 && current[0] === optionId ? [] : [optionId]
  return current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId]
}

/** The poll with the viewer's votes replaced by `picks` (optimistic update). */
export function withMyVotes(poll: ClubPoll, me: string, picks: readonly string[]): ClubPoll {
  return {
    ...poll,
    club_poll_options: poll.club_poll_options.map(o => ({
      ...o,
      club_poll_votes: [...o.club_poll_votes.filter(v => v.user_id !== me), ...(picks.includes(o.id) ? [{ user_id: me }] : [])],
    })),
  }
}

/** What's wrong with a draft poll, or null when it can be posted. */
export function pollDraftProblem(question: string, kind: ClubPoll['kind'], options: readonly ClubPollDraftOption[], closesAt: Date | null, nowMs: number): string | null {
  const q = question.trim()
  if (!q) return 'Ask a question.'
  if (q.length > POLL_QUESTION_MAX) return `Keep the question under ${POLL_QUESTION_MAX} characters.`
  if (options.length < POLL_MIN_OPTIONS) return `Add at least ${POLL_MIN_OPTIONS} options.`
  if (options.length > POLL_MAX_OPTIONS) return `At most ${POLL_MAX_OPTIONS} options.`
  if (kind === 'time') {
    if (options.some(o => !o.startsAt)) return 'Pick a date and time for every option.'
    if (options.some(o => (o.startsAt as Date).getTime() <= nowMs)) return 'Every option needs a time in the future.'
  } else if (options.some(o => !o.label.trim())) {
    return 'Fill in every option.'
  }
  if (options.some(o => o.label.trim().length > POLL_OPTION_MAX)) return `Keep options under ${POLL_OPTION_MAX} characters.`
  if (closesAt && closesAt.getTime() <= nowMs) return 'The close time has to be in the future.'
  return null
}

/** A label for a time option, in the club's zone: "Thu, Nov 19 · 7:00 PM". */
export function timeOptionLabel(d: Date, timeZone: string): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  return `${day} · ${time}`
}

/** The RPC's options payload. */
export function pollOptionsPayload(kind: ClubPoll['kind'], options: readonly ClubPollDraftOption[], timeZone: string): { label: string; starts_at?: string }[] {
  return options.map(o => (kind === 'time' && o.startsAt
    ? { label: (o.label.trim() || timeOptionLabel(o.startsAt, timeZone)).slice(0, POLL_OPTION_MAX), starts_at: o.startsAt.toISOString() }
    : { label: o.label.trim().slice(0, POLL_OPTION_MAX) }))
}

/** `?date=` on the Host route: an ISO instant in the future, else nothing. */
export function parsePrefillDate(raw: unknown, nowMs: number = Date.now()): Date | null {
  if (typeof raw !== 'string' || !raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) && t > nowMs ? new Date(t) : null
}

/** The option a "Create event" button uses. */
export function winningTimeOptions(tally: ClubPollTally): ClubPollOption[] {
  return tally.winners.filter(o => !!o.starts_at)
}
