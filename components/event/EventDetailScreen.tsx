import React, { useState } from 'react'
import { Platform, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useCourtQueue } from '../../hooks/event/useCourtQueue'
import { courtQueueOffered } from '../../utils/courtQueue'
import { useIsNarrowWeb } from '../../hooks/useIsNarrowWeb'
import { useOpenDm } from '../../hooks/useOpenDm'
import { useSilencedUserIds } from '../../hooks/useSilencedUsers'
import {
  attendeeRemoveTarget, computeEventStatus, eventCardSeed, eventDateMs, guestRemoveTarget, isEventOver,
  isViewerNoShow, paymentVisibility, useCohosts, useEventAttendance, useEventCheers, useEventComments,
  useEventData, useEventPayments, useEventTeams, useMyDenialReason, useRemoveDialog, useTeamDrag,
} from '../../hooks/event'
import { useDeleteEvent } from '../../hooks/event/useDeleteEvent'
import { useDiscussionMentions } from '../../hooks/event/useDiscussionMentions'
import { useEventDialog } from '../../hooks/event/useEventDialog'
import { useEventRecap } from '../../hooks/event/useEventRecap'
import { EVENT_TAB, useDiscussionScroll, useEventTabs } from '../../hooks/event/useEventTabs'
import { useJoinIntent } from '../../hooks/event/useJoinIntent'
import { useLeaveFlow } from '../../hooks/event/useLeaveFlow'
import { useEventBack } from '../../hooks/event/useEventBack'
import { useEventFirstPaint } from '../../hooks/event/useEventFirstPaint'
import { ScreenState } from '../../components/ui'
import { EventDialogs } from '../../components/event/EventDialogs'
import { EventHeaderActions } from '../../components/event/EventHeaderActions'
import { EventHero } from '../../components/event/EventHero'
import { EventDetailSkeleton } from '../../components/event/EventDetailSkeleton'
import { EventTabBar } from '../../components/event/EventTabBar'
import { EventTabPages } from '../../components/event/EventTabPages'
import { JoinFooter } from '../../components/event/JoinFooter'
import { RecapCards } from '../../components/event/RecapCards'
import { RecapFooter } from '../../components/event/RecapFooter'
import { DragGhost } from '../../components/event/DragGhost'
import { theme, SWIPE_NAVIGATION } from '../../constants'
import { profileDisplayName } from '../../utils'
import { routes } from '../../utils/routes'

/**
 * Event detail: banner + Details / People / Discussion / Cheers tabs, the RSVP footer
 * and the dialogs. It only composes (#354): data and writes are in `hooks/event/*`,
 * each flow (join after sign-up, leave, recap, delete, mentions, tabs) in its own hook,
 * the dialogs in `EventDialogs`.
 *
 * Web loads this screen in its own chunk (EventDetailRoute.web.tsx), together with
 * Reanimated and Gesture Handler for the team drag (#193); the app root on web has no
 * GestureHandlerRootView, so the screen brings its own.
 */
