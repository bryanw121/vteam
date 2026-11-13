import type { SupabaseRestConfig } from './eventPreview'
import type { StartupConfig } from '../../types'

const FETCH_TIMEOUT_MS = 3000
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export const STARTUP_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'
export const STARTUP_ERROR_CACHE_CONTROL = 'public, max-age=0, s-maxage=10'

/**
 * The three small public reads every open makes (#216), as anon (same RLS as the
 * app): the update check rows, house banners and sponsored events, with their
 * windows, so a stale CDN copy can be filtered by time on the client.
 */
export async function fetchStartupConfig(cfg: SupabaseRestConfig, fetchImpl: FetchLike = fetch): Promise<StartupConfig> {
  const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, Accept: 'application/json' }
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
  const get = async <T>(path: string): Promise<T[]> => {
    const res = await fetchImpl(`${cfg.url}/rest/v1/${path}`, { headers, signal })
    if (!res.ok) throw new Error(`PostgREST ${res.status} for ${path.split('?')[0]}`)
    return (await res.json()) as T[]
  }
  const [appConfig, banners, sponsored] = await Promise.all([
    get<StartupConfig['appConfig'][number]>('app_config?select=platform,min_version,store_url,message'),
    get<StartupConfig['banners'][number]>('ad_banners?select=id,title,body,image_url,link_url,display_order,starts_at,ends_at,is_active&order=display_order,created_at'),
    get<StartupConfig['sponsored'][number]>('sponsored_events?select=event_id,starts_at,ends_at'),
  ])
  return { appConfig, banners, sponsored }
}
