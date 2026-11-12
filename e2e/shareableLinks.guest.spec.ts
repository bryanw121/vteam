/**
 * Shareable links: the address follows what's on screen, and a copied link opens
 * the same view. Browses as a guest (the `guest` project), so it needs no account
 * and only reads public data from beta.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

const pathAndQuery = (page: Page) => {
  const u = new URL(page.url())
  return u.pathname + u.search
}

async function openFeed(page: Page, query = '') {
  await page.goto(`${BASE_URL}/${query}`)
  await expect(page.getByTestId('filter-all').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 })
}

for (const [label, viewport] of [['phone', MOBILE], ['desktop', DESKTOP]] as const) {
  test.describe(`Events feed links (${label})`, () => {
    test.use({ viewport })

    test('a link with filters opens them, and tapping a chip updates the address', async ({ page }) => {
      await openFeed(page, '?type=tournament&surface=sand')
      // Tournament is on (its "All tournaments" link shows), the link is kept, and Share appears.
      await expect(page.getByTestId('all-tournaments-link').filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByTestId('events-share-button').filter({ visible: true }).first()).toBeVisible()
      expect(pathAndQuery(page)).toBe('/?type=tournament&surface=sand')

      await page.getByTestId('filter-open_play').filter({ visible: true }).first().click()
      await expect.poll(() => pathAndQuery(page)).toBe('/?type=open_play&surface=sand')
      await page.getByTestId('filter-all').filter({ visible: true }).first().click()
      await page.getByTestId('surface-sand').filter({ visible: true }).first().click() // tapping the active surface clears it
      await expect.poll(() => pathAndQuery(page)).toBe('/')
    })

    test('a bad or old value falls back to the plain feed', async ({ page }) => {
      await openFeed(page, '?type=mine&surface=lava&day=2020-01-01')
      await expect(page.getByTestId('all-tournaments-link')).toHaveCount(0)
      await expect(page.getByTestId('events-share-button')).toHaveCount(0)
    })
  })
}

test.describe('Tabs on a phone browser', () => {
  test.use({ viewport: MOBILE })

  test('the address follows the tab, and each tab keeps its filters', async ({ page }) => {
    await openFeed(page, '?type=tournament')
    await page.getByRole('button', { name: /^Clubs/ }).click()
    await expect.poll(() => pathAndQuery(page)).toMatch(/^\/clubs/)
    await page.getByRole('button', { name: /^Events/ }).click()
    await expect.poll(() => pathAndQuery(page)).toBe('/?type=tournament')
  })

  test('opening /clubs directly still lets you switch tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/clubs`)
    await expect(page.getByRole('button', { name: /^Clubs, current tab/ })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /^Events/ }).click()
    await expect(page.getByTestId('filter-all').filter({ visible: true }).first()).toBeVisible()
    await expect.poll(() => pathAndQuery(page)).toBe('/')
  })
})

test.describe('Links to account pages', () => {
  test('a guest is asked to sign in and comes back to the same view', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/history?filter=hosted`)
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
    const back = await page.evaluate(() => sessionStorage.getItem('vclub.postSignInRedirect'))
    expect(back).toBe('/settings/history?filter=hosted')
  })

  test('the sign-in page opens Forgot password from its link', async ({ page }) => {
    await page.goto(`${BASE_URL}/login?mode=reset`)
    await expect(page.getByText(/reset/i).first()).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => new URL(page.url()).searchParams.get('mode')).toBe('reset')
  })
})
