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
 * open. Half of page loads read them from the CDN-cached `/api/startup` (a cold
 * database then only has to answer the feed), half straight from Supabase, and
 * `startup_timing` records how long each took so we can keep or revert it.
 * Any CDN failure falls back to the direct reads, so it never costs an open.
 */
export const STARTUP_KEY = queryKey('ads', 'startup')
const CDN_TIMEOUT_MS = 1500

let arm: StartupArm | null = null
function startupArm(): StartupArm {
  if (arm) return arm
  let override: string | null = null
  try { override = typeof localStorage !== 'undefined' ? localStorage.getItem('vteam.startupArm') : null } catch { /* storage blocked */ }
  arm = pickStartupArm(Math.random(), override)
  return arm
}

async function readDirect(): Promise<StartupConfig> {
  const [appConfig, banners, sponsored] = await Promise.all([
    supabase.from('app_config').select('platform, min_version, store_url, message'),
    supabase.from('ad_banners')
      .select('id, title, body, image_url, link_url, display_order, starts_at, ends_at, is_active')
      .order('display_order').order('created_at'),
    supabase.from('sponsored_events').select('event_id, starts_at, ends_at'),
  ])
  // A missing update check must never block the ads, and the other way round.
  return {
    appConfig: appConfig.error ? [] : (appConfig.data ?? []) as StartupConfig['appConfig'],
    banners: banners.error ? [] : (banners.data ?? []) as StartupConfig['banners'],
    sponsored: sponsored.error ? [] : (sponsored.data ?? []) as StartupConfig['sponsored'],
  }
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

export async function fetchStartupConfig(): Promise<StartupConfig> {
  const which = startupArm()
  const started = Date.now()
  let source: 'cdn' | 'direct' | 'fallback' = 'direct'
  let config: StartupConfig | null = null
  if (which === 'cdn') {
    config = await readCdn()
    source = config ? 'cdn' : 'fallback'
  }
  if (!config) config = await readDirect()
  track(ANALYTICS_EVENTS.startupTiming, { arm: which, source, ms: Date.now() - started })
  return config
}

/** One read for everything that needs the startup config (deduped by key). */
export function useStartupConfig(enabled = true): StartupConfig | null {
  const { data } = useQuery<StartupConfig>(enabled ? STARTUP_KEY : null, fetchStartupConfig, { staleMs: STALE.feed, enabled })
  return enabled ? data ?? null : null
}

/** Tests only. */
export function __resetStartupArm(): void { arm = null }
