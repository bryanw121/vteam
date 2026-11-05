import { useSession } from '../contexts/session'
import { adsEnabled } from '../utils/feedAds'
import { useAdFreeStatus } from './useAdFree'

/**
 * Whether this viewer sees ads. Every ad surface (feed banners, sponsored
 * slots and labels) reads this and nothing else.
 *
 * Guests always see ads. Signed-in users see none while an ad-free period they
 * bought with points is running (`useAdFreeStatus`). Until their status has
 * loaded we show none, so someone who paid never sees a flash of ads; if it
 * can't load at all, ads show.
 */
export function useAdsEnabled(): boolean {
  const { userId } = useSession()
  const status = useAdFreeStatus()
  if (!userId) return true
  if (!status.data) return status.error !== null
  return adsEnabled({ adFreeUntil: status.data.ad_free_until })
}
