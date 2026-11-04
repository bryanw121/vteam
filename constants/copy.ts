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

// ─── No-show flag (#151) ───────────────────────────────────────────────────────
/** Roster ⋯ menu (hosts and co-hosts, from the start until 2 hours after the end). */
export const NO_SHOW_MARK_LABEL = 'Mark as no-show'
export const NO_SHOW_UNDO_LABEL = 'Undo no-show'
export const NO_SHOW_MARK_SUBTITLE = (until: string) => `No points for this event. You can undo until ${until}.`
export const NO_SHOW_UNDO_SUBTITLE = (until: string) => `They get points with everyone else at ${until}.`
/** Badge on a flagged roster card. A non-breaking hyphen: the card's text column is narrow on phones. */
export const NO_SHOW_BADGE = 'No\u2011show'
/** One line above the roster for hosts during the window. */
export const NO_SHOW_HOST_NOTE = (flagged: number, pointsAt: string) =>
  flagged === 0
    ? `Game started. Tap ⋯ on anyone who didn't come. Everyone else gets points at ${pointsAt}.`
    : `${flagged} no-show${flagged === 1 ? '' : 's'}. Everyone else gets points at ${pointsAt}.`
/** The flagged player's own card on Details. */
export const NO_SHOW_PLAYER_TITLE = 'Marked as a no-show'
export const NO_SHOW_PLAYER_BODY =
  "The host marked you as not attending, so this event earns no points. If that's a mistake, message the host."
export const NO_SHOW_MESSAGE_HOST = 'Message host'
