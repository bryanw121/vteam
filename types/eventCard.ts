import type { EventCardRsvpHandler, EventWithDetails, ForecastSummary, FriendGoing, Tag } from './index'

/** What both event cards show about a game (`eventCardModel`, utils/eventCardModel.ts, #360). */
export type EventCardModel = {
  isAttending: boolean
  /** Waitlisted / Requested / Needs approval / Denied: a status pill instead of one-tap RSVP. */
  awaiting: string | null
  attendeeCount: number
  /** Null when the game has no cap. */
  spotsLeft: number | null
  isFull: boolean
  /** 0–1, for the capacity bar. */
  fillRatio: number
  typeTags: Tag[]
  skillTags: Tag[]
  isTournament: boolean
  /** Accent colour (date numeral, bar): warm for tournaments, primary otherwise. */
  accent: string
  previews: NonNullable<EventWithDetails['attendee_previews']>
  /** Players beyond the avatar previews ("+4"). */
  overflow: number
  surfaceLabel: string | null
  day: string
  date: number
  time: string
}

/** Props both cards take. */
export type EventCardProps = {
  event: EventWithDetails
  /** Where Back from the event goes (defaults to the current path). */
  from?: string
  currentUserId?: string | null
  onRsvp?: EventCardRsvpHandler
  /** The parent's RSVP write for this event is in flight (survives a remount, unlike the local spinner). */
  rsvpPending?: boolean
  /** My friends going (useFriendsGoing), best friends first (#15). */
  friendsGoing?: FriendGoing[]
  /** Weather chip for an outdoor event (#165); the feed works it out (`useFeedForecasts`). */
  forecast?: ForecastSummary | null
  /** Leave room top-right for the feed's ⋯ button (`FeedItemShell`). */
  menuInset?: boolean
}

export type RowEventCardProps = EventCardProps & {
  /** Leave out the date block: the desktop feed's day header already says the day. */
  hideDate?: boolean
}

/** The two card layouts the shared pieces draw for. */
export type EventCardVariant = 'hero' | 'row'
