import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import type { AdBanner, FeedAds } from '../types'

const AD_BANNER_SELECT = 'id, title, body, image_url, link_url, display_order'

/**
 * Active house banners and sponsored event ids for the Events feed. RLS only
 * returns rows inside their active window. Fetched only while ads are on
 * (`enabled`); a failure just means no ads, never a broken feed.
 */
export function useFeedAds(enabled: boolean): FeedAds | null {
  const { data } = useQuery<FeedAds>(
    enabled ? queryKey('ads', 'feed') : null,
    async () => {
      const [banners, sponsored] = await Promise.all([
        supabase.from('ad_banners').select(AD_BANNER_SELECT).order('display_order').order('created_at'),
        supabase.from('sponsored_events').select('event_id'),
      ])
      if (banners.error) throw banners.error
      if (sponsored.error) throw sponsored.error
      return {
        banners: (banners.data ?? []) as AdBanner[],
        sponsoredEventIds: (sponsored.data ?? []).map(r => r.event_id),
      }
    },
    { staleMs: STALE.feed, enabled },
  )
  return enabled ? data ?? null : null
}
