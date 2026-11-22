/**
 * The outside session sheet (#348), as a guest: the card shows the venue's note and opens the
 * sheet (no popup), Escape closes it, and a `/?session=<id>` link opens it on top of the feed.
 * Supabase and Skelly are mocked (schelaggMock): nothing reaches a real venue.
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL, SUPABASE_URL } from './env'
import { AUSTIN_TZ, FAKE_SESSION_ID, FAKE_SESSION_TITLE, mockFeedWithOneOutsideSession, stubOutsideHosts } from './schelaggMock'

test.use({ timezoneId: AUSTIN_TZ, viewport: { width: 390, height: 844 } })

const NOTE = 'First come, first served; courts not guaranteed.'

async function open(page: Page, path = '/') {
  await stubOutsideHosts(page, BASE_URL, SUPABASE_URL)
  await mockFeedWithOneOutsideSession(page, { note: NOTE })
  await page.goto(`${BASE_URL}${path}`)
}

test('the card shows the note and opens the sheet; Escape closes it', async ({ page }) => {
  let popups = 0
  page.on('popup', () => { popups++ })
  await open(page)
  const card = page.getByTestId('external-session-card').filter({ hasText: FAKE_SESSION_TITLE }).first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card.getByTestId('external-session-note')).toHaveText(NOTE)

  await card.click()
  const sheet = page.getByTestId('outside-session-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('outside-session-note')).toContainText(NOTE)
  await expect(sheet.getByTestId('outside-session-signup')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]session=${FAKE_SESSION_ID}`))
  expect(popups).toBe(0)

  // The sheet slides in; Escape closes the top Modal once it is active.
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]session=/)
})

test('a ?session= link opens the sheet over the feed', async ({ page }) => {
  await open(page, `/?session=${FAKE_SESSION_ID}`)
  const sheet = page.getByTestId('outside-session-sheet')
  await expect(sheet).toBeVisible({ timeout: 20_000 })
  await expect(sheet).toContainText(FAKE_SESSION_TITLE)
})

test('a link to a session that is gone shows the feed and says so', async ({ page }) => {
  await stubOutsideHosts(page, BASE_URL, SUPABASE_URL)
  await mockFeedWithOneOutsideSession(page, { note: NOTE })
  // Registered last, so it answers first: the read by id finds nothing.
  await page.route('**/rest/v1/external_sessions?**id=eq.gone-session**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`${BASE_URL}/?session=gone-session`)
  await expect(page.getByText("That session isn't listed anymore")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('outside-session-sheet')).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]session=/)
})
