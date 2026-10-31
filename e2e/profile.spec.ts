import { test, expect } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

test.describe('Own profile', () => {
  test('Cheers count matches its detail screen and survives a refresh', async ({ page }) => {
    await page.goto(`${BASE_URL}/profile`)

    const profileCount = page.getByTestId('profile-cheers-count')
    await expect(profileCount).toBeVisible({ timeout: 20_000 })
    await expect(profileCount).toHaveText(/^\d+$/)
    const expectedCount = await profileCount.textContent()

    await page.reload()
    await expect(profileCount).toHaveText(expectedCount!, { timeout: 20_000 })

    await page.goto(`${BASE_URL}/settings/cheers`)
    const detailCount = page.getByTestId('cheers-received-count')
    await expect(detailCount).toBeVisible({ timeout: 20_000 })
    await expect(detailCount).toHaveText(expectedCount!)
  })
})

test.describe('Points', () => {
  // Awards come from the server-side pass (award_event_points, pg_cron) after
  // an event ends; it is verified with SQL on beta. Here: the total renders.
  test('Own profile shows the accumulated points total', async ({ page }) => {
    await page.goto(`${BASE_URL}/profile`)
    const points = page.getByTestId('profile-points-count')
    await expect(points).toBeVisible({ timeout: 20_000 })
    await expect(points).toHaveText(/^\d+$/)
  })
})

test.describe('Go ad-free', () => {
  test('Shows the balance and the offer; a short balance explains what is missing', async ({ page }) => {
    await page.goto(`${BASE_URL}/profile`)
    await page.getByTestId('profile-menu-ad-free').click()
    const balance = page.getByTestId('ad-free-balance')
    await expect(balance).toHaveText(/^\d+$/, { timeout: 20_000 })
    const redeem = page.getByTestId('ad-free-redeem')
    await expect(redeem).toContainText(/100 points/)
    // Never redeem here (it would spend the shared e2e account's points).
    if (Number(await balance.textContent()) < 100) {
      await expect(page.getByTestId('ad-free-short')).toHaveText(/You need \d+ more points?\./)
      await expect(redeem).toHaveAttribute('aria-disabled', 'true')
    }
  })
})
