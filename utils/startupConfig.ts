import type { AdBanner, FeedAds, StartupArm, StartupConfig } from '../types'

/** Is a row with this window on at `now`? Missing ends mean open-ended. */
export function inWindow(row: { starts_at: string | null; ends_at: string | null }, now: number): boolean {
  if (row.starts_at && Date.parse(row.starts_at) > now) return false
  if (row.ends_at && Date.parse(row.ends_at) <= now) return false
  return true
}

/**
 * The feed's ads from a startup config (#216). The CDN copy can be up to a day
 * old, so windows and `is_active` are checked here as RLS would have.
 */
export function feedAdsFrom(config: StartupConfig, now: number): FeedAds {
  const banners: AdBanner[] = config.banners
    .filter(b => b.is_active && inWindow(b, now))
    .map(({ id, title, body, image_url, link_url, display_order }) => ({ id, title, body, image_url, link_url, display_order }))
  const sponsoredEventIds = config.sponsored.filter(s => inWindow(s, now)).map(s => s.event_id)
  return { banners, sponsoredEventIds }
}

/** This page load's arm: a stable coin flip, overridable for tests (`'cdn'` / `'direct'`). */
export function pickStartupArm(random: number, override?: string | null): StartupArm {
  if (override === 'cdn' || override === 'direct') return override
  return random < 0.5 ? 'cdn' : 'direct'
}

/** A response from /api/startup shaped like a config (anything else falls back to direct reads). */
export function isStartupConfig(v: unknown): v is StartupConfig {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.appConfig) && Array.isArray(o.banners) && Array.isArray(o.sponsored)
}
