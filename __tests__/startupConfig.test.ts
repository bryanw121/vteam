/**
 * #216: the startup config from the CDN (`api/startup.ts`), its pure helpers,
 * and the client loader's fallback to direct Supabase reads.
 */
import handler from '../api/startup'
import { fetchStartupConfig as fetchServer, STARTUP_CACHE_CONTROL } from '../api/_lib/startup'
import { feedAdsFrom, inWindow, isStartupConfig, pickStartupArm } from '../utils/startupConfig'
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

  it('picks an arm, honouring an override', () => {
    expect(pickStartupArm(0.2)).toBe('cdn')
    expect(pickStartupArm(0.8)).toBe('direct')
    expect(pickStartupArm(0.2, 'direct')).toBe('direct')
    expect(pickStartupArm(0.8, 'nonsense')).toBe('direct')
  })

  it('recognises a config', () => {
    expect(isStartupConfig({ appConfig: [], banners: [], sponsored: [] })).toBe(true)
    expect(isStartupConfig({ appConfig: [] })).toBe(false)
    expect(isStartupConfig(null)).toBe(false)
  })
})

describe('api/startup', () => {
  const realFetch = global.fetch
  const env = { ...process.env }
  afterEach(() => { setFetch(realFetch); process.env = { ...env } })

  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

  it('reads the three tables as anon', async () => {
    const urls: string[] = []
    const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
      urls.push(url)
      expect((init?.headers as Record<string, string>).apikey).toBe('anon')
      return ok([])
    })
    const res = await fetchServer({ url: 'https://x.supabase.co', anonKey: 'anon' }, fetchImpl)
    expect(res).toEqual({ appConfig: [], banners: [], sponsored: [] })
    expect(urls.map(u => new URL(u).pathname).sort()).toEqual(['/rest/v1/ad_banners', '/rest/v1/app_config', '/rest/v1/sponsored_events'])
  })

  it('serves a cacheable 200, and 502 when Supabase fails', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    setFetch(jest.fn(() => ok([])))
    const res = await handler(new Request('https://vteam.test/api/startup'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(STARTUP_CACHE_CONTROL)
    expect(await res.json()).toEqual({ appConfig: [], banners: [], sponsored: [] })

    setFetch(jest.fn(() => Promise.resolve(new Response('', { status: 500 }))))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handler(new Request('https://vteam.test/api/startup'))).status).toBe(502)
  })

  it('refuses writes', async () => {
    expect((await handler(new Request('https://vteam.test/api/startup', { method: 'POST' }))).status).toBe(405)
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
  const store = new Map<string, string>()
  const g = globalThis as { localStorage?: unknown }
  beforeAll(() => { g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), clear: () => store.clear() } })
  afterAll(() => { delete g.localStorage })
  afterEach(() => { setFetch(realFetch); tracked.length = 0; fromCalls.length = 0; store.clear() })

  async function load(armOverride: 'cdn' | 'direct', part: 'version' | 'ads' = 'version') {
    store.set('vteam.startupArm', armOverride)
    let mod!: typeof import('../lib/startupConfig')
    jest.isolateModules(() => { mod = require('../lib/startupConfig') })
    // Loading the module can install the runtime's own fetch again: put the test's back.
    if (wantedFetch) setFetch(wantedFetch)
    return mod.fetchStartupConfig(part)
  }

  it('cdn arm uses /api/startup when it answers', async () => {
    const cdn = { appConfig: [{ platform: 'web', min_version: '9.0.0', store_url: null, message: null }], banners: [], sponsored: [] }
    setFetch(jest.fn(() => Promise.resolve(new Response(JSON.stringify(cdn), { status: 200 }))))
    expect(await load('cdn')).toEqual(cdn)
    expect(tracked).toEqual([expect.objectContaining({ arm: 'cdn', source: 'cdn' })])
  })

  it('cdn arm falls back to Supabase on a failure', async () => {
    tables.app_config = { data: [{ platform: 'web', min_version: '1.0.0', store_url: null, message: null }], error: null }
    setFetch(jest.fn(() => Promise.resolve(new Response('', { status: 404 }))))
    const res = await load('cdn')
    expect(res.appConfig).toHaveLength(1)
    expect(tracked).toEqual([expect.objectContaining({ arm: 'cdn', source: 'fallback' })])
  })

  it('direct arm never calls the CDN, and one failed table leaves the other', async () => {
    tables.ad_banners = { data: null, error: new Error('missing') }
    tables.sponsored_events = { data: [{ event_id: 'e1', starts_at: null, ends_at: null }], error: null }
    setFetch(jest.fn())
    const res = await load('direct', 'ads')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(res.banners).toEqual([])
    expect(res.sponsored).toHaveLength(1)
    expect(tracked).toEqual([expect.objectContaining({ arm: 'direct', source: 'direct', part: 'ads' })])
  })

  it('the update check reads only app_config, never the ad tables (#225)', async () => {
    tables.ad_banners = { data: [{ id: 'b' }], error: null }
    const res = await load('direct', 'version')
    expect(res.appConfig).toHaveLength(1)
    expect(res.banners).toEqual([])
    expect(fromCalls).toEqual(['app_config'])
  })
})
