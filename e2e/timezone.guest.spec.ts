/**
 * A viewer outside the pilot's time zone (#195): with the browser in Tokyo, an
 * outside session at 10:30 AM Tokyo tomorrow must show under "Tomorrow" with a
 * 10:30am time pill: the card, its day header and the calendar all use the
 * viewer's own clock. The feed is mocked (e2e/schelaggMock.ts helpers), so
 * nothing reaches the database.
 */
import { expect, test, type Route } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL, SUPABASE_URL } from './env'
import { fakeExternalSession, stubOutsideHosts } from './schelaggMock'

const TOKYO = 'Asia/Tokyo'
// Phone width: the feed groups by day there ("Tomorrow"); desktop groups by month.
test.use({ timezoneId: TOKYO, locale: 'en-US', viewport: { width: 390, height: 844 } })

/** YYYY-MM-DD for `at` in Tokyo. */
function tokyoDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TOKYO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })

test('a Tokyo viewer sees tomorrow 10:30 AM as Tomorrow, 10:30 AM', async ({ page }) => {
  const [y, m, d] = tokyoDay(new Date()).split('-').map(Number)
  // Tokyo is UTC+9 all year (no DST): 10:30 local = 01:30Z the same day.
  const start = new Date(Date.UTC(y, m - 1, d + 1, 1, 30))
  const tomorrowKey = tokyoDay(start)
  const session = {
    ...fakeExternalSession(),
    title: 'E2E Tokyo Morning Session',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 2 * 3600_000).toISOString(),
  }

  await stubOutsideHosts(page, BASE_URL, SUPABASE_URL)
  await page.route('**/rest/v1/rpc/get_feed_span**', route =>
    json(route, { events: [], tournaments: [], external: [session], previews: [] }))
  await page.route('**/rest/v1/external_sessions?**', route =>
    route.request().method() === 'GET' ? json(route, [session]) : route.fallback())

  await page.goto(`${BASE_URL}/`)
  const card = page.getByTestId('external-session-card').filter({ hasText: session.title }).first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  // The pill reads "10:30am–12:30pm" (device clock), not Austin's 7:30pm.
  await expect(card.getByTestId('external-session-time').first()).toContainText(/10:30\s?am/i)

  const header = page.getByTestId(`feed-day-${tomorrowKey}`).filter({ visible: true }).first()
  await expect(header).toHaveText('Tomorrow')
})
