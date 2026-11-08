/** Native has no HTML head to start the feed request from (#184): nothing to take. */
export function takeFeedPrefetch(_start: string, _end: string, _viewerId?: string | null): Promise<unknown> | null {
  return null
}

/** How the first feed data arrived, for the feed_first_paint metric (web only). */
export function feedPrefetchAge(): number | null {
  return null
}
