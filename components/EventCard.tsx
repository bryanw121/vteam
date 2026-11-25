import React, { memo, useMemo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './ui/Text'
import { TimePill } from './ui'
import { HostedBadge } from './eventCard/HostedBadge'
import { FriendsGoingLine } from './FriendsGoingLine'
import { ForecastChip } from './event/ForecastChip'
import { AttendeeStack } from './eventCard/AttendeeStack'
import { RsvpButton } from './eventCard/RsvpButton'
import { shared, theme } from '../constants'
import { eventPrefetchProps } from '../hooks/event/prefetch'
import { useEventCardActions } from '../hooks/useEventCardActions'
import { eventCardModel, isTournamentTag } from '../utils/eventCardModel'
import type { EventCardProps, RowEventCardProps } from '../types'

/**
 * The two event cards (#360). What they say comes from `eventCardModel`
 * (utils/eventCardModel.ts, pure and tested), what a tap does from
 * `useEventCardActions`; the avatars and the RSVP button are shared pieces in
 * components/eventCard. Styles are `shared.ec*`.
 */

/** Room kept top-right for the feed's ⋯ button (32pt plus a gap). */
const MENU_INSET = 36

/** "WED" → "Wed" for the body line. */
function dayName(day: string) {
  return day.charAt(0) + day.slice(1).toLowerCase()
}

function barWidth(fillRatio: number) {
  return { width: `${Math.round(fillRatio * 100)}%` as `${number}%` }
}

// ─── EventCard: phone feed, search, history, hosted, club page, recap ─────────

function EventCardInner({ event, from, currentUserId, onRsvp, rsvpPending, friendsGoing, forecast, menuInset = false, hosted = false }: EventCardProps) {
  const m = useMemo(() => eventCardModel(event, currentUserId), [event, currentUserId])
  const { open, rsvp, rsvpLoading } = useEventCardActions(event, { from, onRsvp, rsvpPending })

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      testID="event-card"
      {...(event._isTournament ? null : eventPrefetchProps(event.id))}
      onPress={open}
      style={shared.ecHero}
    >
      {/* Cover (Party invite): a colour block per kind of game, carrying only the
          "Hosted on vteam" mark and the title. Time, place and people are in the body. */}
      <View style={[shared.ecCover, { backgroundColor: m.isTournament ? theme.colors.coverTournament : theme.colors.coverOpen }]}>
        <View pointerEvents="none" style={shared.ecCoverRing} />
        <View pointerEvents="none" style={shared.ecCoverDot} />
        {hosted && (
          <View style={[shared.ecHeroChips, { paddingRight: menuInset ? MENU_INSET : 0, marginBottom: 0 }]}>
            <HostedBadge onCover />
          </View>
        )}
        <Text style={shared.ecHeroTitle} numberOfLines={2}>{event.title}</Text>
      </View>

      <View style={shared.ecBody}>
        <View style={shared.ecHeroMain}>
          <View style={shared.ecHeroInfo}>
            {/* When: the time is its own pill, so nobody misreads it. The row is as tall as the
                weather chip, so a forecast arriving later never moves the card. */}
            <View style={shared.ecHeroWhen}>
              <TimePill label={m.time} testID="event-card-time" />
              <Text style={shared.ecHeroDayName}>{dayName(m.day)}</Text>
              {forecast && <ForecastChip summary={forecast} />}
            </View>
            {(event.location || m.surfaceLabel) && (
              <Text style={shared.ecHeroWhere} numberOfLines={1}>
                {[event.location, m.surfaceLabel].filter(Boolean).join(', ')}
              </Text>
            )}
            <View style={shared.ecHeroWho}>
              <AttendeeStack previews={m.previews} overflow={m.overflow} variant="hero" />
              <Text style={shared.ecHeroSpots} numberOfLines={1}>
                {m.attendeeCount}{event.max_attendees ? `/${event.max_attendees}` : ''} · {m.isFull ? 'Full' : `${m.spotsLeft ?? '∞'} spot${m.spotsLeft !== 1 ? 's' : ''} left`}
              </Text>
            </View>
          </View>
          {onRsvp && currentUserId && (
            <RsvpButton variant="hero" isAttending={m.isAttending} awaiting={m.awaiting} loading={rsvpLoading} onToggle={() => void rsvp(m.isAttending)} />
          )}
        </View>

        <FriendsGoingLine going={friendsGoing} />
        {!!event.clubs?.name && <Text style={shared.ecHeroClub} numberOfLines={1}>{event.clubs.name}</Text>}

        {event.max_attendees != null && (
          <View style={shared.ecHeroBar}>
            <View style={[shared.ecBarFill, barWidth(m.fillRatio), { backgroundColor: m.accent }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export const EventCard = memo(EventCardInner) as typeof EventCardInner

// ─── RowEventCard: desktop feed ───────────────────────────────────────────────

function RowEventCardInner({ event, from, currentUserId, onRsvp, rsvpPending, friendsGoing, forecast, menuInset = false, hideDate = false, hosted = false }: RowEventCardProps) {
  const m = useMemo(() => eventCardModel(event, currentUserId), [event, currentUserId])
  const { open, rsvp, rsvpLoading } = useEventCardActions(event, { from, onRsvp, rsvpPending })
  const tint = m.isTournament ? theme.colors.warm + '22' : theme.colors.primary + '18'

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      testID="event-card"
      {...(event._isTournament ? null : eventPrefetchProps(event.id))}
      onPress={open}
      style={[shared.ecRow, hosted && shared.ecHosted]}
    >
      <View pointerEvents="none" style={shared.ecRowWatermark}>
        <Text style={shared.ecRowWatermarkText}>{m.isTournament ? '🏆' : '🏐'}</Text>
      </View>

      {!hideDate && (
        <View style={[shared.ecRowDate, { backgroundColor: tint }]}>
          <Text style={[shared.ecRowDateDay, { color: m.accent }]}>{m.day}</Text>
          <Text style={[shared.ecRowDateNum, { color: m.accent }]}>{m.date}</Text>
        </View>
      )}

      <View style={shared.ecRowBody}>
        <View style={[shared.ecRowTime, { paddingRight: menuInset ? MENU_INSET : 0 }]}>
          {hosted && <HostedBadge />}
          <TimePill label={m.time} testID="event-card-time" />
          {forecast && <ForecastChip summary={forecast} />}
        </View>
        <View style={shared.ecRowChips}>
          {m.typeTags.slice(0, 1).map(tag => (
            <View key={tag.id} style={[shared.ecRowTypeChip, { backgroundColor: tint }]}>
              <Text style={[shared.ecRowTypeText, { color: m.accent }]}>{m.isTournament ? '🏆 ' : ''}{tag.name}</Text>
            </View>
          ))}
          {m.skillTags.slice(0, 1).map(tag => (
            <View key={tag.id} style={shared.ecRowSkillChip}>
              <Text style={shared.ecRowSkillText}>{tag.name}</Text>
            </View>
          ))}
        </View>

        <Text numberOfLines={1} style={shared.ecRowTitle}>{event.title}</Text>

        {event.location && (
          <View style={shared.ecRowLocation}>
            <Ionicons name="location-outline" size={11} color={theme.colors.subtext} />
            <Text numberOfLines={1} style={shared.ecRowLocationText}>
              {event.location}{m.surfaceLabel ? ` · ${m.surfaceLabel}` : ''}
            </Text>
          </View>
        )}

        <FriendsGoingLine going={friendsGoing} />

        {/* Who's going, capacity, RSVP */}
        <View style={shared.ecRowPeople}>
          <AttendeeStack previews={m.previews} overflow={m.overflow} variant="row" />
          <View style={shared.ecRowCapacity}>
            <View style={shared.ecRowBar}>
              <View style={[shared.ecBarFill, barWidth(m.fillRatio), { backgroundColor: m.accent }]} />
            </View>
            <View style={shared.ecRowCounts}>
              <Text style={shared.ecRowCountText}>{m.attendeeCount} going</Text>
              <Text style={shared.ecRowCountText}>{m.spotsLeft != null ? `${m.spotsLeft} left` : '∞'}</Text>
            </View>
          </View>
          {onRsvp && currentUserId && (
            <RsvpButton variant="row" isAttending={m.isAttending} awaiting={m.awaiting} loading={rsvpLoading} onToggle={() => void rsvp(m.isAttending)} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export const RowEventCard = memo(RowEventCardInner) as typeof RowEventCardInner
