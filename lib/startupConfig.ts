import { supabase } from './supabase'
import { track } from './analytics'
import { queryKey, useQuery } from './query'
import { shareUrl } from '../constants/share'
import { STALE } from '../constants/cache'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { isStartupConfig, pickStartupArm } from '../utils/startupConfig'
import type { StartupArm, StartupConfig } from '../types'

/**
 * The startup config (#216): update-check rows and the feed's ads, read once per
 * open (each by the screen that needs it). Half of page loads read them from the CDN-cached `/api/startup` (a cold
 * database then only has to answer the feed), half straight from Supabase, and
 * `startup_timing` records how long each took so we can keep or revert it.
 * Any CDN failure falls back to the direct reads, so it never costs an open.
 */
const CDN_TIMEOUT_MS = 1500

let arm: StartupArm | null = null
function startupArm(): StartupArm {
  if (arm) return arm
  let override: string | null = null
  try { override = typeof localStorage !== 'undefined' ? localStorage.getItem('vteam.startupArm') : null } catch { /* storage blocked */ }
  arm = pickStartupArm(Math.random(), override)
  return arm
}

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

/** One CDN request per page load serves both parts (it is one cached response anyway). */
let cdnRequest: Promise<StartupConfig | null> | null = null
function readCdnOnce(): Promise<StartupConfig | null> {
  if (!cdnRequest) cdnRequest = readCdn().then(r => { if (!r) cdnRequest = null; return r })
  return cdnRequest
}

async function readCdn(): Promise<StartupConfig | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), CDN_TIMEOUT_MS) : null
  try {
    const res = await fetch(shareUrl('/api/startup'), { signal: controller?.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const body: unknown = await res.json()
    return isStartupConfig(body) ? body : null
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function fetchStartupConfig(part: StartupPart): Promise<StartupConfig> {
  const which = startupArm()
  const started = Date.now()
  let source: 'cdn' | 'direct' | 'fallback' = 'direct'
  let config: StartupConfig | null = null
  if (which === 'cdn') {
    config = await readCdnOnce()
    source = config ? 'cdn' : 'fallback'
  }
  if (!config) config = await readDirect(part)
  track(ANALYTICS_EVENTS.startupTiming, { arm: which, source, part, ms: Date.now() - started })
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

/** Tests only. */
export function __resetStartupArm(): void { arm = null; cdnRequest = null }
