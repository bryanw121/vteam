/**
 * #184: the Events feed request started from the page's <head>. The inline
 * script's span must equal the app's for the same clock, and the hook adopts
 * it only for the same span and viewer.
 */
import { feedSpanArgs } from '../utils/feedFirstSpan'
import { buildFeedPrefetchScript } from '../utils/feedPrefetchScript'
import { takeFeedPrefetch } from '../lib/feedPrefetch.web'
import { TIMEOUT_MESSAGE } from '../lib/serverHealth'
import { addMonths, monthEndIso, monthStartIso } from '../utils/monthKeys'
import { localDateKey } from '../utils'
import { EXTERNAL_SESSION_MAX_AGE_MS } from '../constants/events'
/** A Date at this wall-clock time in the zone the tests run in (month is 1-based). */
const localDate = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi)

/** What the Events screen asks for first: the week strip's month(s) on a phone, this month + 3 on desktop. */
function appSpan(now: Date, wide: boolean) {
  const month = localDateKey(now).substring(0, 7)
  if (wide) return { p_start: monthStartIso(month), p_end: monthEndIso(addMonths(month, 3)) }
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)
  const m1 = localDateKey(weekStart).substring(0, 7)
  const m2 = localDateKey(weekEnd).substring(0, 7)
  return { p_start: monthStartIso(m1), p_end: monthEndIso(m2) }
}

const DATES = [
  localDate(2026, 11, 7, 13, 20), // mid-month
  localDate(2026, 11, 30, 23, 50), // week runs into December
  localDate(2026, 12, 1, 0, 5), // week started in November
  localDate(2026, 12, 31, 22, 0), // year end
  localDate(2026, 3, 8, 3, 0), // spring-forward day
]

describe('feedSpanArgs', () => {
  it.each(DATES.map(d => [d.toISOString(), d] as const))('matches the app span at %s, narrow and wide', (_, d) => {
    for (const wide of [false, true]) {
      const args = feedSpanArgs(d.getTime(), wide, EXTERNAL_SESSION_MAX_AGE_MS)
      expect({ p_start: args.p_start, p_end: args.p_end }).toEqual(appSpan(d, wide))
      expect(args.p_external_updated_since).toBe(new Date(d.getTime() - EXTERNAL_SESSION_MAX_AGE_MS).toISOString())
    }
  })

  it('works the same from its own source (the way the inline script runs it)', () => {
    const fromSource = new Function(`return (${feedSpanArgs.toString()})`)() as typeof feedSpanArgs
    for (const d of DATES) {
      for (const wide of [false, true]) {
        expect(fromSource(d.getTime(), wide, 1000)).toEqual(feedSpanArgs(d.getTime(), wide, 1000))
      }
    }
  })
})

describe('buildFeedPrefetchScript', () => {
  const ORIGIN = 'https://abcref.supabase.co'
  const script = buildFeedPrefetchScript(ORIGIN, 'anon-key')

  function run(opts: { path?: string; session?: object | null; width?: number }) {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = []
    const win: Record<string, unknown> = {}
    win.fetch = (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, init })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    }
    const store: Record<string, string> = {}
    if (opts.session) store['sb-abcref-auth-token'] = JSON.stringify(opts.session)
    const localStorage = { getItem: (k: string) => store[k] ?? null }
    new Function('window', 'location', 'localStorage', 'fetch', 'innerWidth', script)(
      win, { pathname: opts.path ?? '/' }, localStorage, win.fetch, opts.width ?? 390,
    )
    return { calls, win }
  }

  it('stays small', () => {
    expect(script.length).toBeLessThan(1600)
  })

  it('on / posts the first span with the anon key for a guest', () => {
    const { calls, win } = run({})
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${ORIGIN}/rest/v1/rpc/get_feed_span`)
    expect(calls[0].init.headers.Authorization).toBe('Bearer anon-key')
    const body = JSON.parse(calls[0].init.body)
    const span = feedSpanArgs(Date.now(), false, EXTERNAL_SESSION_MAX_AGE_MS)
    expect(body.p_start).toBe(span.p_start)
    expect(body.p_end).toBe(span.p_end)
    expect((win.__vteamPrefetch as { feed: { viewer: null } }).feed.viewer).toBeNull()
  })

  it('uses the stored token only while it is valid for another minute', () => {
    const fresh = { access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }
    const ok = run({ session: fresh })
    expect(ok.calls[0].init.headers.Authorization).toBe('Bearer tok')
    expect((ok.win.__vteamPrefetch as { feed: { viewer: string } }).feed.viewer).toBe('u1')

    const expiring = run({ session: { ...fresh, expires_at: Math.floor(Date.now() / 1000) + 30 } })
    expect(expiring.calls[0].init.headers.Authorization).toBe('Bearer anon-key')
    expect((expiring.win.__vteamPrefetch as { feed: { viewer: null } }).feed.viewer).toBeNull()
  })

  it('asks for four months on a wide screen, and nothing off the Events path', () => {
    const wide = run({ width: 1280 })
    const span = feedSpanArgs(Date.now(), true, EXTERNAL_SESSION_MAX_AGE_MS)
    expect(JSON.parse(wide.calls[0].init.body).p_end).toBe(span.p_end)
    expect(run({ path: '/event/abc' }).calls).toHaveLength(0)
  })
})

describe('takeFeedPrefetch', () => {
  const put = (feed: object) => { (window as unknown as { __vteamPrefetch: object }).__vteamPrefetch = { feed } }
  const promise = Promise.resolve({ events: [] })

  it('hands over a matching prefetch once', async () => {
    put({ start: 's', end: 'e', viewer: 'u1', at: Date.now(), promise })
    const taken = takeFeedPrefetch('s', 'e', 'u1')
    await expect(taken).resolves.toEqual({ events: [] })
    expect(takeFeedPrefetch('s', 'e', 'u1')).toBeNull()
  })

  it("gives up on it 15 s after it started, like the app's own reads (#289)", async () => {
    jest.useFakeTimers()
    try {
      put({ start: 's', end: 'e', viewer: null, at: Date.now() - 10_000, promise: new Promise(() => {}) })
      const taken = takeFeedPrefetch('s', 'e', null)
      const assertion = expect(taken).rejects.toThrow(TIMEOUT_MESSAGE)
      jest.advanceTimersByTime(5_000)
      await assertion
    } finally {
      jest.useRealTimers()
    }
  })

  it('drops it for another span, another viewer, or when older than 15 s', () => {
    put({ start: 's', end: 'e', viewer: null, at: Date.now(), promise })
    expect(takeFeedPrefetch('s', 'e2', null)).toBeNull()
    put({ start: 's', end: 'e', viewer: null, at: Date.now(), promise })
    expect(takeFeedPrefetch('s', 'e', 'u1')).toBeNull()
    put({ start: 's', end: 'e', viewer: null, at: Date.now() - 16_000, promise })
    expect(takeFeedPrefetch('s', 'e', null)).toBeNull()
  })
})
