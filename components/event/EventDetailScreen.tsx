import React, { useState } from 'react'
import { Platform, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useIsNarrowWeb } from '../../hooks/useIsNarrowWeb'
import { useOpenDm } from '../../hooks/useOpenDm'
import { useSilencedUserIds } from '../../hooks/useSilencedUsers'
import {
  attendeeRemoveTarget, eventCardSeed, guestRemoveTarget, isEventOver, isViewerNoShow,
  useCohosts, useDeleteEvent, useEventAttendance, useEventData,
  useEventDiscussion, useEventRecap, useEventTabs, useEventTeams, useEventViewerStatus, useJoinIntent,
  useLeaveFlow, useRemoveDialog, useTeamDrag,
} from '../../hooks/event'
import { useEventBack } from '../../hooks/event/useEventBack'
import { useEventFirstPaint } from '../../hooks/event/useEventFirstPaint'
import { Pager } from '../../components/Pager'
import { ScreenState } from '../../components/ui'
import { CheersTab } from '../../components/event/CheersTab'
import { DetailsTab } from '../../components/event/DetailsTab'
import { DiscussionTab } from '../../components/event/DiscussionTab'
import { PeopleTab } from '../../components/event/PeopleTab'
import { EventHeaderActions } from '../../components/event/EventHeaderActions'
import { EventHero } from '../../components/event/EventHero'
import { EventDetailSkeleton } from '../../components/event/EventDetailSkeleton'
import { EventTabBar } from '../../components/event/EventTabBar'
import { EventFooter } from '../../components/event/EventFooter'
import { EventRecapCards } from '../../components/event/EventRecapCards'
import { EventDialogs } from '../../components/event/EventDialogs'
import { DragGhost } from '../../components/event/DragGhost'
import { theme, SWIPE_NAVIGATION } from '../../constants'
import { EVENT_TAB } from '../../utils/eventDetail'
import { profileDisplayName } from '../../utils'
import { routes } from '../../utils/routes'
import type { EventDialog } from '../../types'

