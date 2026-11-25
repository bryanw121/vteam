import React from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { HOSTED_ON_VTEAM, shared, theme } from '../../constants'
import type { EventHeroProps } from '../../types'

/** Room above the chip for the back / share buttons that float over the cover. */
export const EVENT_HERO_TOP = 72

/**
 * The event page cover (Party invite): one colour block per kind of game, edge to
 * edge, with "Hosted on vteam · <type>" and the title. When, where and who are on
 * the Details tab right under it (EventSummary).
 */
export function EventHero({ event, topInset = 0 }: EventHeroProps) {
  const typeTags = (event.event_tags ?? [])
    .filter(et => et.tags.category === 'event_type')
    .sort((a, b) => a.tags.display_order - b.tags.display_order)
  const isTournament = typeTags.some(et => et.tags.name.trim().toLowerCase() === 'tournament')
  const cover = isTournament ? theme.colors.coverTournament : theme.colors.coverOpen
  const label = [HOSTED_ON_VTEAM, ...typeTags.map(et => et.tags.name)].join(' · ')

  return (
    <View testID="event-hero" style={[shared.eventHero, { backgroundColor: cover, paddingTop: topInset + EVENT_HERO_TOP }]}>
      <View pointerEvents="none" style={shared.eventHeroRing} />
      <View pointerEvents="none" style={shared.eventHeroDot} />
      <View style={shared.eventHeroChip}>
        <Text style={[shared.eventHeroChipText, { color: cover }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text testID="event-hero-title" style={shared.eventHeroTitle} numberOfLines={3}>{event.title}</Text>
    </View>
  )
}
