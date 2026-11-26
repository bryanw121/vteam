/**
 * `api/outside-page.ts` (#395): link previews for shared outside games (`/?session=`,
 * `/tournaments?program=`). PostgREST and the file read are mocked; nothing hits the network.
 */
import handler from '../api/outside-page'
import { resetIndexHtmlCache } from '../api/event-page'
import { outsideId } from '../api/_lib/outsidePreview'
import vercel from '../vercel.json'

jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
const { readFile } = jest.requireMock('fs/promises') as { readFile: jest.Mock }

const BODY = '<body><div id="root">splash</div></body></html>'
const SHELL = `<!DOCTYPE html><html lang="en"><head><title data-rh="true"></title><meta charSet="utf-8"/></head>${BODY}`

const SESSION = { id: 'atx-beach-sat-sand', title: 'Sand open play', venue: 'Zilker Park', city: 'Austin', starts_at: '2026-11-28T16:00:00Z', ends_at: '2026-11-28T18:00:00Z', price: '$8', level: 'All levels' }
const PROGRAM = {
  id: 'nagva-lone-star', kind: 'tournament', org: 'NAGVA', title: 'NAGVA Lone Star Classic', city: 'Houston', venue: null, address: null,
  starts_on: '2026-12-05', ends_on: '2026-12-06', weekdays: [], registration_opens: null, registration_deadline: '2026-11-30', status: 'open',
  divisions: [], price_changes_on: null,
}

function mockPostgrest(rows: { sessions?: unknown[]; programs?: unknown[] }, status = 200) {
  const fetchMock = jest.fn(async (url: string) => {
    if (status !== 200) return new Response('{}', { status })
    const body = url.includes('/external_sessions?') ? rows.sessions ?? [] : rows.programs ?? []
    return new Response(JSON.stringify(body), { status: 200 })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function call(query: Record<string, string>) {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v },
    status(s: number) { this.statusCode = s; return this },
    send(b: string) { this.body = b },
    end() { this.body = '' },
  }
  const req = { method: 'GET', query, headers: { 'x-forwarded-host': 'vteamvolleyball.com', 'x-forwarded-proto': 'https' } }
  return (handler as unknown as (q: typeof req, r: typeof res) => Promise<void>)(req, res).then(() => res)
}

const meta = (html: string, key: string) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"/>`))?.[1]

const realFetch = global.fetch
beforeEach(() => {
  resetIndexHtmlCache()
  readFile.mockReset().mockResolvedValue(SHELL)
  process.env.SUPABASE_URL = 'https://proj.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'anon-key'
  jest.useFakeTimers({ now: new Date('2026-11-25T19:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  global.fetch = realFetch
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('outside game link previews (#395)', () => {
  it('previews a shared session and keeps the body as exported', async () => {
    const fetchMock = mockPostgrest({ sessions: [SESSION] })
    const res = await call({ session: SESSION.id })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<title>Sand open play at Zilker Park</title>')
    expect(meta(res.body!, 'og:description')).toContain('Sat, Nov 28 at 10:00 AM')
    expect(meta(res.body!, 'og:url')).toBe('https://vteamvolleyball.com/?session=atx-beach-sat-sand')
    expect(res.body!.endsWith(BODY)).toBe(true)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/rest/v1/external_sessions?select=')
  })

  it('previews a shared tournament and points at its sheet', async () => {
    mockPostgrest({ programs: [PROGRAM] })
    const res = await call({ program: PROGRAM.id })
    expect(res.body).toContain('<title>NAGVA Lone Star Classic</title>')
    expect(meta(res.body!, 'og:description')).toBe('Tournament run by NAGVA. NAGVA Lone Star Classic in Houston, Sat, Dec 5 – Sun, Dec 6. Sign up by Mon, Nov 30.')
    expect(meta(res.body!, 'og:url')).toBe('https://vteamvolleyball.com/tournaments?program=nagva-lone-star')
  })

  it('falls back to the generic card for a gone row, a bad id and a failed read', async () => {
    mockPostgrest({})
    expect((await call({ program: 'gone' })).body).toContain('<title>vteam</title>')
    const fetchMock = mockPostgrest({ sessions: [SESSION] })
    expect((await call({ session: '../etc' })).body).toContain('<title>vteam</title>')
    expect(fetchMock).not.toHaveBeenCalled()
    mockPostgrest({}, 500)
    const failed = await call({ session: SESSION.id })
    expect(failed.body).toContain('<title>vteam</title>')
    expect(failed.headers['cache-control']).toBe('public, max-age=0, s-maxage=30')
  })

  it('only takes Skelly-shaped ids', () => {
    expect(outsideId('nagva-lone-star')).toBe('nagva-lone-star')
    expect(outsideId('a b')).toBeNull()
    expect(outsideId(['x'])).toBeNull()
  })

  it('is routed before the static files, by query', () => {
    const routes = (vercel as { routes: { src?: string; has?: { key: string }[]; dest?: string; handle?: string }[] }).routes
    const fs = routes.findIndex(r => r.handle === 'filesystem')
    const mine = routes.map((r, i) => ({ r, i })).filter(({ r }) => r.dest === '/api/outside-page')
    expect(mine.map(({ r }) => r.has?.[0].key).sort()).toEqual(['program', 'session'])
    expect(mine.every(({ i }) => i < fs)).toBe(true)
  })
})
