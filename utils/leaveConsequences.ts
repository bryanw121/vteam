import type {
  LeaveConsequence,
  LeaveConsequencePart,
  LeaveEventInfo,
  LeaveRosterInfo,
  LeaveViewerInfo,
} from '../types'
import { parseEventDate } from './eventDate'
import { formatPrice } from './price'

/**
 * The leave sheet's lines (#171): what leaving costs, worked out from what the
 * event page already has loaded. Pure and React-free, so every rule is unit-tested.
 */

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
/** Same window as the `late_dropout` trigger: start > now and start <= now + 24h. */
export const LATE_DROPOUT_WINDOW_MS = DAY_MS
/** Points `award_event_points()` gives: 5 for an event tagged Tournament, otherwise 2. */
export const OPEN_PLAY_POINTS = 2
export const TOURNAMENT_POINTS = 5

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** True when the host gets `late_dropout` for this leave: the event starts within the next 24 hours. */
export function hostWillBeTold(eventDate: string, now: number): boolean {
  const until = parseEventDate(eventDate).getTime() - now
  return until > 0 && until <= LATE_DROPOUT_WINDOW_MS
}

/** Tagged Tournament (the `event_type` tag `award_event_points()` checks). */
export function isTournamentEvent(event: Pick<LeaveEventInfo, 'event_tags'>): boolean {
  return (event.event_tags ?? []).some(t => t.tags?.name === 'Tournament')
}

export function eventPoints(event: Pick<LeaveEventInfo, 'event_tags'>): number {
  return isTournamentEvent(event) ? TOURNAMENT_POINTS : OPEN_PLAY_POINTS
}

/**
 * Only the lines that apply, in display order: capacity (full with a waitlist /
 * full / spots open), approval, the host notice, money, points (always).
 */
export function leaveConsequences(
  event: LeaveEventInfo,
  roster: LeaveRosterInfo,
  me: LeaveViewerInfo,
  now: number,
): LeaveConsequence[] {
  const lines: LeaveConsequence[] = []
  const host = event.hostName
  const line = (kind: LeaveConsequence['kind'], icon: LeaveConsequence['icon'], ...parts: LeaveConsequencePart[]) =>
    lines.push({ kind, icon, parts })

  if (roster.isFull && roster.waitlistCount > 0) {
    const n = roster.waitlistCount
    line('waitlist', 'people',
      { text: `It's full, ${n} ${plural(n, 'person is', 'people are')} waiting.`, strong: true },
      { text: ` If you change your mind you'd join the waitlist as #${n + 1}.` })
  } else if (roster.isFull) {
    line('full', 'people',
      { text: "It's full.", strong: true },
      { text: " If a spot doesn't open you won't get back in." })
  } else if (roster.spotsLeft != null && roster.spotsLeft > 0) {
    const n = roster.spotsLeft
    line('open', 'people',
      { text: `${n} ${plural(n, 'spot is', 'spots are')} open,`, strong: true },
      { text: ' so you can rejoin any time.' })
  } else if (event.max_attendees == null) {
    line('open', 'people',
      { text: "There's no player limit,", strong: true },
      { text: ' so you can rejoin any time.' })
  }

  if (event.requires_approval) {
    line('approval', 'hand-left', { text: `Rejoining means asking ${host} again.` })
  }

  if (!me.isHostOrCohost && hostWillBeTold(event.event_date, now)) {
    line('hostNotified', 'notifications',
      { text: `${host} (host) will be told`, strong: true },
      { text: ' you dropped out, since it starts within 24 hours.' })
  }

  if (me.paid && event.price != null && event.price > 0) {
    line('paid', 'cash',
      { text: `You marked ${formatPrice(event.price)} paid.`, strong: true },
      { text: ` Refunds are up to ${host}.` })
  }

  const points = eventPoints(event)
  line('points', 'star',
    { text: "You won't get the " },
    { text: `${points} points`, strong: true },
    { text: ' for this game.' })

  return lines
}

/** The sentence a screen reader (and a test) reads for one line. */
export function leaveConsequenceText(line: LeaveConsequence): string {
  return line.parts.map(p => p.text).join('')
}

/** "Thu 7:00 PM", in the device's time zone (the same clock the event page shows). */
export function leaveShortTime(eventDate: string): string {
  const d = parseEventDate(eventDate)
  const day = d.toLocaleDateString('en-US', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${day} ${time}`
}

/** Under the sheet title: "Starts in 5 hours · Thu 7:00 PM" / "In 6 days · Mon 6:30 PM". */
export function leaveSubtitle(eventDate: string, now: number): string {
  const until = parseEventDate(eventDate).getTime() - now
  let when: string
  if (until <= 0) when = 'Already started'
  else if (until < HOUR_MS) {
    const m = Math.max(1, Math.round(until / 60_000))
    when = `Starts in ${m} ${plural(m, 'minute', 'minutes')}`
  } else if (until < DAY_MS) {
    const h = Math.floor(until / HOUR_MS)
    when = `Starts in ${h} ${plural(h, 'hour', 'hours')}`
  } else {
    const d = Math.max(1, Math.round(until / DAY_MS))
    when = `In ${d} ${plural(d, 'day', 'days')}`
  }
  return `${when} · ${leaveShortTime(eventDate)}`
}

/**
 * The DM to the host: "Left <title> (<Thu 7:00 PM>): <reason>. <note>".
 * Null when there is nothing to say (no reason chip and an empty note).
 */
export function leaveDmText(args: {
  title: string
  eventDate: string
  reasonLabel: string | null
  note: string
}): string | null {
  const note = args.note.trim()
  const reason = args.reasonLabel?.trim() ?? ''
  if (!reason && !note) return null
  const body = [reason ? `${reason}.` : '', note].filter(Boolean).join(' ')
  const title = args.title.trim() || 'the game'
  return `Left ${title} (${leaveShortTime(args.eventDate)}): ${body}`
}

