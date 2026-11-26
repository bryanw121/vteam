import React, { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { hitV } from '../../utils/hitArea'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { TimePill } from '../ui'
import { ProfileAvatar } from '../ProfileAvatar'
import { LinkedText } from '../LinkedText'
import { FriendsGoingLine } from '../FriendsGoingLine'
import { AttendeeStack } from '../eventCard/AttendeeStack'
import { openInMaps } from '../../lib/openInMaps'
import { eventDateMs, attendeeRowsWithProfiles } from '../../hooks/event/derive'
import { profilePrefetchProps } from '../../hooks/useUserProfile'
import { shared, theme, LOCATIONS } from '../../constants'
import { SURFACE_ACCENTS, SURFACE_LABELS } from '../../constants/events'
import { formatDuration, formatPrice, isSurface, profileAvatarSmallUri } from '../../utils'
import { formatDate, formatTime } from '../../utils/dateFormat'
import { pointsForEvent } from '../../utils/recap'
import type { IoniconName, EventFactChipsProps, EventHostNoteProps, EventWhenWhereProps, EventWhoIsInProps } from '../../types'

/**
 * The top of the event page's Details tab (Party invite): When and Where side by
 * side, who's in, the host's note, and the facts as chips. Each answers one
 * question a player asks before tapping Join.
 */

const AVATARS = 5
const NOTE_CLAMP_CHARS = 140

/** A small tinted square with an icon: each block's colour, so the eye finds it without reading. */
function IconTile({ icon, color, label }: { icon: IoniconName; color: string; label: string }) {
  return (
    <View style={[shared.evIconTile, { backgroundColor: color + '1F' }]} accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
  )
}

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
        <IconTile icon="calendar" color={theme.colors.primaryText} label="When" />
        <Text style={shared.evTileMain}>{day}</Text>
        <TimePill label={time} testID="event-hero-time" />
        <Text style={shared.evTileSub} numberOfLines={1}>until {endTime} · {formatDuration(minutes)}</Text>
        <TouchableOpacity onPress={onAddToCalendar} accessibilityRole="button" accessibilityLabel="Add to calendar" hitSlop={8} style={shared.evTileLink}>
          <Ionicons name="add-circle" size={16} color={theme.colors.primaryText} />
          <Text style={shared.evTileLinkText}>Calendar</Text>
        </TouchableOpacity>
      </View>
      <View style={shared.evTile} testID="event-where">
        <IconTile icon="location" color={theme.colors.cool} label="Where" />
        <Text testID="event-location-name" style={shared.evTileMain} numberOfLines={2}>{place || 'To be announced'}</Text>
        {!!venue?.address && <Text selectable style={shared.evTileSub} numberOfLines={2}>{venue.address}</Text>}
        {!!place && (
          <TouchableOpacity onPress={() => openInMaps(mapsQuery)} accessibilityRole="link" accessibilityLabel="Directions" hitSlop={8} style={shared.evTileLink}>
            <Ionicons name="navigate" size={15} color={theme.colors.cool} />
            <Text style={[shared.evTileLinkText, { color: theme.colors.cool }]}>Directions</Text>
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
  const ratio = cap ? Math.min(1, count / cap) : 0
  // Green with room, amber when nearly full, red when full: how urgent it is, at a glance.
  const tone = status.isFull ? theme.colors.error : ratio >= 0.85 ? theme.colors.warning : theme.colors.success
  const spots = status.isFull ? 'Full' : cap ? `${status.spotsLeft} left` : null

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onOpenPeople} accessibilityRole="button" accessibilityLabel={`Who's in: ${count}${cap ? ` of ${cap}` : ''}. Open People`} style={shared.evCard} testID="event-who">
      <View style={shared.evCardHead}>
        <IconTile icon="people" color={theme.colors.success} label="Who's in" />
        <Text style={shared.evCount}>{count}{cap ? <Text style={shared.evCountOf}>/{cap}</Text> : null}<Text style={shared.evCountOf}> going</Text></Text>
        {spots && (
          <View style={[shared.evSpotsPill, { backgroundColor: tone + '1F' }]}>
            <Text style={[shared.evSpotsText, { color: tone }]}>{spots}</Text>
          </View>
        )}
      </View>
      {!!cap && (
        <View style={shared.evBar}>
          <View style={[shared.evBarFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: tone }]} />
        </View>
      )}
      <View style={shared.evWhoRow}>
        {previews.length > 0
          ? <AttendeeStack previews={previews} overflow={Math.max(0, count - previews.length)} variant="hero" />
          : <Text style={shared.evCardMeta}>Be the first in.</Text>}
        {(status.isAttending || status.isWaitlisted) && (
          <View style={[shared.evStatusPill, status.isWaitlisted && shared.evStatusPillWait]}>
            <Text style={[shared.evStatusText, status.isWaitlisted && shared.evStatusTextWait]}>
              {status.isAttending ? "You're going" : `#${status.waitlistPosition} on waitlist`}
            </Text>
          </View>
        )}
      </View>
      <FriendsGoingLine going={friendsGoing} testID="event-friends-going" />
      {footer}
    </TouchableOpacity>
  )
}

