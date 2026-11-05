import { expect, test } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// #98: Terms and Privacy are public, and sign-up links to them without losing the form.
test.describe('terms and privacy (guest)', () => {
  test('register shows the agreement line; its links open the policies and come back with the form intact', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`)
    await expect(page.getByTestId('agreement-line')).toBeVisible({ timeout: 20_000 })
    await page.getByPlaceholder('Jane').fill('Kept')

    await page.getByTestId('agreement-terms').click()
    await expect(page).toHaveURL(/\/terms$/, { timeout: 20_000 })
    await expect(page.getByText('Eligibility and accounts')).toBeVisible()
    await page.getByTestId('screen-header-back').click()
    await expect(page).toHaveURL(/\/register$/, { timeout: 20_000 })
    await expect(page.getByPlaceholder('Jane')).toHaveValue('Kept')

    await page.getByTestId('agreement-privacy').click()
    await expect(page).toHaveURL(/\/privacy$/, { timeout: 20_000 })
    await expect(page.getByText('Information we collect')).toBeVisible()
  })

  test('login shows the agreement line', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await expect(page.getByTestId('agreement-line')).toBeVisible({ timeout: 20_000 })
  })

  for (const [path, heading] of [['/terms', 'Acceptable use'], ['/privacy', 'Your choices and rights']] as const) {
    test(`${path} opens directly, signed out`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`)
      await expect(page.getByText(heading)).toBeVisible({ timeout: 20_000 })
      await expect(page).toHaveURL(new RegExp(`${path}$`))
    })
  }
})
