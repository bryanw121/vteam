import React from 'react'
import { Platform, View, TouchableOpacity, Alert } from 'react-native'
import { Text } from '../ui/Text'
import { RefreshControl } from '../RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Linking from 'expo-linking'
import * as Calendar from 'expo-calendar'
import { ProfileAvatar } from '../ProfileAvatar'
import { DocScrollView } from '../DocScrollView'
import { LinkedText } from '../LinkedText'
import { VenmoPayButton } from '../VenmoPayButton'
import { PaidToggle } from './PaidToggle'
import { shared, theme, LOCATIONS } from '../../constants'
import type { EventWithDetails, Profile, AttendanceStatus } from '../../types'
import type { EventData, EventPaymentsApi } from '../../types'
import { profileDisplayName, profileInitial, formatDuration, formatPrice, formatPriceAmount, profileAvatarSmallUri } from '../../utils'

function formatEndTime(startIso: string, durationMinutes: number): string {
  const normalized = /[Z+]/.test(startIso) ? startIso : startIso + 'Z'
  const end = new Date(new Date(normalized).getTime() + durationMinutes * 60_000)
  return end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function openInMaps(address: string) {
  const encoded = encodeURIComponent(address)
  if (Platform.OS === 'ios') {
    void Linking.openURL(`maps:?q=${encoded}`)
  } else if (Platform.OS === 'android') {
    void Linking.openURL(`geo:0,0?q=${encoded}`)
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank', 'noopener,noreferrer')
  }
}

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
    Alert.alert('Permission required', 'Please allow calendar access in Settings to add this event.')
    return
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  // Prefer the default calendar; fall back to the first writable one
  const defaultCal =
    calendars.find(c => c.allowsModifications && (c as any).isDefault) ??
    calendars.find(c => c.allowsModifications)

  if (!defaultCal) {
    Alert.alert('No calendar found', 'Could not find a writable calendar on this device.')
    return
  }

  await Calendar.createEventAsync(defaultCal.id, {
    title,
    startDate,
    endDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(address ? { location: address } : {}),
  })

  Alert.alert('Added to calendar', `"${title}" has been added to your calendar.`)
}

