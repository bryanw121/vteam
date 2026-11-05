/**
 * Book a court, signed in (the `chromium` project: the stored e2e session from
 * auth.setup.ts). Guest flows live in book.guest.spec.ts.
 *
 * Court data is mocked (e2e/schelaggMock.ts); the host form is only opened and
 * read, never submitted, so this writes nothing.
 */
import { expect, test } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { AUSTIN_TZ, FIXTURE_FACILITIES, mockCourts } from './schelaggMock'

test.use({ timezoneId: AUSTIN_TZ })

test('"Already booked?" opens the host form prefilled with the venue and surface', async ({ page }) => {
  await mockCourts(page, 'live')
  await page.goto(`${BASE_URL}/book`)

  const target = FIXTURE_FACILITIES.find(f => f.surface === 'grass') ?? FIXTURE_FACILITIES[0]
  const card = page.getByTestId(`book-facility-${target.id}`)
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.getByTestId('book-facility-create-event').click()

  await expect(page).toHaveURL(/\/host\?/, { timeout: 20_000 })
  const url = new URL(page.url())
  expect(url.searchParams.get('location')).toBe(target.name)
  expect(url.searchParams.get('surface')).toBe(target.surface)

  await expect(page.getByTestId('location-picker-trigger').first()).toContainText(target.name, { timeout: 20_000 })
  // React Native Web doesn't put Chip's selected state on a role=button in the
  // DOM, so compare looks: the prefilled surface's chip is filled (active) and
  // differs from the others, which all share the inactive style.
  const background = (surface: string) =>
    page.getByTestId(`event-surface-${surface}`).first().evaluate(el => getComputedStyle(el).backgroundColor)
  const others = ['indoor', 'sand', 'grass'].filter(s => s !== target.surface)
  const inactive = await background(others[0])
  for (const other of others.slice(1)) {
    if (await page.getByTestId(`event-surface-${other}`).count()) expect(await background(other)).toBe(inactive)
  }
  await expect.poll(() => background(target.surface)).not.toBe(inactive)
})
