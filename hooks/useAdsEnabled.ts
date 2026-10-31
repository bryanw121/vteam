import { adsEnabled } from '../utils/feedAds'

/**
 * Whether this viewer sees ads. Every ad surface (feed banners, sponsored
 * slots and labels) reads this and nothing else, so turning ads off for
 * someone is a change here only. On for everyone for now.
 */
export function useAdsEnabled(): boolean {
  return adsEnabled()
}