/** 44-pt tap target around the 36-pt Message pill (#386). */
const MESSAGE_HIT = hitV(36)

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
        <TouchableOpacity onPress={() => onMessage(h.id)} style={MESSAGE_HIT} accessibilityRole="button" accessibilityLabel={`Message ${h.name}`}>
          <View style={shared.evMessage}><Text style={shared.evMessageText}>Message</Text></View>
        </TouchableOpacity>
      )}
    </View>
  )
}

/** The host (and co-hosts), with the description as their note under the name. */
export function EventHostNote({ hosts, description, onOpenProfile, onMessage }: EventHostNoteProps) {
  const [host, ...cohosts] = hosts
  // A long note shows three lines and "More", so it doesn't push everything else down.
  const long = !!description && (description.length > NOTE_CLAMP_CHARS || description.includes('\n'))
  const [open, setOpen] = useState(false)
  if (!host) return null
  return (
    <View style={shared.evCard} testID="event-host-note">
      <HostLine
        h={host}
        title={host.name}
        sub="Host"
        size={40}
        onOpenProfile={onOpenProfile}
        onMessage={onMessage}
      />
      {description ? <LinkedText text={description} style={shared.evNote} numberOfLines={long && !open ? 3 : 0} /> : null}
      {long && (
        <TouchableOpacity onPress={() => setOpen(o => !o)} accessibilityRole="button" hitSlop={8} style={shared.evMore}>
          <Text style={shared.evTileLinkText}>{open ? 'Less' : 'More'}</Text>
        </TouchableOpacity>
      )}
      {cohosts.map(h => (
        <HostLine key={h.id} h={h} title={h.name} sub="Co-host" size={32} onOpenProfile={onOpenProfile} onMessage={onMessage} />
      ))}
    </View>
  )
}

/** Points, price, surface and type as chips, each its own colour: the facts a player scans for. */
export function EventFactChips({ event }: EventFactChipsProps) {
  const tags = [...(event.event_tags ?? [])].sort((a, b) => a.tags.display_order - b.tags.display_order)
  const points = pointsForEvent(tags.map(t => t.tags.name))
  const free = !(event.price != null && event.price > 0)
  const surface = isSurface(event.surface) ? event.surface : null
  const chips: { key: string; icon: IoniconName; label: string; color: string; testID?: string }[] = [
    { key: 'points', icon: 'star', label: `+${points} points`, color: theme.colors.warning },
    { key: 'price', icon: 'cash', label: free ? 'Free' : formatPrice(event.price), color: theme.colors.success, testID: 'event-price-stat' },
    ...(surface ? [{ key: 'surface', icon: (surface === 'indoor' ? 'business' : surface === 'sand' ? 'sunny' : 'leaf') as IoniconName, label: SURFACE_LABELS[surface], color: SURFACE_ACCENTS[surface] }] : []),
    ...tags.map(t => ({ key: t.tag_id, icon: 'pricetag' as IoniconName, label: t.tags.name, color: theme.colors.primaryText })),
  ]
  return (
    <View style={shared.evChips} testID="event-facts">
      {chips.map(c => (
        <View key={c.key} style={[shared.evChip, { backgroundColor: c.color + '1A' }]}>
          <Ionicons name={c.icon} size={14} color={c.color} />
          <Text testID={c.testID} style={[shared.evChipText, { color: c.color }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  )
}
