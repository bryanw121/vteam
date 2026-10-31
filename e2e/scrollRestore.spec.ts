import { devices, expect, test, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// On a phone browser, going back to the Profile tab used to land at the top:
// the browser's back (what the iPhone swipe-back does) remounts the tab screens,
// and leaving document-scroll mode scrolls the window to 0. DocScrollView now
// remembers the offset (utils/scrollMemory) and puts it back. Phone viewport,
// so Profile is in doc-scroll mode and the window is what scrolls.
test.use({ ...devices['Pixel 7'] })

async function openProfileScrolledDown(page: Page): Promise<number> {
  await page.goto(`${BASE_URL}/`)
  await page.getByText('Me', { exact: true }).last().click()
  const account = page.getByTestId('profile-menu-account')
  await expect(account).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('doc-scroll'))).toBe(true)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  // Let the scroll event land before navigating away.
  await page.waitForTimeout(200)
  return page.evaluate(() => window.scrollY)
}

async function openAccountSettings(page: Page) {
  await page.getByTestId('profile-menu-account').click()
  await expect(page).toHaveURL(/\/settings\/account$/)
}

test.describe('Scroll position after going back', () => {
  test('browser back (the iPhone swipe) returns to the same place on Profile', async ({ page }) => {
    const y = await openProfileScrolledDown(page)
    await openAccountSettings(page)
    await page.goBack()
    await expect(page.getByTestId('profile-menu-account')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeGreaterThan(y - 5)
  })

  test("the header's back button returns to the same place on Profile", async ({ page }) => {
    const y = await openProfileScrolledDown(page)
    await openAccountSettings(page)
    await page.locator('[aria-label="Go back"]:visible').first().click()
    await expect(page.getByTestId('profile-menu-account')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeGreaterThan(y - 5)
  })
})
