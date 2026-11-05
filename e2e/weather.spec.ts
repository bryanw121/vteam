/**
 * Weather on outdoor games (#165). beforeAll creates a sand event and an indoor
 * event tomorrow, both with coordinates, hosted by the e2e account; afterAll
 * deletes them. The forecast proxy (`/api/forecast`, a Vercel function that
 * `npx serve dist` doesn't have) is answered with `page.route`, so the National
 * Weather Service is never called.
 *
 * Titles use their own `[e2e-wx <tag>]` prefix: the events suite runs in the
 * same shard and its beforeAll scrubs every `[e2e <tag>]` event of this run.
 * `npm run e2e:sweep` knows the prefix.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL, E2E_RUN_TAG, STALE_FIXTURE_HOURS } from './env'
import { signInE2eClient } from './eventsFixtures'
import { gotoReady, withNetworkRetry } from './retry'

const PREFIX = `[e2e-wx ${E2E_RUN_TAG}]`
const SAND_TITLE = `${PREFIX} Sand Doubles`
const INDOOR_TITLE = `${PREFIX} Indoor Sixes`
const HOUR = 3600_000

test.describe.configure({ mode: 'serial' })

let sandId = ''
let start = 0

async function deleteWeatherEvents() {
  const { supabase, userId } = await signInE2eClient()
  try {
    await withNetworkRetry(async () => {
      const own = await supabase.from('events').delete().eq('created_by', userId).like('title', `${PREFIX}%`)
      if (own.error) throw new Error(`Failed to clean weather events: ${own.error.message}`)
      const staleBefore = new Date(Date.now() - STALE_FIXTURE_HOURS * HOUR).toISOString()
      const stale = await supabase.from('events').delete().eq('created_by', userId).like('title', '[e2e-wx%').lt('created_at', staleBefore)
      if (stale.error) throw new Error(`Failed to clean stale weather events: ${stale.error.message}`)
    }, { label: 'clean weather events' })
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

/** An hourly series from 6h before `start` to 6h after, raining during the game. */
function forecastAround(startMs: number) {
  const first = Math.floor(startMs / HOUR) * HOUR - 6 * HOUR
  return {
    updatedAt: new Date().toISOString(),
    hours: Array.from({ length: 12 }, (_, i) => ({
      t: new Date(first + i * HOUR).toISOString(),
      tempF: 64 + i,
      pop: 70,
      windMph: 12,
      short: 'Rain Showers Likely',
      icon: 'day/rain_showers',
      rh: 80,
    })),
  }
}

async function routeForecast(page: Page, mode: 'rain' | 'none') {
  const requests: string[] = []
  await page.route('**/api/forecast**', route => {
    requests.push(route.request().url())
    if (mode === 'none') return route.fulfill({ status: 204 })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(forecastAround(start)) })
  })
  return requests
}

test.beforeAll(async () => {
  await deleteWeatherEvents()
  const { supabase, userId } = await signInE2eClient()
  try {
    const d = new Date(Date.now() + 24 * HOUR)
    d.setMinutes(0, 0, 0)
    start = d.getTime()
    const common = {
      description: 'Ephemeral e2e fixture — safe to ignore.',
      event_date: d.toISOString(),
      duration_minutes: 120,
      max_attendees: null,
      created_by: userId,
    }
    const inserted = await withNetworkRetry(async () => {
      const res = await supabase.from('events').insert([
        { ...common, title: SAND_TITLE, location: 'E2E Sand Courts', latitude: 30.26204, longitude: -97.75196, surface: 'sand' },
        { ...common, title: INDOOR_TITLE, location: 'E2E Gym', latitude: 30.26204, longitude: -97.75196, surface: 'indoor' },
      ]).select('id, title')
      if (res.error || !res.data) throw new Error(`Failed to insert weather events: ${res.error?.message ?? 'no rows'}`)
      return res.data
    }, { label: 'seed weather events' })
    sandId = inserted.find(r => r.title === SAND_TITLE)!.id
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
})

test.afterAll(async () => {
  await deleteWeatherEvents()
})

const card = (page: Page, title: string) =>
  page.getByTestId('events-feed').getByTestId('event-card').filter({ hasText: title }).first()

test('the sand card shows a rain chip; the indoor card shows none; one request per court', async ({ page }) => {
  const requests = await routeForecast(page, 'rain')
  await gotoReady(page, `${BASE_URL}/`, card(page, SAND_TITLE))
  const chip = card(page, SAND_TITLE).getByTestId('forecast-chip')
  await expect(chip).toBeVisible({ timeout: 20_000 })
  await expect(chip).toHaveText(/70% rain/)
  await expect(chip).toHaveAttribute('aria-label', 'Forecast: 70 percent chance of rain')
  await expect(card(page, INDOOR_TITLE)).toBeVisible()
  await expect(card(page, INDOOR_TITLE).getByTestId('forecast-chip')).toHaveCount(0)
  // Rounded to the court: every request is for 30.26,-97.75 (other e2e or beta events may add courts).
  expect(requests.filter(u => /lat=30\.26&lng=-97\.75/.test(u))).toHaveLength(1)
})

test('the event page shows the game hours', async ({ page }) => {
  await routeForecast(page, 'rain')
  const row = page.getByTestId('forecast-row').filter({ visible: true }).first()
  await gotoReady(page, `${BASE_URL}/event/${sandId}`, row)
  await expect(row.getByTestId('forecast-headline')).toHaveText('Rain likely during the game')
  // One hour before, two game hours, and the hour that starts at the end.
  await expect(row.getByTestId('forecast-cell-game')).toHaveCount(2)
  await expect(row.getByTestId('forecast-cell')).toHaveCount(2)
  await expect(row.getByText(/Forecast from the National Weather Service/)).toBeVisible()
})

test('no forecast (204) means no row and no chip', async ({ page }) => {
  await routeForecast(page, 'none')
  await gotoReady(page, `${BASE_URL}/event/${sandId}`, page.getByTestId('event-location-name').filter({ visible: true }).first())
  // Give the forecast request time to come back before asserting it drew nothing.
  await page.waitForResponse(r => r.url().includes('/api/forecast'), { timeout: 15_000 }).catch(() => {})
  await expect(page.getByTestId('forecast-row')).toHaveCount(0)
})
