import { expect, test } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// Runs without the shared session (see the `guest` project in playwright.config.ts).
test.describe('guest browsing', () => {
  test('events load without signing in', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)
    await expect(page).toHaveURL(`${BASE_URL}/`)
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('header-sign-in').first()).toBeVisible()
  })

  test('week strip names its month, steps with the arrows, and Today comes back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // The label is the month of the week's last day (a week running into a new month shows the new one).
    const labelFor = (weeksAhead: number) => {
      const d = new Date()
      d.setDate(d.getDate() - d.getDay() + 6 + weeksAhead * 7)
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    await page.goto(`${BASE_URL}/`)
    const label = page.getByTestId('week-month-label').first()
    await expect(label).toHaveText(labelFor(0), { timeout: 20_000 })
    await expect(page.getByTestId('week-today')).toHaveCount(0)
    for (let i = 0; i < 5; i++) await page.getByTestId('week-next').first().click()
    await expect(label).toHaveText(labelFor(5))
    await page.getByTestId('week-prev').first().click()
    await expect(label).toHaveText(labelFor(4))
    await page.getByTestId('week-today').first().click()
    await expect(label).toHaveText(labelFor(0))
    await expect(page.getByTestId('week-today')).toHaveCount(0)
  })

  test('chat and profile ask the guest to sign in', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`)
    await expect(page.getByTestId('sign-in-prompt').first()).toBeVisible({ timeout: 20_000 })
    await page.goto(`${BASE_URL}/profile`)
    await expect(page.getByTestId('sign-in-prompt').first()).toBeVisible({ timeout: 20_000 })
  })

  test('account-only routes send guests to login, and they can keep browsing', async ({ page }) => {
    await page.goto(`${BASE_URL}/host`)
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
    await page.getByTestId('continue-as-guest').click()
    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20_000 })
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
  })

  // The static HTML is rendered without a viewport, session or clock, so the
  // root layout renders only the splash until hydrated (app/_layout.tsx).
  // Anything that breaks that shows up as React error #418 here.
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`pages hydrate without a mismatch at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const errors: string[] = []
      page.on('pageerror', err => errors.push(err.message))
      for (const path of ['/', '/clubs']) {
        await page.goto(`${BASE_URL}${path}`)
        // The phone pager keeps other tabs mounted (hidden), each with its own sign-in button.
        await expect(page.getByTestId('header-sign-in').filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
      }
      expect(errors.filter(m => /#418|[Hh]ydrat/.test(m))).toEqual([])
    })
  }

  test('signing in from a page and backing out returns to that page', async ({ page }) => {
    await page.goto(`${BASE_URL}/clubs`)
    await page.getByTestId('header-sign-in').first().click()
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
    await page.getByTestId('continue-as-guest').click()
    await expect(page).toHaveURL(`${BASE_URL}/clubs`, { timeout: 20_000 })
  })
})
