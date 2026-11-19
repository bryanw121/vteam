import type { RefObject } from 'react'
import type { TextInput } from '../components/ui/Text'
import type { ClubListItem, ClubPostWithFeed, ClubWithDetails, EventWithDetails, LocationValue, MajorCity } from './index'

/** The owner's edit form on a club page (#305). */
export type ClubForm = {
  name: string
  description: string
  majorCity: MajorCity | null
  location: LocationValue | null
}

/** Errors shown under the club edit form's fields. */
export type ClubFormErrors = { name?: string; metro?: string }

export type ClubMediaKind = 'avatar' | 'cover'

export type ClubMembershipAction = 'join' | 'leave'

/** The viewer's own profile bits shown in a club's member list after joining. */
export type ClubMemberProfile = ClubWithDetails['club_members'][number]['profiles']

export type ClubMembershipOptions = {
  /** The Clubs list this club is shown in, to update its row at once (the club page has none). */
  listKey?: string
  listClub?: ClubListItem
}

export type ClubHeroProps = {
  club: ClubWithDetails
  coverUri: string | null
  avatarUri: string | null
  topInset: number
  owner: boolean
  editing: boolean
  uploading: { avatar: boolean; cover: boolean }
  onBack: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onPickImage: (kind: ClubMediaKind) => void
}

export type ClubSummaryProps = {
  club: ClubWithDetails
  upcomingCount: number
  pastCount: number
}

export type ClubMembershipBarProps = {
  club: ClubWithDetails
  owner: boolean
  member: boolean
  alertsOn: boolean
  membershipBusy: boolean
  alertsBusy: boolean
  onJoin: () => void
  onLeave: () => void
  onToggleAlerts: () => void
}

export type ClubEditFormProps = {
  form: ClubForm
  errors: ClubFormErrors
  saving: boolean
  userId: string | null
  nameRef: RefObject<TextInput | null>
  onChange: (patch: Partial<ClubForm>) => void
  onSave: () => void
}

export type ClubUpdatesProps = {
  clubId: string
  posts: ClubPostWithFeed[]
  likedPostIds: Set<string>
  loading: boolean
  userId: string | null
  member: boolean
  owner: boolean
  memberName: (userId: string) => string
  onChanged: () => void
}

export type ClubEventsProps = { events: EventWithDetails[] }

export type ClubMembersListProps = { members: ClubWithDetails['club_members'] }
