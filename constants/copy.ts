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

/**
 * One line per level, shown under each option in player setup and the profile
 * editor (#156), so a new player doesn't have to guess what "BB" means.
 */
export const SKILL_LEVEL_HINTS: Record<string, string> = {
  d: 'New to volleyball, or learning the basics',
  c: 'Can serve and pass; still working on consistency',
  b: 'Solid basics; comfortable in rec games',
  bb: 'Consistent passing, setting and hitting in competitive rec',
  a: 'Strong all-around player in competitive leagues',
  aa_plus: 'Advanced, college or open-level play',
}

/** Player setup after sign-up (#156). */
export const PLAYER_SETUP_COPY = {
  skip: 'Skip',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  positionTitle: 'What do you play?',
  positionBody: 'Pick any that fit. Hosts use this to balance teams.',
  notSure: 'Not sure yet',
  levelTitle: "What's your level?",
  levelBody: "Your best guess is fine. You can change it on your profile any time.",
  cityTitle: 'Where do you play?',
  cityBody: "We'll show games and open gyms near you.",
  cityLabel: 'Home city',
  liveNow: 'Live now',
  liveNowNote: (city: string) => `${city}: sessions from local venues are in the feed today.`,
} as const

