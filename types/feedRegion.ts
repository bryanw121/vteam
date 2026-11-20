import type { FEED_REGIONS } from '../constants/feedRegions'

/** A city whose outside games vteam shows (a Schelagg / Skelly region id). */
export type FeedRegionId = (typeof FEED_REGIONS)[number]['id']

/** Why the feed shows the region it shows. */
export type FeedRegionSource = 'picked' | 'home' | 'network' | 'default'

/** `useFeedCity()`: the region on screen, why, and how to change it. */
export type FeedCity = {
  region: FeedRegionId
  name: string
  source: FeedRegionSource
  /** The covered city nearest the viewer's network, when known (shown as "Nearest to you"). */
  nearest: FeedRegionId | null
  pick: (region: FeedRegionId, how: 'list' | 'device') => void
}

export type FeedCityLineProps = { style?: import('react-native').StyleProp<import('react-native').ViewStyle> }
export type FeedCitySheetProps = { visible: boolean; onDismiss: () => void; city: FeedCity }
