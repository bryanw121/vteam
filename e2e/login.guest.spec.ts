import { expect, test } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// Username sign-in goes through the login-with-username edge function, which
// must not reveal whether a username exists (#99). Runs signed out.
test.describe('username sign-in (guest)', () => {
  test('an unknown username gets the generic error, and no email is ever returned', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async res => {
      if (res.url().includes('/functions/v1/login-with-username')) bodies.push(await res.text().catch(() => ''))
    })
    await page.goto(`${BASE_URL}/login`)
    await page.getByPlaceholder('you@example.com or yourname').fill(`nobody-${Date.now()}`)
    await page.getByPlaceholder('••••••••').fill('not-a-real-password')
    await page.getByText('Sign in', { exact: true }).click()
    await expect(page.getByText('Incorrect username or password')).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/login/)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) expect(body).not.toMatch(/@/)
  })
})
