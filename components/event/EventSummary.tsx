import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { TimePill } from '../ui'
import { ProfileAvatar } from '../ProfileAvatar'
import { LinkedText } from '../LinkedText'
import { FriendsGoingLine } from '../FriendsGoingLine'
import { AttendeeStack } from '../eventCard/AttendeeStack'
import { openInMaps } from '../../lib/openInMaps'
import { eventDateMs, attendeeRowsWithProfiles } from '../../hooks/event/derive'
import { profilePrefetchProps } from '../../hooks/useUserProfile'
import { shared, LOCATIONS } from '../../constants'
import { SURFACE_LABELS } from '../../constants/events'
import { formatDuration, formatPrice, isSurface, profileAvatarSmallUri } from '../../utils'
import { formatDate, formatTime } from '../../utils/dateFormat'
import { pointsForEvent } from '../../utils/recap'
import type { EventFactChipsProps, EventHostNoteProps, EventWhenWhereProps, EventWhoIsInProps } from '../../types'

/**
 * The top of the event page's Details tab (Party invite): When and Where side by
 * side, who's in, the host's note, and the facts as chips. Each answers one
 * question a player asks before tapping Join.
 */

const AVATARS = 5

export function EventWhenWhere({ event, onAddToCalendar }: EventWhenWhereProps) {
  const start = new Date(eventDateMs(event.event_date))
  const minutes = event.duration_minutes ?? 120
  const end = new Date(start.getTime() + minutes * 60_000)
  const day = formatDate(start, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = formatTime(start, { hour: 'numeric', minute: '2-digit', hour12: true })
  const endTime = formatTime(end, { hour: 'numeric', minute: '2-digit', hour12: true })
  const venue = LOCATIONS.find(l => l.label === event.location || l.id === event.location)
  const place = venue?.label ?? event.location
  const mapsQuery = venue?.address ? `${venue.label} ${venue.address}` : venue?.address ?? event.location ?? ''

  return (
    <View style={shared.evPairRow}>
      <View style={shared.evTile} testID="event-when">
        <Text style={shared.evTileLabel}>When</Text>
        <Text style={shared.evTileMain}>{day}</Text>
        <View style={shared.evTileTimeRow}>
          <TimePill label={time} testID="event-hero-time" />
          <Text style={shared.evTileSub} numberOfLines={1}>to {endTime} · {formatDuration(minutes)}</Text>
        </View>
        <TouchableOpacity onPress={onAddToCalendar} accessibilityRole="button" hitSlop={8} style={shared.evTileLink}>
          <Text style={shared.evTileLinkText}>Add to calendar</Text>
        </TouchableOpacity>
      </View>
      <View style={shared.evTile} testID="event-where">
        <Text style={shared.evTileLabel}>Where</Text>
        <Text testID="event-location-name" style={shared.evTileMain} numberOfLines={2}>{place || 'To be announced'}</Text>
        {!!venue?.address && <Text selectable style={shared.evTileSub} numberOfLines={2}>{venue.address}</Text>}
        {!!place && (
          <TouchableOpacity onPress={() => openInMaps(mapsQuery)} accessibilityRole="link" hitSlop={8} style={shared.evTileLink}>
            <Text style={shared.evTileLinkText}>Directions</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export function EventWhoIsIn({ event, status, friendsGoing, onOpenPeople, footer }: EventWhoIsInProps) {
  const going = attendeeRowsWithProfiles(event).filter(a => a.status === 'attending')
  const previews = going.slice(0, AVATARS)
  const count = status.count
  const cap = event.max_attendees
  const spots = status.isFull ? 'Full' : cap ? `${status.spotsLeft} spot${status.spotsLeft !== 1 ? 's' : ''} left` : null

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onOpenPeople} accessibilityRole="button" accessibilityLabel={`Who's in: ${count}${cap ? ` of ${cap}` : ''}. Open People`} style={shared.evCard} testID="event-who">
      <View style={shared.evCardHead}>
        <Text style={shared.evCardTitle}>Who's in · {count}{cap ? `/${cap}` : ''}</Text>
        {spots && <Text style={[shared.evCardMeta, status.isFull && shared.evCardMetaFull]}>{spots}</Text>}
      </View>
      {previews.length > 0
        ? <AttendeeStack previews={previews} overflow={Math.max(0, count - previews.length)} variant="hero" />
        : <Text style={shared.evCardMeta}>Nobody yet. Be the first.</Text>}
      {(status.isAttending || status.isWaitlisted) && (
        <View style={[shared.evStatusPill, status.isWaitlisted && shared.evStatusPillWait]}>
          <Text style={[shared.evStatusText, status.isWaitlisted && shared.evStatusTextWait]}>
            {status.isAttending ? "You're going" : `#${status.waitlistPosition} on waitlist`}
          </Text>
        </View>
      )}
      <FriendsGoingLine going={friendsGoing} testID="event-friends-going" />
      {footer}
    </TouchableOpacity>
  )
}

function HostLine({ h, title, sub, size, onOpenProfile, onMessage }: { h: EventHostNoteProps['hosts'][number]; title: string; sub: string; size: number; onOpenProfile: (id: string) => void; onMessage: (id: string) => void }) {
  return (
    <View style={shared.evHostRow}>
      <TouchableOpacity
        activeOpacity={h.isMe ? 1 : 0.75}
        onPress={h.isMe ? undefined : () => onOpenProfile(h.id)}
        {...profilePrefetchProps(h.id)}
        style={shared.evHostWho}
      >
        <ProfileAvatar uri={profileAvatarSmallUri(h.avatarUrl)} border={h.border ?? null} size={size} />
        <View style={{ flex: 1 }}>
          <Text style={shared.evCardTitle} numberOfLines={1}>{title}</Text>
          <Text style={shared.evCardMeta} numberOfLines={1}>{sub}</Text>
        </View>
      </TouchableOpacity>
      {!h.isMe && (
        <TouchableOpacity onPress={() => onMessage(h.id)} style={shared.evMessage} accessibilityRole="button" accessibilityLabel={`Message ${h.name}`}>
          <Text style={shared.evMessageText}>Message</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

/** The host (and co-hosts) with the description written as their note: "From Ana (host)". */
export function EventHostNote({ hosts, description, onOpenProfile, onMessage }: EventHostNoteProps) {
  const [host, ...cohosts] = hosts
  if (!host) return null
  const first = host.name.split(' ')[0]
  return (
    <View style={shared.evCard} testID="event-host-note">
      <HostLine
        h={host}
        title={description ? `From ${first} (host)` : host.name}
        sub={description ? host.name : 'Host'}
        size={40}
        onOpenProfile={onOpenProfile}
        onMessage={onMessage}
      />
      {description ? <LinkedText text={description} style={shared.evNote} /> : null}
      {cohosts.map(h => (
        <HostLine key={h.id} h={h} title={h.name} sub="Co-host" size={32} onOpenProfile={onOpenProfile} onMessage={onMessage} />
      ))}
    </View>
  )
}

/** Points, price, surface, type and level, as chips: the facts a player scans for. */
export function EventFactChips({ event }: EventFactChipsProps) {
  const tags = [...(event.event_tags ?? [])].sort((a, b) => a.tags.display_order - b.tags.display_order)
  const points = pointsForEvent(tags.map(t => t.tags.name))
  const free = !(event.price != null && event.price > 0)
  const surface = isSurface(event.surface) ? SURFACE_LABELS[event.surface] : null
  return (
    <View style={shared.evChips} testID="event-facts">
      <View style={shared.evChip}><Text style={shared.evChipText}>+{points} points</Text></View>
      <View style={[shared.evChip, free && shared.evChipFree]}>
        <Text testID="event-price-stat" style={[shared.evChipText, free && shared.evChipFreeText]}>{free ? 'Free' : formatPrice(event.price)}</Text>
      </View>
      {surface && <View style={shared.evChip}><Text style={shared.evChipText}>{surface}</Text></View>}
      {tags.map(t => (
        <View key={t.tag_id} style={shared.evChip}><Text style={shared.evChipText}>{t.tags.name}</Text></View>
      ))}
    </View>
  )
}
