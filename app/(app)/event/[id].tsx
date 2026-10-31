import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Platform, ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useMutation } from '../../../lib/query'
import { setDocScrollClaim } from '../../../lib/docScroll'
import { useIsNarrowWeb } from '../../../hooks/useIsNarrowWeb'
import { useOpenDm } from '../../../hooks/useOpenDm'
import { useSilencedUserIds } from '../../../hooks/useSilencedUsers'
import {
  attendeeRemoveTarget,
  computeEventStatus,
  eventCardSeed,
  forgetDeletedEvent,
  guestRemoveTarget,
  isEventOver,
  paymentVisibility,
  reportEventError,
  useCohosts,
  useEventAttendance,
  useEventCheers,
  useEventComments,
  useEventData,
  useEventPayments,
  useEventTeams,
  useKeyboardInset,
  useRemoveDialog,
  useTeamDrag,
} from '../../../hooks/event'
import { Pager } from '../../../components/Pager'
import { ScreenState } from '../../../components/ui'
import { CheersTab } from '../../../components/event/CheersTab'
import { DetailsTab } from '../../../components/event/DetailsTab'
import { DiscussionTab } from '../../../components/event/DiscussionTab'
import { PeopleTab } from '../../../components/event/PeopleTab'
import { EventHeaderActions } from '../../../components/event/EventHeaderActions'
import { EventHero } from '../../../components/event/EventHero'
import { EventDetailSkeleton } from '../../../components/event/EventDetailSkeleton'
import { EventTabBar, EVENT_TABS } from '../../../components/event/EventTabBar'
import { JoinFooter } from '../../../components/event/JoinFooter'
import { DragGhost } from '../../../components/event/DragGhost'
import { AddGuestDialog } from '../../../components/event/AddGuestDialog'
import { CohostsDialog } from '../../../components/event/CohostsDialog'
import { DenyRequestDialog } from '../../../components/event/DenyRequestDialog'
import { DeleteEventDialog } from '../../../components/event/DeleteEventDialog'
import { RemoveParticipantDialog } from '../../../components/event/RemoveParticipantDialog'
import { theme } from '../../../constants'
import type { MentionUser, Profile } from '../../../types'
import { profileDisplayName } from '../../../utils'
import { routes, isAppPath, toRoute } from '../../../utils/routes'

const DETAILS_TAB = 0
const PEOPLE_TAB = 1
const DISCUSSION_TAB = 2
const CHEERS_TAB = 3

function initialTab(tab: string | undefined): number {
  const t = parseInt(tab ?? '0', 10)
  return isNaN(t) ? DETAILS_TAB : Math.max(0, Math.min(EVENT_TABS.length - 1, t))
}

/**
 * Event detail: banner + Details / People / Discussion / Cheers tabs, the RSVP
 * footer and the host's dialogs. Data and writes live in `hooks/event/*`; this
 * screen wires them to the tab components and owns only layout state.
 */
