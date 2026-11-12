/**
 * Schelagg mocks for e2e. The suite never reaches Schelagg (or a venue's site)
 * for real: everything the app asks of it is answered here with page.route.
 *
 * - Court availability: the live API (`/api/courts`) and the static fallback
 *   (`data/courts.json`), built from __tests__/fixtures/courts.json with its
 *   dates moved to "today in Austin" so the /book day strip lines up.
 * - The last-mile check (`/api/check?session=`) for outside-session cards.
 * - The Events feed's outside sessions: the Supabase REST calls the feed makes
 *   (`rpc/get_feed_span`, and the `external_sessions` select it falls back to)
 *   are fulfilled with one fake session, so nothing is written to the DB.
 * - Venue sign-up / booking hosts are blocked, so a popup only records its URL.
 *
 * URLs mirror constants/schelagg.ts (the e2e suite doesn't import app code).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Page, Route } from '@playwright/test'

export const SCHELAGG_API_BASE = 'https://schelagg.vercel.app'
export const SCHELAGG_SITE_BASE = 'https://bryanw121.github.io/schelagg'
export const COURTS_API_GLOB = `${SCHELAGG_API_BASE}/api/courts**`
export const COURTS_STATIC_GLOB = `${SCHELAGG_SITE_BASE}/data/courts.json**`
export const CHECK_API_GLOB = `${SCHELAGG_API_BASE}/api/check**`

export const AUSTIN_TZ = 'America/Chicago'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Today's date in Austin, YYYY-MM-DD. */
export function austinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AUSTIN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon, Oct 26": the /book day heading (utils/courts dayParts). */
export function dayLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MON[m - 1]} ${d}`
}

// ─── Court data ──────────────────────────────────────────────────────────────

type CourtsFixture = {
  fetchedAt: string
  from: string
  days: number
  venues: {
    id: string
    calendar: string
    calendarDay?: string
    facilities: { id: string; name: string; surface: string; courts: { name: string; days: Record<string, unknown> }[] }[]
  }[]
  errors: unknown[]
}

const FIXTURE: CourtsFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '__tests__/fixtures/courts.json'), 'utf8'),
)

/** The unit-test fixture with every date moved so `from` is today in Austin and `fetchedAt` is a minute ago. */
export function courtsForToday(): CourtsFixture {
  const today = austinToday()
  const shift = daysBetween(FIXTURE.from, today)
  const copy: CourtsFixture = JSON.parse(JSON.stringify(FIXTURE))
  copy.from = today
  copy.fetchedAt = new Date(Date.now() - 60_000).toISOString()
  for (const venue of copy.venues) {
    for (const facility of venue.facilities) {
      for (const court of facility.courts) {
        court.days = Object.fromEntries(
          Object.entries(court.days).map(([day, blocks]) => [addDays(day, shift), blocks]),
        )
      }
    }
  }
  return copy
}

/** Facilities in the fixture, for asserting what /book shows. */
export const FIXTURE_FACILITIES = FIXTURE.venues.flatMap(v =>
  v.facilities.map(f => ({ id: f.id, name: f.name, surface: f.surface, calendar: v.calendar })),
)

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })

export type CourtsMode = 'live' | 'static-only' | 'both-fail'

/**
 * Answer /book's two sources. `live`: the API answers. `static-only`: the API
 * request is aborted, the static file answers. `both-fail`: both aborted.
 * Returns counters of the requests each source received.
 */
export async function mockCourts(page: Page, mode: CourtsMode) {
  const hits = { live: 0, static: 0 }
  await page.route(COURTS_API_GLOB, async route => {
    hits.live++
    if (mode === 'live') await json(route, courtsForToday())
    else await route.abort('failed')
  })
  await page.route(COURTS_STATIC_GLOB, async route => {
    hits.static++
    if (mode === 'both-fail') await route.abort('failed')
    else await json(route, courtsForToday())
  })
  return hits
}

// ─── Outside hosts (venue booking / sign-up pages) ───────────────────────────

/**
 * Answer every request that isn't the app, Supabase or Schelagg (mocked
 * separately) with a stub page, so the venue sites a popup opens are never
 * reached. Applied to the browser context, so it also covers pages the app
 * opens with window.open; the popup keeps the requested URL to assert on.
 * Returns the outside URLs that were requested.
 */
export async function stubOutsideHosts(page: Page, appOrigin: string, supabaseUrl: string): Promise<string[]> {
  const requested: string[] = []
  const allowed = new Set([new URL(appOrigin).host, new URL(supabaseUrl).host])
  await page.context().route(
    url => url.protocol.startsWith('http') && !allowed.has(url.host)
      && !url.href.startsWith(SCHELAGG_API_BASE) && !url.href.startsWith(SCHELAGG_SITE_BASE),
    async route => {
      requested.push(route.request().url())
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>stub' })
      } else {
        await route.abort('blockedbyclient')
      }
    },
  )
  return requested
}

// ─── Outside session in the Events feed ──────────────────────────────────────

export const FAKE_SESSION_ID = 'e2e-schelagg-session-1'
export const FAKE_SESSION_TITLE = 'E2E Outside Open Gym'
export const FAKE_SIGNUP_URL = 'https://venue.e2e.invalid/signup/open-gym'

/**
 * A future time today (local = Austin, the browser's timezoneId in these
 * specs), so the session is in the month the feed loads and past its
 * start-of-today cut-off.
 */
function laterToday(): Date {
  const now = new Date()
  const later = new Date(now.getTime() + 60 * 60_000)
  return austinToday(later) === austinToday(now) ? later : new Date(now.getTime() + 60_000)
}

export function fakeExternalSession() {
  const start = laterToday()
  return {
    id: FAKE_SESSION_ID,
    source_id: 'e2e',
    region: 'austin',
    title: FAKE_SESSION_TITLE,
    venue: 'E2E Rec Center',
    city: 'Austin',
    surface: 'indoor',
    session_type: 'open_play',
    level: 'All levels',
    price: '$10',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 2 * 3600_000).toISOString(),
    signup_url: FAKE_SIGNUP_URL,
    signup_label: null,
    note: null,
    verified_at: new Date().toISOString(),
  }
}

/**
 * Make the Events feed deterministic: get_feed_span returns no club events and
 * exactly one outside session; the three-query fallback (if the RPC path is
 * ever skipped) returns the same. Read-only: nothing reaches the DB's tables.
 */
export async function mockFeedWithOneOutsideSession(page: Page) {
  const session = fakeExternalSession()
  await page.route('**/rest/v1/rpc/get_feed_span**', route =>
    json(route, { events: [], tournaments: [], external: [session], previews: [] }))
  await page.route('**/rest/v1/external_sessions?**', route =>
    route.request().method() === 'GET' ? json(route, [session]) : route.fallback())
  for (const table of ['events', 'tournaments']) {
    await page.route(`**/rest/v1/${table}?**`, route =>
      route.request().method() === 'GET' && /[?&](event_date|start_date)=/.test(route.request().url())
        ? json(route, [])
        : route.fallback())
  }
  return session
}

export type CheckReply =
  | { kind: 'json'; body: unknown; delayMs?: number }
  | { kind: 'status'; status: number }

/** Answer /api/check. Returns the session ids it was asked about. */
export async function mockSessionCheck(page: Page, reply: CheckReply): Promise<string[]> {
  const asked: string[] = []
  await page.route(CHECK_API_GLOB, async route => {
    asked.push(new URL(route.request().url()).searchParams.get('session') ?? '')
    if (reply.kind === 'status') return json(route, { error: 'nope' }, reply.status)
    if (reply.delayMs) await new Promise(r => setTimeout(r, reply.delayMs))
    try {
      await json(route, reply.body)
    } catch {
      // The app aborted the request at its deadline: nothing left to answer.
    }
  })
  return asked
}
