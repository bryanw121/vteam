import { useMemo } from 'react'
import { useStartupConfig } from '../lib/startupConfig'
import { feedAdsFrom } from '../utils/startupConfig'
import type { FeedAds } from '../types'

/**
 * Active house banners and sponsored event ids for the Events feed, from the
 * startup config (#216, `lib/startupConfig`). Windows are checked on the client
 * too, since the CDN copy may be a little old. Read only while ads are on
 * (`enabled`); a failure just means no ads, never a broken feed.
 */
export function useFeedAds(enabled: boolean): FeedAds | null {
  const config = useStartupConfig(enabled)
  return useMemo(() => (enabled && config ? feedAdsFrom(config, Date.now()) : null), [enabled, config])
}
