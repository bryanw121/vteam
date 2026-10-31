/**
 * Where ads go in the Events feed (utils/feedAds.ts). Positions count feed
 * items (club events, tournaments and outside sessions alike), after the
 * active filter, in the order the feed shows them.
 */
export const FEED_ADS = {
  /** The promoted sponsored event goes after this many items (so it is the 3rd card). */
  sponsoredAfter: 2,
  /** The first house banner goes after this many items... */
  bannerFirstAfter: 5,
  /** ...then one more every this many items, rotating through active banners. */
  bannerEvery: 10,
} as const

/** Label on every ad surface, so a promoted card is never mistaken for a regular one. */
export const SPONSORED_LABEL = 'Sponsored'
