import React, { useMemo } from 'react'
import { Platform, View, TouchableOpacity } from 'react-native'
import { Text } from '../ui/Text'
import { RefreshControl } from '../RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Calendar from 'expo-calendar'
import { DocScrollView } from '../DocScrollView'
import { VenmoPayButton } from '../VenmoPayButton'
import { WebPushNudge } from './WebPushNudge'
import { useFriends } from '../../hooks/useFriends'
import { attendeeRowsWithProfiles } from '../../hooks/event/derive'
import { friendsGoingFromAttendees } from '../../utils/friends'
import { PaidToggle } from './PaidToggle'
import { Button } from '../Button'
import { NO_SHOW_MESSAGE_HOST, NO_SHOW_PLAYER_BODY, NO_SHOW_PLAYER_TITLE } from '../../constants/copy'
import { ForecastRow } from './ForecastRow'
import { EventFactChips, EventHostNote, EventWhenWhere, EventWhoIsIn } from './EventSummary'
import { BringListCard } from './BringListCard'
import { useEventBringList } from '../../hooks/event/useEventBringList'
import { eventDateMs } from '../../hooks/event/derive'
import { eventScrollKey } from '../../utils/scrollMemory'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { shared, theme, LOCATIONS } from '../../constants'
import type { EventWithDetails, Profile, AttendanceStatus } from '../../types'
import type { EventData, EventPaymentsApi } from '../../types'
import { profileDisplayName, formatPriceAmount, isSurface } from '../../utils'
import { toast } from '../../lib/toast'
import { deviceTimeZone } from '../../utils/dateFormat'

