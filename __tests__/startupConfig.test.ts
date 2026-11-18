/**
 * The startup config: its pure helpers and the client loader, which reads
 * Supabase directly (the #216 CDN arm was removed in #324).
 */
import { feedAdsFrom, inWindow, isStartupConfig } from '../utils/startupConfig'
import type { StartupConfig } from '../types'

/** Expo 58's test setup installs its own fetch; define ours so assignments stick. */
let wantedFetch: unknown = null
function setFetch(f: unknown): void {
  wantedFetch = f
  Object.defineProperty(globalThis, 'fetch', { value: f, configurable: true, writable: true })
}

const NOW = Date.parse('2026-11-13T18:00:00Z')
const banner = (id: string, f: Partial<StartupConfig['banners'][number]> = {}): StartupConfig['banners'][number] => ({
  id, title: id, body: null, image_url: null, link_url: 'https://x.test', display_order: 0, starts_at: null, ends_at: null, is_active: true, ...f,
})

describe('utils/startupConfig', () => {
  it('checks windows like RLS', () => {
    expect(inWindow({ starts_at: null, ends_at: null }, NOW)).toBe(true)
    expect(inWindow({ starts_at: '2026-11-14T00:00:00Z', ends_at: null }, NOW)).toBe(false)
    expect(inWindow({ starts_at: null, ends_at: '2026-11-13T18:00:00Z' }, NOW)).toBe(false)
    expect(inWindow({ starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-20T00:00:00Z' }, NOW)).toBe(true)
  })

  it('drops inactive and out-of-window ads from a stale copy', () => {
    const config: StartupConfig = {
      appConfig: [],
      banners: [banner('on'), banner('off', { is_active: false }), banner('ended', { ends_at: '2026-11-12T00:00:00Z' })],
      sponsored: [
        { event_id: 'e1', starts_at: null, ends_at: null },
        { event_id: 'e2', starts_at: '2026-11-20T00:00:00Z', ends_at: null },
      ],
    }
    const ads = feedAdsFrom(config, NOW)
    expect(ads.banners).toEqual([{ id: 'on', title: 'on', body: null, image_url: null, link_url: 'https://x.test', display_order: 0 }])
    expect(ads.sponsoredEventIds).toEqual(['e1'])
  })

  it('recognises a config', () => {
    expect(isStartupConfig({ appConfig: [], banners: [], sponsored: [] })).toBe(true)
    expect(isStartupConfig({ appConfig: [] })).toBe(false)
    expect(isStartupConfig(null)).toBe(false)
  })
})

describe('lib/startupConfig loader', () => {
  const tables: Record<string, { data: unknown[] | null; error: unknown }> = {}
  const fromCalls: string[] = []
  jest.doMock('../lib/supabase', () => {
    const chain = (table: string) => {
      const result = Promise.resolve(tables[table] ?? { data: [], error: null })
      const q: Record<string, unknown> = { then: result.then.bind(result) }
      q.select = () => q
      q.order = () => q
      return q
    }
    return { supabase: { from: (t: string) => { fromCalls.push(t); return chain(t) } } }
  })
  const tracked: Record<string, unknown>[] = []
  jest.doMock('../lib/analytics', () => ({ track: (_n: string, p: Record<string, unknown>) => tracked.push(p) }))

  const realFetch = global.fetch
  afterEach(() => { setFetch(realFetch); tracked.length = 0; fromCalls.length = 0 })

  async function load(part: 'version' | 'ads' = 'version') {
    let mod!: typeof import('../lib/startupConfig')
    jest.isolateModules(() => { mod = require('../lib/startupConfig') })
    // Loading the module can install the runtime's own fetch again: put the test's back.
    if (wantedFetch) setFetch(wantedFetch)
    return mod.fetchStartupConfig(part)
  }

  it('never calls /api/startup, and one failed table leaves the other', async () => {
    tables.ad_banners = { data: null, error: new Error('missing') }
    tables.sponsored_events = { data: [{ event_id: 'e1', starts_at: null, ends_at: null }], error: null }
    setFetch(jest.fn())
    const res = await load('ads')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(res.banners).toEqual([])
    expect(res.sponsored).toHaveLength(1)
    expect(tracked).toEqual([expect.objectContaining({ arm: 'direct', source: 'direct', part: 'ads' })])
  })

  it('the update check reads only app_config, never the ad tables (#225)', async () => {
    tables.app_config = { data: [{ platform: 'web', min_version: '1.0.0', store_url: null, message: null }], error: null }
    tables.ad_banners = { data: [{ id: 'b' }], error: null }
    const res = await load('version')
    expect(res.appConfig).toHaveLength(1)
    expect(res.banners).toEqual([])
    expect(fromCalls).toEqual(['app_config'])
    expect(tracked).toEqual([expect.objectContaining({ arm: 'direct', source: 'direct', part: 'version' })])
  })
})
