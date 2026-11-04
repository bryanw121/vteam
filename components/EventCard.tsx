import React, { memo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import { Image } from 'expo-image'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter, usePathname } from 'expo-router'
import { theme, eventAttendeeDisplayCount, SURFACE_LABELS } from '../constants'
import { TimePill } from './ui'
import { routes } from '../utils/routes'
import { rememberEventCard } from '../hooks/event/seed'
import { eventPrefetchProps } from '../hooks/event/prefetch'
import { profileAvatarSmallUri, profileDisplayName, surfaceOf } from '../utils'
import type { EventCardRsvpHandler, EventWithDetails, Tag } from '../types'
import { Spinner } from './ui/Spinner'

// ─── Attendance helpers ───────────────────────────────────────────────────────

/**
 * Is this viewer-scoped `my_attendance` row an actual RSVP?
 *
 * The embed now reads the base `event_attendees` table, so it also returns
 * waitlisted, requested and denied rows. Presence alone would show "Going ✓" to
 * someone who is only on the waitlist. Rows with no `status` come from the older
 * attending-only view and are attending by construction.
 */
function isAttendingRow(row: { status?: string }): boolean {
  return (row.status ?? 'attending') === 'attending'
}

/**
 * Label for a viewer the card must not RSVP with one tap: waitlisted or with a
 * pending request (an RSVP tap would insert a second row), or not yet on an
 * event whose host approves each join (`requires_approval`; a one-tap insert
 * would skip the request). The card shows it as a status pill, not a button;
 * tapping the pill opens the event, where they can leave / cancel / request.
 */
function awaitingLabel(event: EventWithDetails, currentUserId: string | null | undefined, isAttending: boolean): string | null {
  if (!currentUserId) return null
  const status = event.my_attendance?.find(a => a.user_id === currentUserId)?.status
  if (status === 'waitlisted') return 'Waitlisted'
  if (status === 'requested') return 'Requested'
  if (event.requires_approval && !isAttending) return status === 'denied' ? 'Denied' : 'Needs approval'
  return null
}

// ─── Tag helpers ──────────────────────────────────────────────────────────────

function isTournament(tags: Tag[]): boolean {
  return tags.some(t => t.name.toLowerCase().includes('tournament'))
}

/** Accent color for the decorative date numeral — varies by event type */
function numeralColor(typeTags: Tag[]): string {
  if (isTournament(typeTags)) return theme.colors.warm
  return theme.colors.primary
}

// ─── Time / date helpers ──────────────────────────────────────────────────────

function parseEventDate(dateString: string): { day: string; date: number; time: string } {
  const normalized = /[Z+]/.test(dateString) ? dateString : dateString + 'Z'
  const d = new Date(normalized)
  const dayAbbrevs = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const day = dayAbbrevs[d.getDay()]
  const date = d.getDate()
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const h12 = hours % 12 || 12
  const ampm = hours < 12 ? 'AM' : 'PM'
  const time = `${h12}:${String(minutes).padStart(2, '0')} ${ampm}`
  return { day, date, time }
}

// ─── Event Card ───────────────────────────────────────────────────────────────