async function addToCalendar(title: string, startIso: string, durationMinutes: number, address?: string) {
  const normalized = /[Z+]/.test(startIso) ? startIso : startIso + 'Z'
  const startDate = new Date(normalized)
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000)

  if (Platform.OS === 'web') {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${fmt(startDate)}/${fmt(endDate)}`,
      ...(address ? { location: address } : {}),
    })
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener,noreferrer')
    return
  }

  const { status } = await Calendar.requestCalendarPermissionsAsync()
  if (status !== 'granted') {
    toast.show({ title: 'Calendar access needed', message: 'Allow calendar access in Settings to add this event.', variant: 'warning' })
    return
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  // Prefer the default calendar; fall back to the first writable one
  const defaultCal =
    calendars.find(c => c.allowsModifications && (c as any).isDefault) ??
    calendars.find(c => c.allowsModifications)

  if (!defaultCal) {
    toast.show({ title: 'No calendar found', message: "Couldn't find a calendar on this device to add it to.", variant: 'warning' })
    return
  }

  await Calendar.createEventAsync(defaultCal.id, {
    title,
    startDate,
    endDate,
    timeZone: deviceTimeZone(),
    ...(address ? { location: address } : {}),
  })

  toast.show({ title: 'Added to calendar', message: `"${title}" is on your calendar.`, variant: 'success' })
}

type Props = {
  event: EventWithDetails
  /** Co-hosts, viewer id and pull-to-refresh. */
  data: EventData
  eventStatus: AttendanceStatus
  isOwner: boolean
  docScrollActive: boolean
  descFooterHeight: number
  bottomInset: number
  onOpenProfile: (userId: string) => void
  onMessageHost: (hostId: string) => void
  onManageCohosts: () => void
  /** The "Get a reminder?" line's install steps (#189): Settings → Notifications. */
  onOpenNotificationSettings: () => void
  /** "I've paid" toggle; null when the viewer can't set one (free event, not on the roster, the creator). */
  payments: EventPaymentsApi | null
  /** The host flagged the viewer as a no-show (#151): show them why they get no points. */
  noShow?: boolean
  /** Host or co-host: may claim "What to bring" items without being on the roster (#256). */
  isHostOrCohost?: boolean
  /** Finished game (#227): "Your game" and the host's next game, at the top. */
  recap?: React.ReactNode
  /** Who's in opens the People tab. */
  onOpenPeople: () => void
}

export function DetailsTab({
  event,
  data,
  eventStatus,
  isOwner,
  docScrollActive,
  descFooterHeight,
  bottomInset,
  onOpenProfile,
  onMessageHost,
  onManageCohosts,
  onOpenNotificationSettings,
  payments,
  noShow = false,
  isHostOrCohost = false,
  recap = null,
  onOpenPeople,
}: Props) {
  const { refreshing, refresh: onRefresh, cohosts, userId } = data
  const requireSignIn = useRequireSignIn()
  const bring = useEventBringList(event.id, userId ?? null, { surface: isSurface(event.surface) ? event.surface : null })
  const bringViewer = useMemo(() => ({
    userId: userId ?? null,
    canClaim: eventStatus.isAttending || isHostOrCohost,
    closed: !!event.cancelled_at || Date.now() >= eventDateMs(event.event_date),
  }), [userId, eventStatus.isAttending, isHostOrCohost, event.cancelled_at, event.event_date])
  const totalAttending = eventStatus.count
  const { data: myFriends } = useFriends()
  const friendsGoing = useMemo(
    () => friendsGoingFromAttendees(event.id, attendeeRowsWithProfiles(event), myFriends.friends),
    [event, myFriends.friends],
  )
  return (
    <DocScrollView
      docScroll={docScrollActive}
      memoryKey={eventScrollKey(event.id, 'details')}
      style={shared.screen}
      contentContainerStyle={[shared.scrollContent, { paddingBottom: descFooterHeight + Math.max(bottomInset, theme.spacing.md) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      {recap}

      {/* ── The viewer was marked as a no-show (#151) ── */}
      {noShow && (
        <View testID="no-show-card" style={shared.noShowCard}>
          <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.base, color: theme.colors.text }}>
            {NO_SHOW_PLAYER_TITLE}
          </Text>
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtextStrong, lineHeight: 20 }}>{NO_SHOW_PLAYER_BODY}</Text>
          {event.created_by !== userId && (
            <Button label={NO_SHOW_MESSAGE_HOST} variant="primary" onPress={() => onMessageHost(event.created_by)} testID="no-show-message-host" />
          )}
        </View>
      )}

      {/* ── The facts as coloured chips, then When / Where, who's in and the host's note (Party invite) ── */}
      <EventFactChips event={event} />
      <EventWhenWhere
        event={event}
        onAddToCalendar={() => void addToCalendar(
          event.title,
          event.event_date,
          event.duration_minutes ?? 120,
          LOCATIONS.find(l => l.id === event.location)?.address,
        )}
      />
      <EventWhoIsIn
        event={event}
        status={eventStatus}
        friendsGoing={friendsGoing}
        onOpenPeople={onOpenPeople}
        footer={eventStatus.isAttending && !event.cancelled_at && eventDateMs(event.event_date) > Date.now()
          ? <WebPushNudge onOpenSettings={onOpenNotificationSettings} />
          : null}
      />
      {event.profiles && (
        <EventHostNote
          hosts={[
            { id: event.profiles.id, name: profileDisplayName(event.profiles), avatarUrl: event.profiles.avatar_url, border: event.profiles.selected_border, isMe: event.profiles.id === userId, label: 'Host' as const },
            ...cohosts.map(c => {
              const p = c.profiles as Profile
              return { id: c.user_id, name: profileDisplayName(p), avatarUrl: p.avatar_url, border: p.selected_border, isMe: c.user_id === userId, label: 'Co-host' as const }
            }),
          ]}
          description={event.description ?? null}
          onOpenProfile={onOpenProfile}
          onMessage={onMessageHost}
        />
      )}
      {/* Forecast, under the facts: sand / grass events with coordinates (#165) */}
      <ForecastRow event={event} />

      {/* Pay the host: Venmo for non-owners of a paid game, and the "I've paid" switch */}
      {((!isOwner && event.price != null && event.price > 0 && !!event.venmo_handle) || !!payments) && (
        <View style={shared.evCard}>
          {!isOwner && event.price != null && event.price > 0 && event.venmo_handle && (
            <VenmoPayButton
              handle={event.venmo_handle}
              amount={formatPriceAmount(event.price)}
              title={event.title}
              date={event.event_date}
              label={`Pay $${formatPriceAmount(event.price)} via Venmo`}
            />
          )}
          {payments && (
            <PaidToggle paid={payments.iPaid} saving={payments.saving} onChange={payments.setPaid} />
          )}
        </View>
      )}

      {/* ── What to bring (#256) ── */}
      <BringListCard
        items={bring.items}
        viewer={bringViewer}
        pending={bring.pending}
        onClaim={bring.claim}
        onRelease={bring.release}
        onSignIn={() => { requireSignIn() }}
      />

      {/* Cohosts — manage section (owner only) */}
      {isOwner && (
        <TouchableOpacity
          onPress={onManageCohosts}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}
        >
          <Ionicons name="person-add-outline" size={14} color={theme.colors.primaryText} />
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primaryText, fontWeight: theme.font.weight.medium }}>
            Manage Co-hosts{cohosts.length > 0 ? ` (${cohosts.length})` : ''}
          </Text>
        </TouchableOpacity>
      )}

    </DocScrollView>
  )
}
