import React from 'react'
import { View } from 'react-native'
import { Pager } from '../Pager'
import { EVENT_TAB } from '../../hooks/event/useEventTabs'
import type { useDiscussionScroll } from '../../hooks/event/useEventTabs'
import type {
  AttendanceStatus, EventAttendanceApi, EventCheersApi, EventCommentsApi, EventData, EventGuest,
  EventPaymentsApi, EventTeamsApi, EventWithDetails, MentionUser, Profile, TeamDragApi,
} from '../../types'
import { CheersTab } from './CheersTab'
import { DetailsTab } from './DetailsTab'
import { DiscussionTab } from './DiscussionTab'
import { PeopleTab } from './PeopleTab'

type Props = {
  event: EventWithDetails
  data: EventData
  eventStatus: AttendanceStatus
  activeTab: number
  mountedTabs: ReadonlySet<number>
  onSelectTab: (tab: number) => void
  isOwner: boolean
  isHostOrCohost: boolean
  isMobileWeb: boolean
  docScrollActive: boolean
  footerHeight: number
  bottomInset: number
  eventOver: boolean
  attendance: EventAttendanceApi
  teams: EventTeamsApi
  drag: TeamDragApi
  discussion: EventCommentsApi
  discussionScroll: ReturnType<typeof useDiscussionScroll>
  mentions: { mentionableUsers: MentionUser[]; usernameToId: Map<string, string> }
  cheers: EventCheersApi
  payments: EventPaymentsApi
  paymentAccess: { canToggle: boolean; canSeeAll: boolean }
  silencedUserIds: ReadonlySet<string>
  noShow: boolean
  recap: React.ReactNode
  onOpenProfile: (userId: string) => void
  onMessage: (userId: string) => void
  onManageCohosts: () => void
  onOpenNotificationSettings: () => void
  onRemoveAttendee: (p: Profile) => void
  onRemoveGuest: (g: EventGuest) => void
  onDeny: (userId: string, displayName: string) => void
}

const placeholder = <View style={{ flex: 1 }} />

/** The four tabs in the pager, each mounted the first time it's opened. */
export function EventTabPages(p: Props) {
  return (
    <Pager
      page={p.activeTab}
      onPageChange={p.onSelectTab}
      pagerBlockedRef={p.drag.pagerBlockedRef}
      staticRender={p.isMobileWeb}
      autoHeight={p.docScrollActive}
    >
      {p.mountedTabs.has(EVENT_TAB.details) ? (
        <DetailsTab
          event={p.event}
          data={p.data}
          eventStatus={p.eventStatus}
          isOwner={p.isOwner}
          docScrollActive={p.docScrollActive}
          descFooterHeight={p.footerHeight}
          bottomInset={p.bottomInset}
          onOpenProfile={p.onOpenProfile}
          onMessageHost={p.onMessage}
          onManageCohosts={p.onManageCohosts}
          onOpenNotificationSettings={p.onOpenNotificationSettings}
          payments={p.paymentAccess.canToggle ? p.payments : null}
          noShow={p.noShow}
          isHostOrCohost={p.isHostOrCohost}
          recap={p.recap}
        />
      ) : placeholder}

      {p.mountedTabs.has(EVENT_TAB.people) ? (
        <PeopleTab
          event={p.event}
          eventStatus={p.eventStatus}
          data={p.data}
          teams={p.teams}
          drag={p.drag}
          attendance={p.attendance}
          isHostOrCohost={p.isHostOrCohost}
          isMobileWeb={p.isMobileWeb}
          docScrollActive={p.docScrollActive}
          onOpenProfile={p.onOpenProfile}
          onRemoveAttendee={p.onRemoveAttendee}
          onRemoveGuest={p.onRemoveGuest}
          onDeny={p.onDeny}
          onMessage={p.onMessage}
          silencedUserIds={p.silencedUserIds}
          payments={p.paymentAccess.canSeeAll ? p.payments : null}
        />
      ) : placeholder}

      {p.mountedTabs.has(EVENT_TAB.discussion) ? (
        <DiscussionTab
          discussion={p.discussion}
          data={p.data}
          isHostOrCohost={p.isHostOrCohost}
          usernameToId={p.mentions.usernameToId}
          mentionableUsers={p.mentions.mentionableUsers}
          scrollRef={p.discussionScroll.scrollRef}
          isActive={p.activeTab === EVENT_TAB.discussion}
          scrollToBottom={p.discussionScroll.scrollToBottom}
          keyboardInset={p.discussionScroll.keyboardInset}
          bottomInset={p.bottomInset}
          onComposerLayout={p.discussionScroll.setComposerHeight}
        />
      ) : placeholder}

      {p.mountedTabs.has(EVENT_TAB.cheers) ? (
        <CheersTab
          cheers={p.cheers}
          isEventOver={p.eventOver}
          isAttending={p.eventStatus.isAttending}
          isOwner={p.eventStatus.isOwner}
          data={p.data}
          teams={p.teams}
          isMobileWeb={p.isMobileWeb}
          bottomInset={p.bottomInset}
        />
      ) : placeholder}
    </Pager>
  )
}
