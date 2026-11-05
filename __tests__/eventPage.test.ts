/**
 * `api/event-page.ts` (#130): the Vercel function behind `/event/<uuid>` that
 * adds link-preview tags to the web app's index.html. PostgREST and the file
 * read are mocked; nothing hits the network.
 */
import handler, { escapeHtml, injectHeadTags, loadIndexHtml, resetIndexHtmlCache } from '../api/event-page'
import { fetchEventPreview, parseContentRangeTotal, requestOrigin, supabaseRestConfig } from '../api/_lib/eventPreview'
import { EVENT_PREVIEW_COLUMNS } from '../constants/selects'

jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
const { readFile } = jest.requireMock('fs/promises') as { readFile: jest.Mock }

const ID = '8f3c0000-0000-4000-8000-000000000001'
const BODY = '<body><div id="root"><div class="css-g5y9jx">splash</div></div><script src="/_expo/static/js/web/entry.js" defer></script></body></html>'
/** The shape `npx expo export -p web` writes (head trimmed). */
const SHELL = `<!DOCTYPE html><html  lang="en"><head><title data-rh="true"></title><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><meta name="theme-color" content="#13111F"/></head>${BODY}`

type Row = Record<string, unknown>

function mockPostgrest({ rows = [] as Row[], attending = 0, guests = 0, status = 200 } = {}) {
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (status !== 200) return new Response('{"message":"boom"}', { status })
    if (url.includes('/rest/v1/events?')) return new Response(JSON.stringify(rows), { status: 200 })
    const total = url.includes('event_attendees_attending') ? attending : guests
    expect(init?.method).toBe('HEAD')
    return new Response(null, { status: 200, headers: { 'content-range': `*/${total}` } })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function call({ id = ID, method = 'GET', host = 'vteamvolleyball.com' }: { id?: string; method?: string; host?: string } = {}) {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v },
    status(s: number) { this.statusCode = s; return this },
    send(b: string) { this.body = b },
    end() { this.body = '' },
  }
  const req = { method, query: { id }, headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https', host: 'internal' } }
  return (handler as unknown as (q: typeof req, r: typeof res) => Promise<void>)(req, res).then(() => res)
}

const head = (html: string) => html.slice(0, html.indexOf('</head>'))
const meta = (html: string, key: string) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"/>`))?.[1]

