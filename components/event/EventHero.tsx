import React from 'react'
import { Platform, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { LinearGradient } from 'expo-linear-gradient'
import { theme, LOCATIONS } from '../../constants'
import { TimePill } from '../ui'
import type { EventWithDetails } from '../../types'
import { formatDuration } from '../../utils'
import { eventDateMs } from '../../hooks/event'

type Props = { event: EventWithDetails }

/** The event page banner: date + type chips, title, location · duration. */
export function EventHero({ event }: Props) {
  const d = new Date(eventDateMs(event.event_date))
  const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const dur = formatDuration(event.duration_minutes ?? 120)
  const typeTags = (event.event_tags ?? []).filter(et => et.tags.category === 'event_type')
  const locationLabel = LOCATIONS.find(l => l.id === event.location)?.label ?? event.location ?? ''

  return (
    <View style={{ marginHorizontal: theme.spacing.md, marginTop: theme.spacing.xs, marginBottom: theme.spacing.sm, borderRadius: 22, overflow: 'hidden' }}>
      <View style={{ backgroundColor: theme.colors.primary, padding: 18, position: 'relative', overflow: 'hidden' }}>
        {/* Diagonal stripe overlay */}
        <View pointerEvents="none" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          opacity: 0.16,
          ...(Platform.OS === 'web' ? {
            backgroundImage: 'repeating-linear-gradient(-28deg, transparent 0, transparent 28px, rgba(255,255,255,0.55) 28px, rgba(255,255,255,0.55) 32px)',
          } : {}),
        } as any} />
        {/* Decorative gradient overlay */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, width: 220, height: 160 }}
          pointerEvents="none"
        />
        {/* Date + type chips */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TimePill label={timeStr} size="lg" testID="event-hero-time" />
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.accent, justifyContent: 'center' }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk }}>
              {dayStr}
            </Text>
          </View>
          {typeTags.map(et => (
            <View key={et.tag_id} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.9)' }}>
                {et.tags.name}
              </Text>
            </View>
          ))}
        </View>
        {/* Title */}
        <Text testID="event-hero-title" style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.xl, letterSpacing: -0.8, color: theme.colors.white, lineHeight: 32 }}>
          {event.title}
        </Text>
        {/* Location + duration */}
        {(locationLabel || dur) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: 'rgba(255,255,255,0.85)' }}>
              {[locationLabel, dur].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}
