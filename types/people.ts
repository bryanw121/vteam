/** Props of the event People tab's pieces (#332; components/event/people/*). */
import type { ReactNode } from 'react'
import type {
  AttendanceStatus, EventAttendanceApi, EventGuest, EventTeamsApi, EventWithDetails, Profile, RosterAction, TeamDragApi,
} from './index'

/** What a roster card's drag and pin gestures report (hooks/event/useDraggableCard). */
export type DraggableCardCallbacks = {
  onDragStart: (x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onTogglePin: () => void
}

/** The one draggable card shell both players and +1s use. */
export type RosterCardShellProps = DraggableCardCallbacks & {
  isOwner: boolean
  /** Pinned to its team (host only, shown with a lock). */
  locked: boolean
  noShow?: boolean
  avatar: ReactNode
  title: string
  /** Lines and badges under the name. */
  details?: ReactNode
  /** ⋯ menu; when absent the host gets the bare ✕ (onRemove). */
  onOpenMenu?: () => void
  onRemove?: () => void
  menuLabel: string
  removeLabel: string
  cornerTestID?: string
}

/** Everything a team-board card needs beyond who it shows. */
export type RosterCardContext = {
  isOwner: boolean
  isMobileWeb: boolean
  assignments: EventTeamsApi['assignments']
  drag: TeamDragApi
  onTogglePin: (id: string) => void
  onOpenProfile: (userId: string) => void
  onRemoveAttendee: (profile: Profile) => void
  onRemoveGuest: (g: EventGuest) => void
  adderUsernames: Record<string, string>
  /** ⋯ menu openers; undefined when the row has nothing to offer. */
  playerMenu: (profile: Profile) => (() => void) | undefined
  guestMenu: (g: EventGuest) => (() => void) | undefined
  /** Hosts on a paid event; undefined hides the badge. */
  paidUserIds?: ReadonlySet<string>
  noShows: ReadonlySet<string>
}

export type TeamBoardProps = {
  event: EventWithDetails
  eventStatus: AttendanceStatus
  attendees: Profile[]
  guests: EventGuest[]
  teams: EventTeamsApi
  card: RosterCardContext
  /** "N of M marked paid" line; null hides it. */
  paidCount: number | null
}

export type RequestListProps = {
  requested: Profile[]
  attendance: EventAttendanceApi
  onOpenProfile: (userId: string) => void
  onDeny: (userId: string, displayName: string) => void
  /** The row's ⋯ button, or null. */
  menuButton: (title: string, actions: RosterAction[]) => ReactNode
  memberActions: (profile: Profile) => RosterAction[]
}

export type WaitlistListProps = {
  eventStatus: AttendanceStatus
  profiles: Profile[]
  guests: EventGuest[]
  onApprove: (userId: string) => void
  onRemoveGuest: (g: EventGuest) => void
  menuButton: (title: string, actions: RosterAction[]) => ReactNode
  memberActions: (profile: Profile) => RosterAction[]
  guestActions: (g: EventGuest) => RosterAction[]
}
