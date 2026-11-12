import React from 'react'
import { Platform, View } from 'react-native'
import { shared, theme } from '../../constants'
import type { EventWithDetails } from '../../types'
import { EventHero } from './EventHero'

type Props = {
  /** The tapped feed card's row: paints the real banner immediately. Absent on a cold deep link. */
  seed?: EventWithDetails
  topInset: number
}

/**
 * Event detail while EVENT_DETAIL_SELECT is in flight: the real banner when the
 * feed card is known, otherwise a banner-shaped block, then the tab strip,
 * stats and rows in the final layout, so nothing jumps when data lands.
 */
export function EventDetailSkeleton({ seed, topInset }: Props) {
  return (
    <View testID="event-detail-skeleton" accessibilityLabel="Loading event">
      <View style={{ paddingTop: Platform.OS !== 'web' ? topInset + 52 : 0 }}>
        {seed ? <EventHero event={seed} /> : <View style={shared.skeletonHero} />}
        <View style={shared.skeletonTabs}>
          {[0, 1, 2, 3].map(i => <View key={i} style={shared.skeletonTab} />)}
        </View>
      </View>
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {[0, 1, 2].map(i => <View key={i} style={[shared.skeletonBlock, { flex: 1, height: 64 }]} />)}
        </View>
        <View style={[shared.skeletonBlock, { height: 78 }]} />
        <View style={[shared.skeletonBlock, { height: 180 }]} />
      </View>
    </View>
  )
}
