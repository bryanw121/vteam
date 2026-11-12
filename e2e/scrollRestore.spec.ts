import { devices, expect, test, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// On a phone browser, going back to the Profile tab used to land at the top:
// the browser's back (what the iPhone swipe-back does) remounts the tab screens,
// and leaving document-scroll mode scrolls the window to 0. DocScrollView now
// remembers the offset (utils/scrollMemory) and puts it back. Phone viewport,
// so Profile is in doc-scroll mode and the window is what scrolls. The Events
// cases (#254) cover the desktop feed (an inner ScrollView) and the phone feed's
// first frame after Back.

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
  test.use({ ...devices['Pixel 7'] })

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

/** Opens Book a court from the create menu: a pushed route with no data of its own, so it works on any database. */
async function openBookACourt(page: Page) {
  await page.getByTestId('create-menu-button').locator('visible=true').first().click()
  await page.getByText('Book a court', { exact: true }).locator('visible=true').first().click()
  await expect(page).toHaveURL(/\/book/)
}

/** The scrollTop of the scrolled area on desktop (the feed's ScrollView), or the window's offset on a phone. */
function feedOffset(page: Page): Promise<number> {
  return page.evaluate(() => {
    let top = window.scrollY
    for (const d of document.querySelectorAll('div')) if (d.scrollTop > top && d.offsetParent !== null) top = d.scrollTop
    return top
  })
}

test.describe('Events keeps its place after going back (#254)', () => {
  test.describe('desktop', () => {
    test.use({ viewport: { width: 1280, height: 860 } })

    test('browser Back from a pushed screen returns the feed to the same offset', async ({ page }) => {
      await page.goto(`${BASE_URL}/`)
      await expect(page.getByTestId('events-feed')).toBeVisible({ timeout: 20_000 })
      await page.mouse.move(640, 500)
      for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(50) }
      await expect.poll(() => feedOffset(page)).toBeGreaterThan(100)
      await page.waitForTimeout(300) // let the throttled scroll event record the offset
      const y = await feedOffset(page)
      await openBookACourt(page)
      await page.goBack()
      await expect(page.getByTestId('events-feed')).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => feedOffset(page), { timeout: 5_000 }).toBeGreaterThan(y - 5)
    })
  })

  test.describe('phone', () => {
    test.use({ ...devices['Pixel 7'] })

    test('browser Back never paints the top of Events before the remembered offset', async ({ page }) => {
      await page.goto(`${BASE_URL}/`)
      await expect(page.getByTestId('events-feed')).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => page.evaluate(() => document.body.classList.contains('doc-scroll'))).toBe(true)
      await page.evaluate(() => window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight - window.innerHeight)))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(220)
      // Scrolling down hides the tab bar (and its + button); a short scroll up brings it back.
      await page.waitForTimeout(200)
      await page.evaluate(() => window.scrollBy(0, -120))
      await page.waitForTimeout(400)
      const y = await page.evaluate(() => window.scrollY)
      await openBookACourt(page)
      // From the moment Back starts, record every frame where the filter chips are on screen at the wrong offset.
      await page.evaluate((target) => {
        const w = window as unknown as { __topFrames: number[] }
        w.__topFrames = []
        const start = performance.now()
        const tick = () => {
          const chip = document.querySelector('[data-testid="filter-tournament"]') as HTMLElement | null
          if (chip && chip.offsetParent !== null && getComputedStyle(chip).visibility !== 'hidden' && window.scrollY < target - 5) {
            const r = chip.getBoundingClientRect()
            if (r.bottom > 0 && r.top < window.innerHeight) w.__topFrames.push(Math.round(performance.now() - start))
          }
          if (performance.now() - start < 2000) requestAnimationFrame(tick)
        }
        window.addEventListener('popstate', () => requestAnimationFrame(tick), { once: true })
      }, y)
      await page.goBack()
      await expect(page.getByTestId('events-feed')).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeGreaterThan(y - 5)
      await page.waitForTimeout(500)
      expect(await page.evaluate(() => (window as unknown as { __topFrames: number[] }).__topFrames)).toEqual([])
    })
  })
})
