import type { AdBanner, FeedAds, StartupConfig } from '../types'

/** Is a row with this window on at `now`? Missing ends mean open-ended. */
export function inWindow(row: { starts_at: string | null; ends_at: string | null }, now: number): boolean {
  if (row.starts_at && Date.parse(row.starts_at) > now) return false
  if (row.ends_at && Date.parse(row.ends_at) <= now) return false
  return true
}

/**
 * The feed's ads from a startup config. A copy restored from the device can be
 * days old, so windows and `is_active` are checked here as RLS would have.
 */
export function feedAdsFrom(config: StartupConfig, now: number): FeedAds {
  const banners: AdBanner[] = config.banners
    .filter(b => b.is_active && inWindow(b, now))
    .map(({ id, title, body, image_url, link_url, display_order }) => ({ id, title, body, image_url, link_url, display_order }))
  const sponsoredEventIds = config.sponsored.filter(s => inWindow(s, now)).map(s => s.event_id)
  return { banners, sponsoredEventIds }
}

/** A value shaped like a config (a cached copy from another build may not be). */
export function isStartupConfig(v: unknown): v is StartupConfig {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.appConfig) && Array.isArray(o.banners) && Array.isArray(o.sponsored)
}
