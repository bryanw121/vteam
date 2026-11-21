import React, { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { RefreshControl } from '../RefreshControl'
import { DocScrollView } from '../DocScrollView'
import { IconButton } from '../ui'
import { RosterActionsSheet } from './RosterActionsSheet'
import { TeamBoard } from './people/TeamBoard'
import { RequestList } from './people/RequestList'
import { WaitlistList } from './people/WaitlistList'
import { CourtQueueCard } from './people/CourtQueueCard'
import { shared, theme } from '../../constants'
import { NO_SHOW_HOST_NOTE } from '../../constants/copy'
import type {
  AttendanceStatus, EventAttendanceApi, EventData, EventGuest, EventPaymentsApi, EventTeamsApi, EventWithDetails,
  Profile, RosterAction, RosterActionContext, RosterMenu, TeamDragApi,
} from '../../types'
import type { RosterCardContext } from '../../types/people'
import { profileDisplayName } from '../../utils'
import { guestRowActions, hasRosterMenu, memberRowActions } from '../../utils/rosterActions'
import { guestFullName } from '../../utils/guests'
import { attendeesPaid, eventDateMs, noShowUserIds, noShowWindow } from '../../hooks/event/derive'
import { savedTeams } from '../../utils/courtQueue'
import { formatTime } from '../../utils/dateFormat'

type Props = {
  event: EventWithDetails
  eventStatus: AttendanceStatus
  /** Roster lists + pull-to-refresh. */
  data: EventData
  teams: EventTeamsApi
  drag: TeamDragApi
  /** Request approval / waitlist promotion. */
  attendance: EventAttendanceApi
  isHostOrCohost: boolean
  isMobileWeb: boolean
  docScrollActive: boolean
  onOpenProfile: (userId: string) => void
  onRemoveAttendee: (profile: Profile) => void
  onRemoveGuest: (g: EventGuest) => void
  onDeny: (userId: string, displayName: string) => void
  /** Opens (or creates) a DM. Offered on the roster to hosts and co-hosts only. */
  onMessage?: (userId: string) => void
  /** Users the viewer has silenced: the roster never offers to message them. */
  silencedUserIds: ReadonlySet<string>
  /** Hosts/co-hosts on a paid event: who marked "I've paid". Null hides payment UI. */
  payments: EventPaymentsApi | null
}

/**
 * The event's People tab (#332 split it): the no-show note, the team board
 * (TeamBoard), join requests (RequestList) and the waitlist (WaitlistList),
 * with one ⋯ sheet for every row.
 */
export function PeopleTab({
  event, eventStatus, data, teams, drag, attendance, isHostOrCohost, isMobileWeb, docScrollActive,
  onOpenProfile, onRemoveAttendee, onRemoveGuest, onDeny, onMessage, silencedUserIds, payments,
}: Props) {
  const { refreshing } = data
  const onRefresh = () => Promise.all([data.refresh(), payments?.refetch()])
  const { attendees, attendingGuests: guests, adderUsernames, requestedProfiles, waitlistProfiles, waitlistGuests } = data.roster
  const isOwner = eventStatus.isOwner

  // ── Per-row ⋯ menu (one sheet for the whole tab) ──
  const [rowMenu, setRowMenu] = useState<RosterMenu | null>(null)
  const actionCtx: RosterActionContext = { canMessage: isHostOrCohost, viewerId: data.userId, silencedUserIds, onMessage, onOpenProfile }
  const openMenu = (title: string, actions: RosterAction[]) =>
    hasRosterMenu(actions) ? () => setRowMenu({ title, actions }) : undefined
  const removeAttendee = (profile: Profile) => (isOwner ? () => onRemoveAttendee(profile) : undefined)
  const removeGuest = (g: EventGuest) => (isOwner ? () => onRemoveGuest(g) : undefined)
  const guestActions = (g: EventGuest) => guestRowActions(g, adderUsernames[g.added_by], actionCtx, removeGuest(g))
  const memberActions = (profile: Profile) => memberRowActions(profile, actionCtx)

  // ── No-show flag (#151): hosts and co-hosts, from the start until end + 2h ──
  const noShowWin = noShowWindow(event)
  const canFlagNoShows = isHostOrCohost && noShowWin.open
  const noShows = isHostOrCohost ? noShowUserIds(data.roster.attendingRows) : new Set<string>()
  const pointsAt = formatTime(new Date(noShowWin.closesAt), { hour: 'numeric', minute: '2-digit' })
  const noShowAction = (profile: Profile) => canFlagNoShows
    ? { flagged: noShows.has(profile.id), until: pointsAt, onToggle: () => { void attendance.setNoShow(profile.id, !noShows.has(profile.id)) } }
    : undefined

  /** ⋯ for the flat request / waitlist rows (roster cards have their own corner control). */
  function menuButton(title: string, actions: RosterAction[]) {
    const open = openMenu(title, actions)
    if (!open) return null
    return <IconButton icon="ellipsis-horizontal" size={44} label={`Actions for ${title}`} onPress={open} />
  }

  const card: RosterCardContext = {
    isOwner,
    isMobileWeb,
    assignments: teams.assignments,
    drag,
    onTogglePin: teams.togglePin,
    onOpenProfile,
    onRemoveAttendee,
    onRemoveGuest,
    adderUsernames,
    playerMenu: p => openMenu(profileDisplayName(p), memberRowActions(p, actionCtx, removeAttendee(p), noShowAction(p))),
    guestMenu: g => openMenu(guestFullName(g), guestActions(g)),
    paidUserIds: payments?.paidUserIds,
    noShows,
  }

  return (
    <>
      <DocScrollView
        docScroll={docScrollActive}
        style={shared.screen}
        contentContainerStyle={shared.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void onRefresh() }} tintColor={theme.colors.primary} />}
      >
        {canFlagNoShows && attendees.length > 0 && (
          <View testID="roster-no-show-note" style={shared.rosterNote}>
            <Text style={shared.rosterNoteText}>{NO_SHOW_HOST_NOTE(noShows.size, pointsAt)}</Text>
          </View>
        )}
        <CourtQueueCard
          eventId={event.id}
          startMs={eventDateMs(event.event_date)}
          durationMinutes={event.duration_minutes}
          cancelled={!!event.cancelled_at}
          teams={savedTeams([...data.roster.attendingRows, ...guests])}
          myTeam={data.roster.attendingRows.find(r => r.user_id === data.userId)?.team_number ?? null}
          canRun={isHostOrCohost}
        />
        <TeamBoard
          event={event}
          eventStatus={eventStatus}
          attendees={attendees}
          guests={guests}
          teams={teams}
          card={card}
          paidCount={payments ? attendeesPaid(attendees, payments.paidUserIds) : null}
        />
        {isHostOrCohost && (
          <RequestList
            requested={requestedProfiles}
            attendance={attendance}
            onOpenProfile={onOpenProfile}
            onDeny={onDeny}
            menuButton={menuButton}
            memberActions={memberActions}
          />
        )}
        <WaitlistList
          eventStatus={eventStatus}
          profiles={waitlistProfiles}
          guests={waitlistGuests}
          onApprove={attendance.approveFromWaitlist}
          onRemoveGuest={onRemoveGuest}
          menuButton={menuButton}
          memberActions={memberActions}
          guestActions={guestActions}
        />
      </DocScrollView>
      <RosterActionsSheet menu={rowMenu} onDismiss={() => setRowMenu(null)} />
    </>
  )
}