function HostRow({
  name, avatarUrl, border, label, isMe, onMessage, onPress,
}: {
  name: string; avatarUrl?: string | null
  border?: Profile['selected_border']; label: string; isMe: boolean
  onMessage: () => void; onPress: () => void
}) {
  const avatarUri = profileAvatarSmallUri(avatarUrl)
  return (
    <TouchableOpacity
      activeOpacity={isMe ? 1 : 0.75}
      onPress={isMe ? undefined : onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
    >
      <ProfileAvatar uri={avatarUri} border={border ?? null} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.base, color: theme.colors.text, letterSpacing: -0.2 }}>{name}</Text>
      </View>
      {!isMe && (
        <TouchableOpacity onPress={onMessage} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }} hitSlop={4}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.text }}>Message</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
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
  /** "I've paid" toggle; null when the viewer can't set one (free event, not on the roster, the creator). */
  payments: EventPaymentsApi | null
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
  payments,
}: Props) {
  const { refreshing, refresh: onRefresh, cohosts, userId } = data
  const totalAttending = eventStatus.count
  return (
    <DocScrollView
      docScroll={docScrollActive}
      style={shared.screen}
      contentContainerStyle={[shared.scrollContent, { paddingBottom: descFooterHeight + Math.max(bottomInset, theme.spacing.md) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >

      {/* ── Quick-stats strip ── */}
      {(() => {
        const dur = formatDuration(event.duration_minutes ?? 120)
        const priceStr = formatPrice(event.price)
        const capStr = event.max_attendees ? `${totalAttending}/${event.max_attendees}` : '∞'
        const stats = [
          { k: dur,      l: 'Duration' },
          { k: priceStr, l: 'Price' },
          { k: capStr,   l: 'Capacity' },
        ]
        return (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md }}>
            {stats.map(s => (
              <View key={s.l} style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}>
                <Text
                  testID={s.l === 'Price' ? 'event-price-stat' : undefined}
                  style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.sm, letterSpacing: -0.5, color: theme.colors.text }}
                >
                  {s.k}
                </Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 2 }}>{s.l}</Text>
              </View>
            ))}
          </View>
        )
      })()}

      {/* ── Host card ── */}
      {event.profiles && (() => {
        const host = event.profiles
        const allHosts = [
          { id: host.id, name: profileDisplayName(host), initial: profileInitial(host), avatarUrl: host.avatar_url, border: host.selected_border, isMe: host.id === userId, label: 'Host' as const },
          ...cohosts.map(c => {
            const p = c.profiles as Profile
            return { id: c.user_id, name: profileDisplayName(p), initial: profileInitial(p), avatarUrl: p.avatar_url, border: p.selected_border, isMe: c.user_id === userId, label: 'Co-host' as const }
          }),
        ]
        return (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md, overflow: 'hidden' }}>
            {allHosts.map((h, idx) => (
              <View key={h.id} style={idx > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                <HostRow
                  name={h.name}
                  avatarUrl={h.avatarUrl}
                  border={h.border}
                  label={h.label}
                  isMe={h.isMe}
                  onPress={() => onOpenProfile(h.id)}
                  onMessage={() => onMessageHost(h.id)}
                />
              </View>
            ))}
          </View>
        )
      })()}

      {/* ── Tags + capacity ── */}
      <View style={{ marginBottom: theme.spacing.md }}>

        {/* Tag chips */}
        {(event.event_tags?.filter(et => et.tags.category !== 'skill_level').length ?? 0) > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: theme.spacing.sm }}>
            {[...(event.event_tags ?? [])].filter(et => et.tags.category !== 'skill_level').sort((a, b) => a.tags.display_order - b.tags.display_order).map(et => {
              const name = et.tags.name.toLowerCase()
              const isOpenPlay   = name.includes('open play') || name.includes('open-play')
              const isTournament = name.includes('tournament')
              const bg     = isOpenPlay ? theme.colors.success + '1A' : isTournament ? theme.colors.warning + '1A' : theme.colors.primary + '1A'
              const border = isOpenPlay ? theme.colors.success + '40' : isTournament ? theme.colors.warning + '40' : theme.colors.primary + '40'
              const color  = isOpenPlay ? theme.colors.success : isTournament ? theme.colors.warning : theme.colors.primary
              return (
                <View key={et.tag_id} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: bg, borderWidth: 1, borderColor: border }}>
                  <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color }}>{et.tags.name}</Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Capacity bar + status badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          {event.max_attendees ? (
            <View style={{ flex: 1, minWidth: 160, gap: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: theme.font.size.sm, color: eventStatus.isFull ? theme.colors.error : theme.colors.subtext }}>
                  {eventStatus.isFull ? 'Full' : `${eventStatus.spotsLeft} spot${eventStatus.spotsLeft !== 1 ? 's' : ''} left`}
                </Text>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{totalAttending}/{event.max_attendees}</Text>
              </View>
              <View style={{ height: 5, backgroundColor: theme.colors.border, borderRadius: 3 }}>
                <View style={{
                  height: 5,
                  width: `${Math.round(Math.min(1, totalAttending / event.max_attendees) * 100)}%`,
                  backgroundColor: eventStatus.isFull ? theme.colors.error : (totalAttending / event.max_attendees) >= 0.85 ? theme.colors.warning : theme.colors.primary,
                  borderRadius: 3,
                }} />
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{totalAttending} attending</Text>
          )}
          {eventStatus.isAttending && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.success + '1A', borderWidth: 1, borderColor: theme.colors.success + '40' }}>
              <Ionicons name="checkmark-circle" size={13} color={theme.colors.success} />
              <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.success }}>You're going</Text>
            </View>
          )}
          {eventStatus.isWaitlisted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.warning + '1A', borderWidth: 1, borderColor: theme.colors.warning + '40' }}>
              <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.warning }}>#{eventStatus.waitlistPosition} on waitlist</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Info rows ── */}
      <View style={[shared.card, { gap: 0, marginBottom: theme.spacing.md }]}>

        {/* Date / time row */}
        {(() => {
          const normalized = /[Z+]/.test(event.event_date) ? event.event_date : event.event_date + 'Z'
          const d = new Date(normalized)
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          const startStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          const endStr = formatEndTime(event.event_date, event.duration_minutes ?? 120)
          const dur = formatDuration(event.duration_minutes ?? 120)
          return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
          <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1, gap: theme.spacing.xs, paddingTop: 2 }}>
            <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
              {dateStr}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <Ionicons name="time-outline" size={13} color={theme.colors.subtext} />
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
                {startStr} – {endStr}
              </Text>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.border, marginHorizontal: 2 }} />
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{dur}</Text>
            </View>
            <TouchableOpacity
              onPress={() => void addToCalendar(
                event.title,
                event.event_date,
                event.duration_minutes ?? 120,
                LOCATIONS.find(l => l.id === event.location)?.address,
              )}
              hitSlop={8}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
            >
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
                Add to calendar
              </Text>
              <Ionicons name="arrow-forward" size={12} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
          )
        })()}

        {/* Location row */}
        {event.location ? (() => {
          const venue = LOCATIONS.find(l => l.label === event.location || l.id === event.location)
          const address = venue?.address
          const mapsQuery = venue && address ? `${venue.label} ${address}` : address ?? event.location
          return (
            <>
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
                <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="location-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, paddingTop: 2 }}>
                  <Text testID="event-location-name" style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                    {venue ? venue.label : event.location}
                  </Text>
                  {address && (
                    <Text selectable style={[shared.caption, { marginTop: 2 }]}>{address}</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => openInMaps(mapsQuery)}
                    hitSlop={8}
                    accessibilityRole="link"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: theme.spacing.xs }}
                  >
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
                      Show in Maps
                    </Text>
                    <Ionicons name="arrow-forward" size={12} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )
        })() : null}

        {/* Difficulty row */}
        {(() => {
          const diffTags = (event.event_tags ?? [])
            .filter(et => et.tags.category === 'skill_level')
            .sort((a, b) => a.tags.display_order - b.tags.display_order)
          if (diffTags.length === 0) return null
          return (
            <>
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
                <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="speedometer-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Difficulty
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {diffTags.map(et => (
                      <View key={et.tag_id} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary + '14', borderWidth: 1, borderColor: theme.colors.primary + '30' }}>
                        <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }}>
                          {et.tags.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </>
          )
        })()}

        {/* Price row */}
        <>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
            <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name="cash-outline" size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                Price
              </Text>
              {event.price != null && event.price > 0 ? (
                <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                  {formatPrice(event.price)}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full, backgroundColor: theme.colors.success + '1A', borderWidth: 1, borderColor: theme.colors.success + '40' }}>
                    <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.success }}>Free</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </>

        {/* Pay via Venmo — shown to non-owners when price > 0 and venmo_handle set */}
        {!isOwner && event.price != null && event.price > 0 && event.venmo_handle && (
          <View style={{ marginTop: theme.spacing.sm }}>
            <VenmoPayButton
              handle={event.venmo_handle}
              amount={formatPriceAmount(event.price)}
              title={event.title}
              date={event.event_date}
              label={`Pay $${formatPriceAmount(event.price)} via Venmo`}
            />
          </View>
        )}
        {payments && (
          <PaidToggle paid={payments.iPaid} saving={payments.saving} onChange={payments.setPaid} />
        )}

      </View>

      {/* ── About / description card ── */}
      {event.description ? (
        <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md }}>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>About</Text>
          <LinkedText text={event.description} style={{ fontSize: theme.font.size.sm, color: theme.colors.text, lineHeight: 20 }} />
        </View>
      ) : null}

      {/* Cohosts — manage section (owner only) */}
      {isOwner && (
        <TouchableOpacity
          onPress={onManageCohosts}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}
        >
          <Ionicons name="person-add-outline" size={14} color={theme.colors.primary} />
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
            Manage Co-hosts{cohosts.length > 0 ? ` (${cohosts.length})` : ''}
          </Text>
        </TouchableOpacity>
      )}

    </DocScrollView>
  )
}