function EventCardInner({
  event,
  from: fromOverride,
  currentUserId,
  onRsvp,
  rsvpPending = false,
}: {
  event: EventWithDetails
  from?: string
  currentUserId?: string | null
  onRsvp?: EventCardRsvpHandler
  /** The parent's RSVP write for this event is in flight (survives a remount, unlike the local spinner). */
  rsvpPending?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [rsvpTapped, setRsvpTapped] = useState(false)
  const rsvpLoading = rsvpTapped || rsvpPending
  const surface = surfaceOf(event)
  const surfaceLabel = surface ? SURFACE_LABELS[surface] : null

  const isAttending = !!currentUserId && (
    event.my_attendance != null
      ? event.my_attendance.some(a => a.user_id === currentUserId && isAttendingRow(a))
      : (event.attendee_previews ?? []).some(p => p.user_id === currentUserId)
  )
  const awaiting = awaitingLabel(event, currentUserId, isAttending)

  const attendeeCount = eventAttendeeDisplayCount(event)
  const spotsLeft = event.max_attendees != null ? Math.max(0, event.max_attendees - attendeeCount) : null
  const isFull = spotsLeft === 0
  const fillRatio = event.max_attendees ? Math.min(1, attendeeCount / event.max_attendees) : 0

  const typeTags = event.event_tags?.filter(et => et.tags.category === 'event_type').map(et => et.tags).sort((a, b) => a.display_order - b.display_order) ?? []
  const skillTags = event.event_tags?.filter(et => et.tags.category === 'skill_level').map(et => et.tags).sort((a, b) => a.display_order - b.display_order) ?? []

  const { day, date, time } = parseEventDate(event.event_date)
  const accentColor = numeralColor(typeTags)

  const previews = (event.attendee_previews ?? []).slice(0, 3)
  const overflow = attendeeCount > previews.length ? attendeeCount - previews.length : 0

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      {...(event._isTournament ? null : eventPrefetchProps(event.id))}
      onPress={() => {
        if (!event._isTournament) rememberEventCard(event)
        router.push(
          event._isTournament
            ? routes.tournament(event.id)
            : routes.eventFrom(event.id, fromOverride ?? pathname),
        )
      }}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 24,
        padding: 16,
        marginBottom: theme.spacing.sm,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {typeTags.length > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', right: -10, top: -20 }}>
          <Text style={{ fontSize: theme.font.watermark.xl, opacity: 0.13 }}>
            {isTournament(typeTags) ? '🏆' : '🏐'}
          </Text>
        </View>
      )}
      <View>
        {/* Top chips: time + day + type + skill */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <TimePill label={time} testID="event-card-time" />
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.accent }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk }}>
              {day}
            </Text>
          </View>
          {typeTags.map(tag => (
            <View key={tag.id} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.85)' }}>
                {isTournament([tag]) ? '🏆 ' : ''}{tag.name}
              </Text>
            </View>
          ))}
          {skillTags.slice(0, 1).map(tag => (
            <View key={tag.id} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.6)' }}>
                {tag.name}
              </Text>
            </View>
          ))}
          {event.clubs && (
            <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.6)' }}>
                {event.clubs.name}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text
          style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.md, letterSpacing: -0.6, color: theme.colors.white, lineHeight: 26, maxWidth: '78%' }}
          numberOfLines={2}
        >
          {event.title}
        </Text>

        {/* Location */}
        {event.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
              {event.location}{surfaceLabel ? ` · ${surfaceLabel}` : ''}
            </Text>
          </View>
        )}

        {/* Attendee row + capacity */}
        <View style={{
          marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Avatar stack */}
            {previews.length > 0 && (
              <View style={{ flexDirection: 'row' }}>
                {previews.map((p, i) => {
                  const uri = profileAvatarSmallUri(p.profiles?.avatar_url)
                  const initials = p.profiles ? profileDisplayName(p.profiles).charAt(0).toUpperCase() : '?'
                  return (
                    <View key={p.user_id} style={{
                      width: 24, height: 24, borderRadius: 12,
                      backgroundColor: theme.colors.primarySoft,
                      borderWidth: 1.5, borderColor: theme.colors.card,
                      marginLeft: i > 0 ? -8 : 0,
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {uri
                        ? <Image source={{ uri }} style={{ width: 24, height: 24 }} contentFit="cover" transition={150} />
                        : <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.xs, color: theme.colors.primary }}>{initials}</Text>
                      }
                    </View>
                  )
                })}
                {overflow > 0 && (
                  <View style={{
                    width: 24, height: 24, borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1.5, borderColor: theme.colors.card,
                    marginLeft: -8, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>+{overflow}</Text>
                  </View>
                )}
              </View>
            )}
            <View>
              <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgs, letterSpacing: -0.2, color: theme.colors.white }}>
                {attendeeCount}
                {event.max_attendees
                  ? <Text style={{ opacity: 0.4, fontSize: theme.font.size.smd }}>/{event.max_attendees}</Text>
                  : null}
              </Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {isFull ? 'Full' : `${spotsLeft ?? '∞'} spot${spotsLeft !== 1 ? 's' : ''} left`}
              </Text>
            </View>
          </View>
          {onRsvp && currentUserId && awaiting && (
            <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.sm, letterSpacing: 0.2, color: theme.colors.subtext }}>{awaiting}</Text>
            </View>
          )}
          {onRsvp && currentUserId && !awaiting && (
            <TouchableOpacity
              onPress={async e => {
                e.stopPropagation?.()
                if (rsvpLoading) return
                setRsvpTapped(true)
                try { await onRsvp(event.id, isAttending ? 'leave' : 'join') } finally { setRsvpTapped(false) }
              }}
              disabled={rsvpLoading}
              accessibilityRole="button"
              accessibilityState={{ disabled: rsvpLoading, busy: rsvpLoading }}
              activeOpacity={0.75}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: isAttending ? theme.colors.card : theme.colors.accent,
                borderWidth: 1,
                borderColor: isAttending ? theme.colors.border : theme.colors.accent,
              }}
            >
              {rsvpLoading
                ? <Spinner size="small" color={isAttending ? theme.colors.subtext : theme.colors.accentInk} />
                : (
                    <Text
                      style={{
                        fontFamily: theme.fonts.displaySemiBold,
                        fontSize: theme.font.size.sm,
                        letterSpacing: 0.2,
                        color: isAttending ? theme.colors.subtext : theme.colors.accentInk,
                      }}
                    >
                      {isAttending ? 'Going ✓' : 'RSVP'}
                    </Text>
                  )
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Capacity bar */}
        {event.max_attendees != null && (
          <View style={{ marginTop: 8, height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(fillRatio * 100)}%` as any, height: '100%', backgroundColor: accentColor, borderRadius: 2 }} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export const EventCard = memo(EventCardInner) as typeof EventCardInner
// HeroEventCard is now the same component — kept for backwards compatibility
export const HeroEventCard = EventCard

// ─── Row Event Card (desktop secondary cards) ─────────────────────────────────

function RowEventCardInner({ event, from: fromOverride, currentUserId, onRsvp, rsvpPending = false }: {
  event: EventWithDetails
  from?: string
  currentUserId?: string | null
  onRsvp?: EventCardRsvpHandler
  /** See EventCard. */
  rsvpPending?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [rsvpTapped, setRsvpTapped] = useState(false)
  const rsvpLoading = rsvpTapped || rsvpPending
  const surface = surfaceOf(event)
  const surfaceLabel = surface ? SURFACE_LABELS[surface] : null

  const isAttending = !!currentUserId && (
    event.my_attendance != null
      ? event.my_attendance.some(a => a.user_id === currentUserId && isAttendingRow(a))
      : (event.attendee_previews ?? []).some(p => p.user_id === currentUserId)
  )
  const awaiting = awaitingLabel(event, currentUserId, isAttending)

  const attendeeCount = eventAttendeeDisplayCount(event)
  const spotsLeft = event.max_attendees != null ? Math.max(0, event.max_attendees - attendeeCount) : null
  const fillRatio = event.max_attendees ? Math.min(1, attendeeCount / event.max_attendees) : 0

  const typeTags = event.event_tags?.filter(et => et.tags.category === 'event_type').map(et => et.tags).sort((a, b) => a.display_order - b.display_order) ?? []
  const skillTags = event.event_tags?.filter(et => et.tags.category === 'skill_level').map(et => et.tags).sort((a, b) => a.display_order - b.display_order) ?? []

  const { day, date, time } = parseEventDate(event.event_date)
  const accentColor = numeralColor(typeTags)
  const tourney = isTournament(typeTags)

  const previews = (event.attendee_previews ?? []).slice(0, 3)
  const rowOverflow = attendeeCount > previews.length ? attendeeCount - previews.length : 0

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      {...(event._isTournament ? null : eventPrefetchProps(event.id))}
      onPress={() => {
        if (!event._isTournament) rememberEventCard(event)
        router.push(
          event._isTournament
            ? routes.tournament(event.id)
            : routes.eventFrom(event.id, fromOverride ?? pathname),
        )
      }}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 20,
        padding: 14,
        marginBottom: theme.spacing.sm,
        flexDirection: 'row',
        gap: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Emoji watermark */}
      <View pointerEvents="none" style={{ position: 'absolute', right: -6, top: -14 }}>
        <Text style={{ fontSize: theme.font.watermark.sm, opacity: 0.07 }}>
          {tourney ? '🏆' : '🏐'}
        </Text>
      </View>

      {/* Date block */}
      <View style={{
        width: 56, flexShrink: 0, borderRadius: 14,
        backgroundColor: tourney
          ? theme.colors.warm + '22'
          : theme.colors.primary + '18',
        alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10,
      }}>
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, fontWeight: '700', letterSpacing: 1, color: accentColor }}>{day}</Text>
        <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.xl, lineHeight: 30, color: accentColor, letterSpacing: -1.2 }}>{date}</Text>
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ marginBottom: 6 }}>
          <TimePill label={time} testID="event-card-time" />
        </View>
        {/* Chips */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
          {typeTags.slice(0, 1).map(tag => (
            <View key={tag.id} style={{
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full,
              backgroundColor: tourney ? theme.colors.warm + '22' : theme.colors.primary + '18',
            }}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: accentColor }}>
                {tourney ? '🏆 ' : ''}{tag.name}
              </Text>
            </View>
          ))}
          {skillTags.slice(0, 1).map(tag => (
            <View key={tag.id} style={{
              paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full,
              borderWidth: 1, borderColor: theme.colors.border,
            }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{tag.name}</Text>
            </View>
          ))}
        </View>

        {/* Title */}
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgs, letterSpacing: -0.3, color: theme.colors.text, lineHeight: 18 }}>
          {event.title}
        </Text>

        {/* Location */}
        {event.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Ionicons name="location-outline" size={11} color={theme.colors.subtext} />
            <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
              {event.location}{surfaceLabel ? ` · ${surfaceLabel}` : ''}
            </Text>
          </View>
        )}

        {/* Attendees + capacity bar + RSVP */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          {previews.length > 0 && (
            <View style={{ flexDirection: 'row' }}>
              {previews.map((p, i) => {
                const uri = profileAvatarSmallUri(p.profiles?.avatar_url)
                const initials = p.profiles ? profileDisplayName(p.profiles).charAt(0).toUpperCase() : '?'
                return (
                  <View key={p.user_id} style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: theme.colors.primarySoft,
                    borderWidth: 1.5, borderColor: theme.colors.card,
                    marginLeft: i > 0 ? -7 : 0,
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {uri
                      ? <Image source={{ uri }} style={{ width: 22, height: 22 }} contentFit="cover" transition={150} />
                      : <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.xs, color: theme.colors.primary }}>{initials}</Text>
                    }
                  </View>
                )
              })}
              {rowOverflow > 0 && (
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: theme.colors.border,
                  borderWidth: 1.5, borderColor: theme.colors.card,
                  marginLeft: -7, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.subtext }}>+{rowOverflow}</Text>
                </View>
              )}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ height: 3, backgroundColor: theme.colors.borderSoft, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(fillRatio * 100)}%` as any, height: '100%', backgroundColor: accentColor, borderRadius: 2 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '600', color: theme.colors.subtext }}>{attendeeCount} going</Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, fontWeight: '600', color: theme.colors.subtext }}>{spotsLeft != null ? `${spotsLeft} left` : '∞'}</Text>
            </View>
          </View>
          {onRsvp && currentUserId && awaiting && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, flexShrink: 0, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{awaiting}</Text>
            </View>
          )}
          {onRsvp && currentUserId && !awaiting && (
            <TouchableOpacity
              onPress={async e => {
                e.stopPropagation?.()
                if (rsvpLoading) return
                setRsvpTapped(true)
                try { await onRsvp(event.id, isAttending ? 'leave' : 'join') } finally { setRsvpTapped(false) }
              }}
              disabled={rsvpLoading}
              accessibilityRole="button"
              accessibilityState={{ disabled: rsvpLoading, busy: rsvpLoading }}
              activeOpacity={0.75}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, flexShrink: 0,
                backgroundColor: isAttending ? theme.colors.card : theme.colors.primary,
                borderWidth: 1,
                borderColor: isAttending ? theme.colors.border : theme.colors.primary,
              }}
            >
              {rsvpLoading
                ? <Spinner size="small" color={isAttending ? theme.colors.subtext : theme.colors.white} />
                : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.xs, color: isAttending ? theme.colors.subtext : theme.colors.white }}>
                    {isAttending ? 'Going ✓' : 'RSVP'}
                  </Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export const RowEventCard = memo(RowEventCardInner) as typeof RowEventCardInner
