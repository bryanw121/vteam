import { FEED_ADS } from '../constants/ads'
import type { EventWithDetails, FeedAdPlacement, FeedAds } from '../types'

/**
 * The one predicate every ad surface reads (through `useAdsEnabled`). Ads are
 * on by default; they are off while the viewer has an ad-free period running
 * (`adFreeUntil` in the future).
 */
export function adsEnabled(opts: { adFreeUntil?: string | null; now?: number } = {}): boolean {
  if (!opts.adFreeUntil) return true
  const until = Date.parse(opts.adFreeUntil)
  if (Number.isNaN(until)) return true
  return until <= (opts.now ?? Date.now())
}

/**
 * Decide which ads follow which feed items. Pure: the same feed and ads always
 * give the same placements, so nothing jumps around between renders.
 *
 * - Sponsored: the soonest sponsored event that isn't already near the top goes
 *   after item `FEED_ADS.sponsoredAfter`, once. (Sponsored events also keep
 *   their normal place in the feed, where the caller labels them.)
 * - Banners: after item `bannerFirstAfter`, then every `bannerEvery` items,
 *   rotating through the banners in order.
 *
 * Returns item id → placements to render right after that item. Empty when
 * ads are off or there is nothing to show.
 */
export function planFeedAds(
  items: readonly EventWithDetails[],
  ads: FeedAds | null | undefined,
  enabled: boolean,
): Map<string, FeedAdPlacement[]> {
  const out = new Map<string, FeedAdPlacement[]>()
  if (!enabled || !ads) return out
  const add = (afterIndex: number, placement: FeedAdPlacement) => {
    const id = items[afterIndex].id
    const list = out.get(id)
    if (list) list.push(placement)
    else out.set(id, [placement])
  }

  const slot = FEED_ADS.sponsoredAfter
  if (ads.sponsoredEventIds.length > 0 && items.length > slot) {
    const sponsored = new Set(ads.sponsoredEventIds)
    // Skip one already at or right after the slot: it is visible there anyway.
    const promoted = items.find((item, i) => i > slot && sponsored.has(item.id) && !item._external && !item._isTournament)
    if (promoted) add(slot - 1, { kind: 'sponsored', event: promoted })
  }

  if (ads.banners.length > 0) {
    for (let k = 0, i = FEED_ADS.bannerFirstAfter - 1; i < items.length; k++, i += FEED_ADS.bannerEvery) {
      add(i, { kind: 'banner', banner: ads.banners[k % ads.banners.length] })
    }
  }
  return out
}