function withWebGestureRoot(screen: React.ReactElement) {
  return Platform.OS === 'web'
    ? <GestureHandlerRootView style={{ flex: 1 }}>{screen}</GestureHandlerRootView>
    : screen
}

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isMobileWeb = useIsNarrowWeb()

  // ── Data + writes ──────────────────────────────────────────────────────────
  const data = useEventData(id)
  const { event, userId, cohosts, roster } = data
  const isOwner = !!event && event.created_by === userId
  const isHostOrCohost = isOwner || cohosts.some(c => c.user_id === userId)
  const eventOver = isEventOver(event)
  // Around game time, load the court queue (#333) with the event, so the People tab
  // opens with it in place instead of pushing the roster down when it arrives.
  useCourtQueue(id, { enabled: !!event && courtQueueOffered(eventDateMs(event.event_date), event.duration_minutes, !!event.cancelled_at) })
  useEventFirstPaint(!!event)

  const attendance = useEventAttendance(data)
  const teams = useEventTeams(data, isHostOrCohost)
  const drag = useTeamDrag(teams.moveToTeam)
  const cohostsApi = useCohosts(data)
  const removeDialog = useRemoveDialog()
  const dialog = useEventDialog()
  const { openDm, sendDm } = useOpenDm()
  // Only hosts/co-hosts get roster Message actions, so only they need silences.
  // One-directional by RLS: a host can't learn who has silenced *them*.
  const { silencedUserIds } = useSilencedUserIds(isHostOrCohost)

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs = useEventTabs(isMobileWeb)
  const cheers = useEventCheers(id, userId, tabs.activeTab === EVENT_TAB.cheers && eventOver)
  const selectTab = (next: number) => {
    if (next !== EVENT_TAB.cheers) cheers.clearDraft()
    tabs.setActiveTab(next)
  }
  const discussionScroll = useDiscussionScroll(tabs.activeTab === EVENT_TAB.discussion, data.comments[data.comments.length - 1]?.id)
  const discussion = useEventComments(data, { isHostOrCohost, onPosted: () => discussionScroll.scrollToBottom(true) })
  const mentions = useDiscussionMentions(roster.attendees, cohosts, event, userId)

  // ── Status, payments ───────────────────────────────────────────────────────
  const derivedStatus = computeEventStatus({ event, rows: roster.rows, attendingGuestCount: roster.attendingGuests.length, userId, isHostOrCohost })
  const myDenialReason = useMyDenialReason(id, userId, derivedStatus.isDenied)
  const eventStatus = derivedStatus.isDenied && !derivedStatus.denialReason ? { ...derivedStatus, denialReason: myDenialReason } : derivedStatus
  // "I've paid" (#6): paid events only, for the attendee and the hosts.
  const paymentAccess = paymentVisibility({ event, userId, status: eventStatus, isHostOrCohost })
  const payments = useEventPayments(id, userId, {
    enabled: paymentAccess.canToggle || paymentAccess.canSeeAll,
    onRoster: eventStatus.isAttending || eventStatus.isWaitlisted,
  })
  // An explicit host setting; never inferred from price.
  const requiresApproval = event?.requires_approval === true
  const [footerHeight, setFooterHeight] = useState(80)
  const hostName = event?.profiles ? profileDisplayName(event.profiles) : 'the host'

  // ── Flows ──────────────────────────────────────────────────────────────────
  const joinIntent = useJoinIntent({ eventId: id, event, userId, ready: !data.isLoading, status: eventStatus, over: eventOver, requiresApproval, attendance, dialog })
  const leave = useLeaveFlow({ event, status: eventStatus, userId, isHostOrCohost, paid: payments.iPaid, hostName, attendance, sendDm, openDm, dialog })
  const recap = useEventRecap(id, event, userId, eventOver, roster.rows)
  const deleteEvent = useDeleteEvent(id, userId)
  const goBack = useEventBack()

  const headerActions = (
    <EventHeaderActions
      eventId={id}
      tab={tabs.activeTab}
      title={event?.title}
      eventDate={event?.event_date}
      canManage={isHostOrCohost}
      deleting={deleteEvent.isPending}
      onBack={goBack}
      onEdit={() => router.push(routes.host({ edit: id }))}
      onDelete={() => dialog.open({ kind: 'delete' })}
      onManageCohosts={isOwner ? cohostsApi.open : undefined}
    />
  )
  const loadError = data.loadError?.message ?? (data.notFound ? 'Event not found' : null)
  const showRecapFooter = !!event && eventOver && !event.cancelled_at
  const onDetails = tabs.activeTab === EVENT_TAB.details && !data.seedOnly

  return withWebGestureRoot(
    <View
      ref={drag.containerRef}
      style={[
        { backgroundColor: theme.colors.background },
        // Doc-scroll mode: auto height so content extends the document (body scrolls)
        tabs.docScrollActive ? ({ minHeight: '100dvh' } as object) : { flex: 1 },
      ]}
      pointerEvents={removeDialog.target !== null || dialog.dialog?.kind === 'deny' ? 'none' : 'auto'}
      onLayout={drag.measureContainerOffset}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />

      {/* Web: in-flow header row (back + actions; the banner shows the title) */}
      {Platform.OS === 'web' && headerActions}

      {data.isLoading && !loadError ? (
        <EventDetailSkeleton seed={event ?? eventCardSeed(id)} topInset={insets.top} />
      ) : (
      <ScreenState loading={data.isLoading} ready={!!event && !data.isLoading && !loadError} error={loadError} onRetry={() => { void data.retry() }}>
        {event && (
          <>
            {/* Fixed header: banner + tabs */}
            <View style={{ backgroundColor: theme.colors.background, paddingTop: Platform.OS !== 'web' ? insets.top + 52 : 0 }}>
              <EventHero event={event} />
              <EventTabBar activeTab={tabs.activeTab} peopleCount={eventStatus.count} onSelect={selectTab} />
            </View>

            <EventTabPages
              event={event}
              data={data}
              eventStatus={eventStatus}
              activeTab={tabs.activeTab}
              mountedTabs={tabs.mountedTabs}
              onSelectTab={selectTab}
              isOwner={isOwner}
              isHostOrCohost={isHostOrCohost}
              isMobileWeb={isMobileWeb}
              docScrollActive={tabs.docScrollActive}
              footerHeight={footerHeight}
              bottomInset={insets.bottom}
              eventOver={eventOver}
              attendance={attendance}
              teams={teams}
              drag={drag}
              discussion={discussion}
              discussionScroll={discussionScroll}
              mentions={mentions}
              cheers={cheers}
              payments={payments}
              paymentAccess={paymentAccess}
              silencedUserIds={silencedUserIds}
              noShow={isViewerNoShow(roster.rows, userId)}
              recap={eventOver ? <RecapCards event={event} userId={userId} recap={recap} /> : null}
              onOpenProfile={profileId => router.push(routes.profileOf(profileId))}
              onMessage={uid => { void openDm(uid) }}
              onManageCohosts={cohostsApi.open}
              onOpenNotificationSettings={() => router.push(routes.settings('notifications'))}
              onRemoveAttendee={p => removeDialog.open(attendeeRemoveTarget(p))}
              onRemoveGuest={g => removeDialog.open(guestRemoveTarget(g))}
              onDeny={(uid, displayName) => dialog.open({ kind: 'deny', userId: uid, displayName })}
            />

            {onDetails && showRecapFooter && (
              <RecapFooter
                attended={recap.attended}
                onShare={() => { void recap.share() }}
                onGiveCheers={() => selectTab(EVENT_TAB.cheers)}
                sharing={recap.sharing}
                docScrollActive={tabs.docScrollActive}
                bottomInset={insets.bottom}
                onHeightChange={setFooterHeight}
              />
            )}
            {onDetails && !showRecapFooter && (
              <JoinFooter
                eventDate={event.event_date}
                eventStatus={eventStatus}
                requiresApproval={requiresApproval}
                attendance={attendance}
                onLeave={leave.open}
                onAddGuest={() => dialog.open({ kind: 'guest' })}
                docScrollActive={tabs.docScrollActive}
                bottomInset={insets.bottom}
                onHeightChange={setFooterHeight}
              />
            )}
          </>
        )}
      </ScreenState>
      )}

      <EventDialogs
        event={event}
        dialog={dialog}
        attendance={attendance}
        joinIntent={joinIntent}
        leave={leave}
        cohosts={cohostsApi}
        removeDialog={removeDialog}
        hostName={hostName}
        firstName={data.viewerProfile?.first_name ?? null}
        spotsLeft={eventStatus.spotsLeft}
        isMobileWeb={isMobileWeb}
        onDelete={() => { void deleteEvent.mutate(undefined) }}
      />

      {/* Native: floating pills over the banner (rendered last so they sit on top) */}
      {Platform.OS !== 'web' && headerActions}

      <DragGhost drag={drag} attendees={roster.attendees} assignments={teams.assignments} />
    </View>
  )
}