const realFetch = global.fetch
beforeEach(() => {
  resetIndexHtmlCache()
  readFile.mockReset().mockResolvedValue(SHELL)
  process.env.SUPABASE_URL = 'https://proj.supabase.co/'
  process.env.SUPABASE_ANON_KEY = 'anon-key'
  jest.useFakeTimers({ now: new Date('2026-10-30T19:15:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  global.fetch = realFetch
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  jest.useRealTimers()
  jest.restoreAllMocks()
})

const EVENT = { id: ID, title: 'Sand Doubles', event_date: '2026-10-31T21:00:00', location: 'Butler Park', max_attendees: 16, cancelled_at: null, price: null, duration_minutes: 120 }

describe('GET /event/<id>', () => {
  it('injects title, og:* and twitter:* tags, and caches at the CDN', async () => {
    const fetchMock = mockPostgrest({ rows: [EVENT], attending: 10, guests: 2 })
    const res = await call()

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=600')
    const html = res.body!
    expect(html).toContain('<title>Sand Doubles</title>')
    expect(meta(html, 'og:title')).toBe('Sand Doubles')
    expect(meta(html, 'og:description')).toBe('Sat, Oct 31, 4:00 PM CT · Butler Park · 4 of 16 spots left (as of Fri 2:15 PM) · Free')
    expect(meta(html, 'og:url')).toBe(`https://vteamvolleyball.com/event/${ID}`)
    expect(meta(html, 'og:image')).toMatch(new RegExp(`^https://vteamvolleyball\\.com/api/og/event\\?id=${ID}&amp;v=[0-9a-z]+$`))
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')
    expect(meta(html, 'og:image:width')).toBe('1200')

    // Anon-key PostgREST reads: the event's guest-visible columns + two head counts.
    const urls = fetchMock.mock.calls.map(c => c[0] as string)
    expect(urls).toContain(`https://proj.supabase.co/rest/v1/events?select=${EVENT_PREVIEW_COLUMNS}&id=eq.${ID}&limit=1`)
    expect(urls.filter(u => u.includes('event_attendees_attending?select=event_id&event_id=eq.'))).toHaveLength(1)
    expect(urls.filter(u => u.includes('event_guests_attending?select=event_id&event_id=eq.'))).toHaveLength(1)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer anon-key' })
  })

  it('changes only the head: the body the SPA hydrates is byte for byte the export', async () => {
    mockPostgrest({ rows: [EVENT] })
    const html = (await call()).body!
    expect(html.slice(html.indexOf('</head>'))).toBe(`</head>${BODY}`)
    // One <title> (the export's empty one is replaced), tags right after <meta charset>.
    expect(html.match(/<title/g)).toHaveLength(1)
    expect(head(html)).toMatch(/^<!DOCTYPE html><html {2}lang="en"><head><meta charSet="utf-8"\/><title>/)
  })

  it('escapes every value (title, place) so an event cannot inject markup', async () => {
    mockPostgrest({ rows: [{ ...EVENT, title: '"><script>alert(1)</script>', location: `Bob's <b>court</b> & bar` }] })
    const html = (await call()).body!
    expect(head(html)).not.toContain('<script>')
    expect(head(html)).not.toContain('<b>')
    expect(html).toContain('<title>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>')
    expect(meta(html, 'og:title')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(meta(html, 'og:description')).toContain('Bob&#39;s &lt;b&gt;court&lt;/b&gt; &amp; bar')
  })

  it('cancelled events say Cancelled', async () => {
    mockPostgrest({ rows: [{ ...EVENT, cancelled_at: '2026-10-30T12:00:00Z' }], attending: 4 })
    const html = (await call()).body!
    expect(meta(html, 'og:title')).toBe('Cancelled: Sand Doubles')
    expect(meta(html, 'og:description')).not.toContain('spots')
  })

  it('ended events say Ended', async () => {
    jest.setSystemTime(new Date('2026-11-02T00:00:00Z'))
    mockPostgrest({ rows: [EVENT], attending: 16 })
    expect(meta((await call()).body!, 'og:title')).toBe('Ended: Sand Doubles')
  })

  it('an unknown id gets the generic card (the SPA shows its own not-found)', async () => {
    mockPostgrest({ rows: [] })
    const res = await call()
    expect(res.statusCode).toBe(200)
    expect(meta(res.body!, 'og:title')).toBe('vteam')
    expect(meta(res.body!, 'og:image')).toBe('https://vteamvolleyball.com/api/og/event')
    expect(res.headers['cache-control']).toContain('s-maxage=300')
  })

  it('an invalid id never reaches Supabase', async () => {
    const fetchMock = mockPostgrest({ rows: [EVENT] })
    const res = await call({ id: 'not-a-uuid,or=(id.neq.0)' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(meta(res.body!, 'og:title')).toBe('vteam')
    expect(meta(res.body!, 'og:url')).toBe('https://vteamvolleyball.com')
  })

  it('a Supabase error serves the generic card with a short cache', async () => {
    mockPostgrest({ status: 503 })
    const res = await call()
    expect(res.statusCode).toBe(200)
    expect(meta(res.body!, 'og:title')).toBe('vteam')
    expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=30')
  })

  it('without Supabase env it still serves the app (generic card, short cache)', async () => {
    const saved = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY }
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.EXPO_PUBLIC_SUPABASE_URL // jest.setup.js fills these with placeholders
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    try {
      const fetchMock = mockPostgrest({ rows: [EVENT] })
      const res = await call()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(meta(res.body!, 'og:title')).toBe('vteam')
      expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=30')
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = saved.url
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = saved.key
    }
  })

  it('builds absolute URLs from the deployment host (preview deploys link to themselves)', async () => {
    mockPostgrest({ rows: [EVENT] })
    const html = (await call({ host: 'vteam-git-130.vercel.app' })).body!
    expect(meta(html, 'og:url')).toBe(`https://vteam-git-130.vercel.app/event/${ID}`)
    expect(meta(html, 'og:image')).toMatch(/^https:\/\/vteam-git-130\.vercel\.app\/api\/og\/event\?/)
  })

  it('HEAD gets headers and no body; other methods are rejected', async () => {
    mockPostgrest({ rows: [EVENT] })
    const head = await call({ method: 'HEAD' })
    expect(head.statusCode).toBe(200)
    expect(head.body).toBe('')
    const post = await call({ method: 'POST' })
    expect(post.statusCode).toBe(405)
  })

  it('500s if index.html was not bundled', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    mockPostgrest({ rows: [EVENT] })
    expect((await call()).statusCode).toBe(500)
  })
})

describe('helpers', () => {
  it('escapeHtml escapes the five HTML specials', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('injectHeadTags leaves a document without </head> alone', () => {
    expect(injectHeadTags('<p>hi</p>', '<title>x</title>')).toBe('<p>hi</p>')
  })

  it('reads index.html once per instance', async () => {
    await loadIndexHtml()
    await loadIndexHtml()
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile.mock.calls[0][0]).toMatch(/dist[/\\]index\.html$/)
  })

  it('parseContentRangeTotal', () => {
    expect(parseContentRangeTotal('0-4/5')).toBe(5)
    expect(parseContentRangeTotal('*/0')).toBe(0)
    expect(parseContentRangeTotal('*/*')).toBe(0)
    expect(parseContentRangeTotal(null)).toBe(0)
  })

  it('supabaseRestConfig prefers the server copies and falls back to EXPO_PUBLIC_*', () => {
    expect(supabaseRestConfig({ SUPABASE_URL: 'https://a.co/', SUPABASE_ANON_KEY: 'k', EXPO_PUBLIC_SUPABASE_URL: 'https://b.co' })).toEqual({ url: 'https://a.co', anonKey: 'k' })
    expect(supabaseRestConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://b.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'p' })).toEqual({ url: 'https://b.co', anonKey: 'p' })
    expect(supabaseRestConfig({})).toBeNull()
  })

  it('requestOrigin trusts only a well-formed host', () => {
    const h = (o: Record<string, string>) => (n: string) => o[n]
    expect(requestOrigin(h({ 'x-forwarded-host': 'a.com, b.com' }), 'https://f')).toBe('https://a.com')
    expect(requestOrigin(h({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }), 'https://f')).toBe('http://localhost:3000')
    expect(requestOrigin(h({ 'x-forwarded-host': 'evil.com/"><script>' }), 'https://f')).toBe('https://f')
    expect(requestOrigin(h({}), 'https://f')).toBe('https://f')
  })

  it('fetchEventPreview counts nobody for an event anon cannot see', async () => {
    mockPostgrest({ rows: [], attending: 3 })
    await expect(fetchEventPreview(ID, { url: 'https://p.co', anonKey: 'k' })).resolves.toEqual({ event: null, attending: 0 })
  })
})
