import type { LeaveReason } from '../types'

/** User-facing copy shared across screens. */

/** The app's name as people see it: the browser tab title on web and the iOS home-screen label. */
export const APP_NAME = 'VTeam'

/** Alert body for a failed write when there is nothing more specific to say. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/** Shown when a join raced the last spot and the database saved it as waitlisted. */
export const EVENT_JUST_FILLED_TITLE = 'Event just filled up'
export const EVENT_JUST_FILLED_BODY =
  "The last spot was taken a moment before you. You're on the waitlist and will be notified if you get in."

/** Alert body for a failed write that is almost certainly a connectivity problem. */
export const NETWORK_ERROR_MESSAGE = 'Check your connection and try again.'
/** Events feed: a refresh failed while older (cached or saved) events are on screen. */
export const FEED_STALE_NOTICE = "Couldn't refresh. These may be out of date. Tap to retry."

/** Display label per skill tier, lowest to highest (insertion order is the display order). `open` is tournament-only. */
export const SKILL_LEVEL_LABELS: Record<string, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', a: 'A', aa_plus: 'AA+', open: 'Open',
}

/** Approval-gated events: told to the player before they tap (event page, feed card) and echoed in the host form. */
export const APPROVAL_REQUIRED_NOTE = 'The host reviews requests for this event'

/** Username sign-in: the same message for an unknown username and a wrong password (no account enumeration). */
export const INCORRECT_USERNAME_OR_PASSWORD = 'Incorrect username or password'
/** Email sign-in: the same message for an unknown email and a wrong password. */
export const INCORRECT_EMAIL_OR_PASSWORD = 'Incorrect email or password'

/** Shown in place of someone who deleted their account (e.g. the other side of a DM). */
export const DELETED_USER_LABEL = 'Deleted user'
/** The leave sheet (#171): what leaving costs, said before it happens. Lines come from utils/leaveConsequences.ts. */
export const LEAVE_COPY = {
  title: 'Leave this game?',
  leave: 'Leave game',
  stay: 'Stay in',
  /** Above the reason chips; `{host}` is the host's display name. */
  reasonPrompt: 'Tell {host} why (optional, sent as a message)',
  notePlaceholder: 'Add a note...',
  dmFailed: "Left, but the message didn't send",
  messageHost: 'Message host',
} as const

/** Reason chips on the leave sheet, in display order. The label is what the host reads in the DM. */
export const LEAVE_REASONS: ReadonlyArray<{ id: LeaveReason; label: string }> = [
  { id: 'something_came_up', label: 'Something came up' },
  { id: 'sick', label: 'Sick' },
  { id: 'injured', label: 'Injured' },
  { id: 'work', label: 'Work' },
]

/** Longest note the leave sheet sends to the host. */
export const LEAVE_NOTE_MAX = 280
