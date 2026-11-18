import { supabase } from './supabase'
import { track } from './analytics'
import { queryKey, useQuery } from './query'
import { STALE } from '../constants/cache'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { isStartupConfig } from '../utils/startupConfig'
import type { StartupConfig } from '../types'

/**
 * The startup config: the update-check rows and the feed's ads, read once per
 * open, each by the screen that needs it, straight from Supabase.
 *
 * #216 tried a CDN-cached `/api/startup` against these direct reads for a week
 * (Nov 13–18 2026). At vteam's traffic the CDN copy was never warm: the CDN arm
 * took p50 ~1.6 s (62% hit its 1.5 s timeout) against 365 ms direct, so it was
 * removed (#324). `startup_timing` still records how long the read took.
 */

/** What each reader needs. The update check reads on every screen; the ads only on the feed. */
export type StartupPart = 'version' | 'ads'

async function readDirect(part: StartupPart): Promise<StartupConfig> {
  if (part === 'version') {
    const appConfig = await supabase.from('app_config').select('platform, min_version, store_url, message')
    return { appConfig: appConfig.error ? [] : (appConfig.data ?? []) as StartupConfig['appConfig'], banners: [], sponsored: [] }
  }
  const [banners, sponsored] = await Promise.all([
    supabase.from('ad_banners')
      .select('id, title, body, image_url, link_url, display_order, starts_at, ends_at, is_active')
      .order('display_order').order('created_at'),
    supabase.from('sponsored_events').select('event_id, starts_at, ends_at'),
  ])
  // One failed table never hides the other.
  return {
    appConfig: [],
    banners: banners.error ? [] : (banners.data ?? []) as StartupConfig['banners'],
    sponsored: sponsored.error ? [] : (sponsored.data ?? []) as StartupConfig['sponsored'],
  }
}

export async function fetchStartupConfig(part: StartupPart): Promise<StartupConfig> {
  const started = Date.now()
  const config = await readDirect(part)
  track(ANALYTICS_EVENTS.startupTiming, { arm: 'direct', source: 'direct', part, ms: Date.now() - started })
  return config
}

/**
 * The startup config for one reader. The update check (`version`, every screen)
 * and the feed's ads (`ads`, only while the feed shows ads) are separate reads, so
 * a screen without ads never asks for them (#225's budget caught that).
 */
export function useStartupConfig(part: StartupPart, enabled = true): StartupConfig | null {
  const { data } = useQuery<StartupConfig>(
    // `ads:startup`, not `ads:feed`: that key held another shape before #280 and may still be in a saved snapshot.
    enabled ? queryKey(part === 'ads' ? 'ads' : 'startup', part === 'ads' ? 'startup' : 'version') : null,
    () => fetchStartupConfig(part),
    { staleMs: STALE.feed, enabled },
  )
  // A cached value from another build can have another shape: treat it as not loaded rather than crash.
  return enabled && isStartupConfig(data) ? data : null
}