export default function EventDetail() {
  const { id, from, tab } = useLocalSearchParams<{ id: string; from?: string; tab?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isMobileWeb = useIsNarrowWeb()

  // ── Data + writes ──────────────────────────────────────────────────────────
  const data = useEventData(id)
  const { event, userId, cohosts, roster } = data
  const isOwner = !!event && event.created_by === userId
  const isHostOrCohost = isOwner || cohosts.some(c => c.user_id === userId)
  const eventOver = isEventOver(event)

  const attendance = useEventAttendance(data)
  const teams = useEventTeams(data, isHostOrCohost)
  const drag = useTeamDrag(teams.moveToTeam)
  const cohostsApi = useCohosts(data)
  const removeDialog = useRemoveDialog()
  const { openDm } = useOpenDm()
  // Only hosts/co-hosts get roster Message actions, so only they need silences.
  // One-directional by RLS: a host can't learn who has silenced *them*.
  const { silencedUserIds } = useSilencedUserIds(isHostOrCohost)
  const [denyTarget, setDenyTarget] = useState<{ userId: string; displayName: string } | null>(null)
  const [guestDialogOpen, setGuestDialogOpen] = useState(false)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(() => initialTab(tab))
  // Lazy-mount each tab on first visit (People is prefetched next to Details).
  const [mountedTabs, setMountedTabs] = useState(() => {
    const start = initialTab(tab)
    const initial = new Set<number>([DETAILS_TAB, start])
    if (start === DETAILS_TAB) initial.add(PEOPLE_TAB)
    return initial
  })
  useEffect(() => {
    setMountedTabs(prev => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)))
  }, [activeTab])

  const cheers = useEventCheers(id, userId, activeTab === CHEERS_TAB && eventOver)
  const selectTab = (next: number) => {
    if (next !== CHEERS_TAB) cheers.clearDraft()
    setActiveTab(next)
  }

  // ── Document-scroll mode (mobile web) — Details & People tabs only.
  // Discussion/Cheers keep the app-shell layout (bottom-anchored composer).
  // This page manages body.doc-scroll itself since the tabs shell can't see
  // the inner tab state (CSS lives in app/+html.tsx).
  const docScrollActive = isMobileWeb && (activeTab === DETAILS_TAB || activeTab === PEOPLE_TAB)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    setDocScrollClaim('event-detail', docScrollActive)
    return () => setDocScrollClaim('event-detail', false)
  }, [docScrollActive])
  useEffect(() => {
    if (docScrollActive) window.scrollTo(0, 0)
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Discussion: chat-style pinned-to-bottom scroll ─────────────────────────
  const discussionScrollRef = useRef<ScrollView>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const keyboardInset = useKeyboardInset(activeTab === DISCUSSION_TAB)
  const scrollDiscussionToBottom = useCallback((animated: boolean) => {
    // scrollToEnd can fail before layout; delay a frame.
    requestAnimationFrame(() => discussionScrollRef.current?.scrollToEnd({ animated }))
  }, [])
  const discussion = useEventComments(data, { isHostOrCohost, onPosted: () => scrollDiscussionToBottom(true) })
  useEffect(() => {
    if (keyboardInset <= 0) return
    const t = setTimeout(() => discussionScrollRef.current?.scrollToEnd({ animated: true }), 64)
    return () => clearTimeout(t)
  }, [keyboardInset])
  // Keyed on the newest comment, not the count: "Load earlier" prepends and must not jump to the bottom.
  const newestCommentId = data.comments[data.comments.length - 1]?.id
  useEffect(() => {
    if (activeTab === DISCUSSION_TAB) scrollDiscussionToBottom(false)
  }, [activeTab, newestCommentId, composerHeight, scrollDiscussionToBottom])

  // ── @mentions: attendees + co-hosts + host, excluding self ─────────────────
  const mentionProfiles = useMemo(() => {
    const list: Profile[] = [...roster.attendees]
    cohosts.forEach(c => list.push(c.profiles as Profile))
    if (event?.profiles) list.push(event.profiles as Profile)
    return list
  }, [roster.attendees, cohosts, event])
  const mentionableUsers = useMemo<MentionUser[]>(() => {
    const seen = new Set<string>()
    const result: MentionUser[] = []
    for (const p of mentionProfiles) {
      if (!p || seen.has(p.id) || p.id === userId) continue
      seen.add(p.id)
      result.push({ id: p.id, username: p.username, displayName: profileDisplayName(p) })
    }
    return result
  }, [mentionProfiles, userId])
  // username → profile id, for tappable mentions in EventCommentRow.
  const usernameToId = useMemo(() => {
    const m = new Map<string, string>()
    mentionProfiles.forEach(p => { if (p?.username) m.set(p.username, p.id) })
    return m
  }, [mentionProfiles])

  const eventStatus = computeEventStatus({
    event,
    rows: roster.rows,
    attendingGuestCount: roster.attendingGuests.length,
    userId,
    isHostOrCohost,
  })
  // "I've paid" (#6): paid events only, for the attendee and the hosts.
  const paymentAccess = paymentVisibility({ event, userId, status: eventStatus, isHostOrCohost })
  const payments = useEventPayments(id, userId, {
    enabled: paymentAccess.canToggle || paymentAccess.canSeeAll,
    onRoster: eventStatus.isAttending || eventStatus.isWaitlisted,
  })
  // An explicit host setting; never inferred from price.
  const requiresApproval = event?.requires_approval === true
  const [footerHeight, setFooterHeight] = useState(80)

  // ── Navigation + host actions ──────────────────────────────────────────────
  function goBack() {
    // back() first — it cleanly pops the event screen, so a stale screen can't make a
    // later push load the wrong event. replace() only for direct URL loads (no history).
    if (router.canGoBack()) router.back()
    else {
      const back = from ? decodeURIComponent(from) : null
      router.replace(isAppPath(back) ? toRoute(back) : routes.events())
    }
  }

  const deleteEvent = useMutation(
    async () => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    {
      onSuccess: () => {
        router.replace(routes.events())
        forgetDeletedEvent(id)
      },
      onError: e => {
        reportEventError(id, userId, 'confirmDelete', e)
        Alert.alert('Error', 'Could not delete event. Please try again.')
      },
    },
  )

  async function confirmRemove() {
    const target = removeDialog.target
    if (target && (await attendance.removeParticipant(target))) removeDialog.close()
  }

  async function confirmDeny(reason: string) {
    if (denyTarget && (await attendance.denyRequest(denyTarget.userId, reason))) setDenyTarget(null)
  }

  const headerActions = (
    <EventHeaderActions
      eventId={id}
      title={event?.title}
      eventDate={event?.event_date}
      canManage={isHostOrCohost}
      deleting={deleteEvent.isPending}
      onBack={goBack}
      onEdit={() => router.push(routes.host({ edit: id }))}
      onDelete={() => setDeleteConfirmVisible(true)}
      onManageCohosts={isOwner ? cohostsApi.open : undefined}
    />
  )
  const loadError = data.loadError?.message ?? (data.notFound ? 'Event not found' : null)
  const openProfile = (profileId: string) => router.push(routes.profileOf(profileId))
  const placeholder = <View style={{ flex: 1 }} />

  return (
    <View
      ref={drag.containerRef}
      style={[
        { backgroundColor: theme.colors.background },
        // Doc-scroll mode: auto height so content extends the document (body scrolls)
        docScrollActive ? ({ minHeight: '100dvh' } as object) : { flex: 1 },
      ]}
      pointerEvents={removeDialog.target !== null || denyTarget !== null ? 'none' : 'auto'}
      onLayout={drag.measureContainerOffset}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

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
              {mountedTabs.has(DETAILS_TAB) ? (
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
                  payments={paymentAccess.canToggle ? payments : null}
                />
              ) : placeholder}

              {mountedTabs.has(PEOPLE_TAB) ? (
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
                  onDeny={(uid, displayName) => setDenyTarget({ userId: uid, displayName })}
                  onMessage={uid => { void openDm(uid) }}
                  silencedUserIds={silencedUserIds}
                  payments={paymentAccess.canSeeAll ? payments : null}
                />
              ) : placeholder}

              {mountedTabs.has(DISCUSSION_TAB) ? (
                <DiscussionTab
                  discussion={discussion}
                  data={data}
                  isHostOrCohost={isHostOrCohost}
                  usernameToId={usernameToId}
                  mentionableUsers={mentionableUsers}
                  scrollRef={discussionScrollRef}
                  isActive={activeTab === DISCUSSION_TAB}
                  scrollToBottom={scrollDiscussionToBottom}
                  keyboardInset={keyboardInset}
                  bottomInset={insets.bottom}
                  onComposerLayout={setComposerHeight}
                />
              ) : placeholder}

              {mountedTabs.has(CHEERS_TAB) ? (
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

            {activeTab === DETAILS_TAB && (
              <JoinFooter
                eventDate={event.event_date}
                eventStatus={eventStatus}
                requiresApproval={requiresApproval}
                attendance={attendance}
                onAddGuest={() => setGuestDialogOpen(true)}
                docScrollActive={docScrollActive}
                bottomInset={insets.bottom}
                onHeightChange={setFooterHeight}
              />
            )}
          </>
        )}
      </ScreenState>
      )}

      <AddGuestDialog
        visible={guestDialogOpen}
        adding={attendance.addingGuest}
        onDismiss={() => setGuestDialogOpen(false)}
        onSubmit={attendance.addGuest}
      />
      <CohostsDialog cohosts={cohostsApi} />
      <DenyRequestDialog
        target={denyTarget}
        processing={attendance.processingRequest !== null}
        onCancel={() => setDenyTarget(null)}
        onConfirm={reason => { void confirmDeny(reason) }}
      />
      <RemoveParticipantDialog
        target={removeDialog.target}
        armed={removeDialog.armed}
        removing={attendance.removing}
        onCancel={removeDialog.close}
        onConfirm={() => { void confirmRemove() }}
      />
      <DeleteEventDialog
        visible={deleteConfirmVisible}
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={() => { setDeleteConfirmVisible(false); void deleteEvent.mutate(undefined) }}
      />

      {/* Native: floating pills over the banner (rendered last so they sit on top) */}
      {Platform.OS !== 'web' && headerActions}

      <DragGhost drag={drag} attendees={roster.attendees} assignments={teams.assignments} />
    </View>
  )
}
