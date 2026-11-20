import type { FeedPrefetchTiming } from '../types'

/** Native has no HTML head to start the feed request from (#184): nothing to take. */
export function takeFeedPrefetch(_start: string, _end: string, _viewerId?: string | null): Promise<unknown> | null {
  return null
}

/** Server and start-up time of the page's own feed request, for feed_first_paint (web only). */
export function feedPrefetchTiming(): FeedPrefetchTiming | null {
  return null
}
