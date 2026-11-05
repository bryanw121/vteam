import { expect, test, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { BANNERS } from '../constants/banners'
import { TOURS } from '../constants/tours'
import { ANALYTICS_EVENTS as E } from '../constants/analytics'

// Guest project. Analytics is off in automated browsers unless opted in; this
// spec opts in and intercepts the insert, so nothing reaches the real table.
const BANNER_ID = BANNERS.austinPilot.id
const STEPS = TOURS.intro.steps
type Row = { name: string; props: Record<string, unknown>; anon_id?: string; platform?: string }

async function captureInserts(page: Page): Promise<{ rows: Row[]; requests: number }> {
  const captured = { rows: [] as Row[], requests: 0 }
  await page.addInitScript(() => window.localStorage.setItem('vteam.analytics', 'on'))
  await page.route('**/rest/v1/app_events*', async route => {
    if (route.request().method() === 'POST') {
      captured.requests++
      const body = route.request().postDataJSON() as Row | Row[]
      captured.rows.push(...(Array.isArray(body) ? body : [body]))
    }
    await route.fulfill({ status: 201, body: '' })
  })
  return captured
}

/** Hide the page (what a tab switch / backgrounding does) so the buffer flushes now. */
async function hidePage(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function named(rows: Row[], name: string) {
  return rows.filter(r => r.name === name)
}

async function startTourFromBanner(page: Page) {
  await page.goto(`${BASE_URL}/`)
  await page.getByTestId(`banner-${BANNER_ID}-action`).locator('visible=true').click({ timeout: 20_000 })
  await expect(page.getByTestId('tour-card').getByText(STEPS[0].title, { exact: true })).toBeVisible({ timeout: 10_000 })
}

test.describe('usage metrics', () => {
  test('banner and a completed tour are recorded in batched inserts', async ({ page }) => {
    const captured = await captureInserts(page)
    await startTourFromBanner(page)
    for (let i = 0; i < STEPS.length; i++) {
      await expect(page.getByTestId('tour-card').getByText(STEPS[i].title, { exact: true })).toBeVisible({ timeout: 10_000 })
      await page.getByTestId('tour-next').click()
    }
    await expect(page.getByTestId('tour-overlay')).toHaveCount(0)
    await hidePage(page)

    await expect.poll(() => named(captured.rows, E.tourCompleted).length, { timeout: 15_000 }).toBe(1)
    const { rows } = captured
    expect(named(rows, E.bannerShown)[0].props).toEqual({ banner: BANNER_ID })
    expect(named(rows, E.bannerAction)[0].props).toEqual({ banner: BANNER_ID, action: 'startTour' })
    expect(named(rows, E.tourStarted)[0].props).toEqual({ tour: 'intro', source: 'banner' })
    const viewed = named(rows, E.tourStepViewed).map(r => r.props)
    expect(viewed).toEqual(STEPS.map((s, i) => ({ tour: 'intro', step: i, target: s.target })))
    expect(named(rows, E.tourCompleted)[0].props).toEqual({ tour: 'intro', step: STEPS.length - 1 })
    expect(named(rows, E.tourSkipped)).toHaveLength(0)

    // Batched (far fewer requests than events), one device id, the platform, and no user_id from the client.
    expect(captured.requests).toBeLessThan(rows.length)
    expect(new Set(rows.map(r => r.anon_id)).size).toBe(1)
    expect(rows.every(r => r.platform === 'web' && !('user_id' in r))).toBe(true)
  })

  test('skipping records the step it was on', async ({ page }) => {
    const captured = await captureInserts(page)
    await startTourFromBanner(page)
    await page.getByTestId('tour-next').click()
    await expect(page.getByTestId('tour-card').getByText(STEPS[1].title, { exact: true })).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('tour-skip').click()
    await hidePage(page)

    await expect.poll(() => named(captured.rows, E.tourSkipped).length, { timeout: 15_000 }).toBe(1)
    expect(named(captured.rows, E.tourSkipped)[0].props).toEqual({ tour: 'intro', step: 1, target: STEPS[1].target })
    expect(named(captured.rows, E.tourCompleted)).toHaveLength(0)
    expect(named(captured.rows, E.tourStepViewed)).toHaveLength(2)
  })

  test('dismissing the banner is recorded', async ({ page }) => {
    const captured = await captureInserts(page)
    await page.goto(`${BASE_URL}/`)
    await page.getByTestId(`banner-${BANNER_ID}-dismiss`).locator('visible=true').click({ timeout: 20_000 })
    await hidePage(page)
    await expect.poll(() => named(captured.rows, E.bannerDismissed).length, { timeout: 15_000 }).toBe(1)
    expect(named(captured.rows, E.bannerDismissed)[0].props).toEqual({ banner: BANNER_ID })
  })
})