/**
 * Event detail: banner + Details / People / Discussion / Cheers tabs, the RSVP
 * footer and the host's dialogs. This screen only composes (#354): data and
 * writes live in `hooks/event/*` (tabs, discussion, join intent, leave, recap,
 * delete), the decisions in `utils/eventDetail.ts`, and every sheet and dialog
 * in `EventDialogs`.
 *
 * Web loads this screen in its own chunk (EventDetailRoute.web.tsx), together
 * with Reanimated and Gesture Handler for the team drag (#193); the app root on
 * web has no GestureHandlerRootView, so the screen brings its own.
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
  useEventFirstPaint(!!event)

  const attendance = useEventAttendance(data)
  const teams = useEventTeams(data, isHostOrCohost)
  const drag = useTeamDrag(teams.moveToTeam)
  const cohostsApi = useCohosts(data)
  const removeDialog = useRemoveDialog()
  const { openDm, sendDm } = useOpenDm()
  // Only hosts/co-hosts get roster Message actions, so only they need silences.
  // One-directional by RLS: a host can't learn who has silenced *them*.
  const { silencedUserIds } = useSilencedUserIds(isHostOrCohost)
  const [dialog, setDialog] = useState<EventDialog>(null)

  // ── Tabs (URL, mount on first visit, document scroll on mobile web) ───────
  const { activeTab, selectTab, mountedTabs, docScrollActive, cheers } = useEventTabs(data, isMobileWeb)
  const discussion = useEventDiscussion(data, { isHostOrCohost, active: activeTab === EVENT_TAB.discussion })

  const { status: eventStatus, paymentAccess, payments } = useEventViewerStatus(data, isHostOrCohost)
  const [footerHeight, setFooterHeight] = useState(80)
  const hostName = event?.profiles ? profileDisplayName(event.profiles) : 'the host'

  const joinIntent = useJoinIntent({ eventId: id, userId, event, loading: data.isLoading, status: eventStatus, over: eventOver, requiresApproval: event?.requires_approval === true, attendance })
  const leave = useLeaveFlow({ event, userId, status: eventStatus, isHostOrCohost, iPaid: payments.iPaid, hostName, attendance, sendDm, openDm })
  const recap = useEventRecap({ eventId: id, userId, event, rows: roster.rows, over: eventOver })
  const goBack = useEventBack()
  const deleteEvent = useDeleteEvent(id, userId)

  const headerActions = (
    <EventHeaderActions
      eventId={id}
      tab={activeTab}
      title={event?.title}
      eventDate={event?.event_date}
      canManage={isHostOrCohost}
      deleting={deleteEvent.isPending}
      onBack={goBack}
      onEdit={() => router.push(routes.host({ edit: id }))}
      onDelete={() => setDialog({ kind: 'delete' })}
      onManageCohosts={isOwner ? cohostsApi.open : undefined}
    />
  )
  const loadError = data.loadError?.message ?? (data.notFound ? 'Event not found' : null)
  const openProfile = (profileId: string) => router.push(routes.profileOf(profileId))
  const placeholder = <View style={{ flex: 1 }} />

  return withWebGestureRoot(
    <View
      ref={drag.containerRef}
      style={[
        { backgroundColor: theme.colors.background },
        // Doc-scroll mode: auto height so content extends the document (body scrolls)
        docScrollActive ? ({ minHeight: '100dvh' } as object) : { flex: 1 },
      ]}
      pointerEvents={removeDialog.target !== null || dialog?.kind === 'deny' ? 'none' : 'auto'}
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
              <EventTabBar activeTab={activeTab} peopleCount={eventStatus.count} onSelect={selectTab} />
            </View>

            <Pager
              page={activeTab}
              onPageChange={selectTab}
              pagerBlockedRef={drag.pagerBlockedRef}
              staticRender={isMobileWeb}
              autoHeight={docScrollActive}
            >
              {mountedTabs.has(EVENT_TAB.details) ? (
                <DetailsTab
                  event={event}
                  data={data}
                  eventStatus={eventStatus}
                  isOwner={isOwner}
                  docScrollActive={docScrollActive}
                  descFooterHeight={footerHeight}
                  bottomInset={insets.bottom}
                  onOpenProfile={openProfile}
                  onMessageHost={hostId => { void openDm(hostId) }}
                  onManageCohosts={cohostsApi.open}
                  onOpenNotificationSettings={() => router.push(routes.settings('notifications'))}
                  payments={paymentAccess.canToggle ? payments : null}
                  noShow={isViewerNoShow(roster.rows, userId)}
                  isHostOrCohost={isHostOrCohost}
                  recap={eventOver ? <EventRecapCards event={event} userId={userId} recap={recap} /> : null}
                />
              ) : placeholder}

              {mountedTabs.has(EVENT_TAB.people) ? (
                <PeopleTab
                  event={event}
                  eventStatus={eventStatus}
                  data={data}
                  teams={teams}
                  drag={drag}
                  attendance={attendance}
                  isHostOrCohost={isHostOrCohost}
                  isMobileWeb={isMobileWeb}
                  docScrollActive={docScrollActive}
                  onOpenProfile={openProfile}
                  onRemoveAttendee={p => removeDialog.open(attendeeRemoveTarget(p))}
                  onRemoveGuest={g => removeDialog.open(guestRemoveTarget(g))}
                  onDeny={(uid, displayName) => setDialog({ kind: 'deny', target: { userId: uid, displayName } })}
                  onMessage={uid => { void openDm(uid) }}
                  silencedUserIds={silencedUserIds}
                  payments={paymentAccess.canSeeAll ? payments : null}
                />
              ) : placeholder}

              {mountedTabs.has(EVENT_TAB.discussion) ? (
                <DiscussionTab {...discussion} data={data} isHostOrCohost={isHostOrCohost} isActive={activeTab === EVENT_TAB.discussion} bottomInset={insets.bottom} />
              ) : placeholder}

              {mountedTabs.has(EVENT_TAB.cheers) ? (
                <CheersTab
                  cheers={cheers}
                  isEventOver={eventOver}
                  isAttending={eventStatus.isAttending}
                  isOwner={eventStatus.isOwner}
                  data={data}
                  teams={teams}
                  isMobileWeb={isMobileWeb}
                  bottomInset={insets.bottom}
                />
              ) : placeholder}
            </Pager>

            {activeTab === EVENT_TAB.details && !data.seedOnly && (
              <EventFooter
                event={event}
                over={eventOver}
                status={eventStatus}
                attendance={attendance}
                recap={recap}
                onLeave={leave.open}
                onAddGuest={() => setDialog({ kind: 'guest' })}
                onGiveCheers={() => selectTab(EVENT_TAB.cheers)}
                docScrollActive={docScrollActive}
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
        status={eventStatus}
        hostName={hostName}
        viewerFirstName={data.viewerProfile?.first_name ?? null}
        isMobileWeb={isMobileWeb}
        dialog={dialog}
        onCloseDialog={() => setDialog(null)}
        attendance={attendance}
        cohosts={cohostsApi}
        removeDialog={removeDialog}
        joinIntent={joinIntent}
        leave={leave}
        onPlayerSetup={() => router.push(routes.welcome(routes.event(id)))}
        onConfirmDelete={() => { void deleteEvent.mutate(undefined) }}
      />

      {/* Native: floating pills over the banner (rendered last so they sit on top) */}
      {Platform.OS !== 'web' && headerActions}

      <DragGhost drag={drag} attendees={roster.attendees} assignments={teams.assignments} />
    </View>
  )
}
