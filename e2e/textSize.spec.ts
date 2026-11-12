/**
 * Text size setting (#43): Settings → Display changes text app-wide, persists
 * on the device, and Extra large doesn't push any screen sideways on a small
 * phone. Read-only: the setting lives in this browser context's localStorage.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

test.use({ viewport: { width: 320, height: 720 } })

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const fontPx = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate(el => {
    // The preview's body line: the first text node's own font size.
    const text = Array.from(el.querySelectorAll('div')).find(d => d.childElementCount === 0 && /Two courts/.test(d.textContent ?? ''))
    return text ? parseFloat(getComputedStyle(text).fontSize) : NaN
  })

test('Extra large scales text, persists, and fits a 320px screen', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings/display`)
  await expect(page.getByTestId('text-size-preview')).toBeVisible({ timeout: 20_000 })
  const before = await fontPx(page, 'text-size-preview')
  expect(before).toBeGreaterThan(0)

  await page.getByTestId('text-size-xlarge').click()
  await expect(page.getByTestId('text-size-xlarge')).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => fontPx(page, 'text-size-preview')).toBeCloseTo(before * 1.3, 0)

  // Survives a reload (stored on the device).
  await page.reload()
  await expect(page.getByTestId('text-size-xlarge')).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 })

  for (const path of ['/', '/clubs', '/chat', '/profile']) {
    await page.goto(`${BASE_URL}${path}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(500)
    expect(await overflowX(page), `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
  }

  // Back to Default.
  await page.goto(`${BASE_URL}/settings/display`)
  await page.getByTestId('text-size-default').click({ timeout: 20_000 })
  await expect.poll(() => fontPx(page, 'text-size-preview')).toBeCloseTo(before, 0)
})
