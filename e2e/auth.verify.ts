import { expect, test } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

test('restores the shared e2e session in a fresh browser context', async ({ page }) => {
  await page.goto(`${BASE_URL}/`)
  await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20_000 })
  await expect(page.getByText('Events', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
  // Guests can see Events too, so prove the session actually restored: only a
  // signed-in viewer gets the notifications bell (the Mine chip needs own events).
  await expect(page.getByRole('button', { name: 'Notifications' }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('header-sign-in')).toHaveCount(0)
})
