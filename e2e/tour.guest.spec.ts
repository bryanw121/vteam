import { expect, test, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { BANNERS } from '../constants/banners'
import { TOURS } from '../constants/tours'

// Guest project (no stored session, no DB writes): the intro tour from the
// Austin banner, and again from the persistent "Take the tour" entry.
const BANNER_ID = BANNERS.austinPilot.id
const STEPS = TOURS.intro.steps

async function expectStep(page: Page, index: number) {
  const card = page.getByTestId('tour-card')
  await expect(card.getByText(STEPS[index].title, { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(card.getByText(`${index + 1} of ${STEPS.length}`)).toBeVisible()
  await expect(page.getByTestId('tour-spotlight')).toBeVisible()
  await expect(page.getByTestId('tour-arrow')).toBeVisible()
  // The card sits on screen.
  const box = await card.boundingBox()
  const viewport = page.viewportSize()!
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
}

/** The Events feed is the visible tab (its filter chips are on screen). */
async function expectEventsTab(page: Page) {
  await expect(page.getByTestId('filter-all').locator('visible=true').first()).toBeVisible({ timeout: 10_000 })
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`intro tour at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('banner starts the tour; next, back, done; restart from Profile and skip; banner shows once', async ({ page }) => {
      await page.goto(`${BASE_URL}/`)
      const banner = page.getByTestId(`banner-${BANNER_ID}`).locator('visible=true')
      await expect(banner).toBeVisible({ timeout: 20_000 })
      await expect(banner).toContainText("We're piloting in Austin!")

      await page.getByTestId(`banner-${BANNER_ID}-action`).locator('visible=true').click()
      await expect(page.getByTestId('tour-overlay')).toBeVisible()
      await expect(banner).toHaveCount(0)

      for (let i = 0; i < STEPS.length; i++) {
        await expectStep(page, i)
        if (STEPS[i].tab === 'events') await expectEventsTab(page)
        if (STEPS[i].target === 'create-button') {
          // The spotlight surrounds the real + button (tab bar on mobile, FAB on desktop).
          const spot = (await page.getByTestId('tour-spotlight').boundingBox())!
          const plus = (await page.getByTestId('create-menu-button').locator('visible=true').boundingBox())!
          expect(plus.x).toBeGreaterThanOrEqual(spot.x)
          expect(plus.y).toBeGreaterThanOrEqual(spot.y)
          expect(plus.x + plus.width).toBeLessThanOrEqual(spot.x + spot.width + 1)
          expect(plus.y + plus.height).toBeLessThanOrEqual(spot.y + spot.height + 1)
        }
        if (i === STEPS.length - 1) break
        if (i === 1) {
          // Back once from step 2, then forward again.
          await page.getByTestId('tour-back').click()
          await expectStep(page, 0)
          await page.getByTestId('tour-next').click()
          await expectStep(page, 1)
        }
        await page.getByTestId('tour-next').click()
      }
      await expect(page.getByTestId('tour-next')).toHaveText('Done')
      await page.getByTestId('tour-next').click()
      await expect(page.getByTestId('tour-overlay')).toHaveCount(0)

      // The persistent entry (Profile tab) restarts it, switching back to Events for step 1.
      await page.goto(`${BASE_URL}/profile`)
      await page.getByTestId('take-tour').locator('visible=true').click()
      await expectStep(page, 0)
      await expectEventsTab(page)
      await page.getByTestId('tour-skip').click()
      await expect(page.getByTestId('tour-overlay')).toHaveCount(0)

      // Seen once: a reload doesn't bring the banner back.
      await page.goto(`${BASE_URL}/`)
      await expectEventsTab(page)
      await expect(page.getByTestId(`banner-${BANNER_ID}`)).toHaveCount(0)
    })

    test('keyboard: arrows move, Escape skips', async ({ page }) => {
      test.skip(viewport.width < 768, 'desktop keyboard only')
      await page.goto(`${BASE_URL}/`)
      await page.getByTestId(`banner-${BANNER_ID}-action`).locator('visible=true').click({ timeout: 20_000 })
      await expectStep(page, 0)
      await page.keyboard.press('ArrowRight')
      await expectStep(page, 1)
      await page.keyboard.press('ArrowLeft')
      await expectStep(page, 0)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('tour-overlay')).toHaveCount(0)
    })
  })
}
