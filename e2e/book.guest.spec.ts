/**
 * Book a court + outside-session last-mile check, browsing as a guest (the
 * `guest` project: no stored session, so nothing here needs E2E_USERNAME).
 *
 * Schelagg is never reached: court data, the static fallback and /api/check
 * are answered by e2e/schelaggMock.ts, and so is the Events feed's outside
 * session (the Supabase REST read is fulfilled, nothing is written). Venue
 * sites a popup would open get a stub page.
 *
 * The browser runs in Austin time so dates on /book and the feed card line up
 * with what the mocks compute.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL, SUPABASE_URL } from './env'
import {
  AUSTIN_TZ,
  FAKE_SESSION_ID,
  FAKE_SESSION_TITLE,
  FAKE_SIGNUP_URL,
  FIXTURE_FACILITIES,
  addDays,
  austinToday,
  dayLong,
  mockCourts,
  mockFeedWithOneOutsideSession,
  mockSessionCheck,
  stubOutsideHosts,
} from './schelaggMock'

test.use({ timezoneId: AUSTIN_TZ })

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

/** The create button on screen: the tab bar's on phones, the FAB on wide web. */
function createButton(page: Page): Locator {
  return page.getByTestId('create-menu-button').filter({ visible: true }).first()
}

function menuOption(page: Page, group: 'venue' | 'vteam', label: string): Locator {
  const id = `create-menu-${group}-${label.toLowerCase().replace(/\s+/g, '-')}`
  return page.getByTestId(id).filter({ visible: true }).first()
}

async function openCreateMenu(page: Page) {
  await page.goto(`${BASE_URL}/`)
  await expect(page.getByTestId('header-sign-in').first()).toBeVisible({ timeout: 20_000 })
  await createButton(page).click()
  const menu = page.getByTestId('create-menu').filter({ visible: true }).first()
  await expect(menu).toBeVisible()
  return menu
}

const facility = (page: Page, id: string) => page.getByTestId(`book-facility-${id}`)

test.describe('create menu (guest)', () => {
  for (const [name, viewport] of [['mobile tab bar', MOBILE], ['desktop FAB', DESKTOP]] as const) {
    test(`${name}: both groups show, Book a court opens /book`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await mockCourts(page, 'live')
      const menu = await openCreateMenu(page)

      await expect(menu.getByText('Book at a venue', { exact: true })).toBeVisible()
      await expect(menu.getByText('Create on vteam', { exact: true })).toBeVisible()
      for (const label of ['Open Play', 'Tournament', 'From Template']) {
        await expect(menuOption(page, 'vteam', label)).toBeVisible()
      }

      await menuOption(page, 'venue', 'Book a court').click()
      await expect(page).toHaveURL(`${BASE_URL}/book`, { timeout: 20_000 })
      await expect(facility(page, FIXTURE_FACILITIES[0].id)).toBeVisible({ timeout: 20_000 })
    })
  }

  test('Open Play sends a guest to login', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await openCreateMenu(page)
    await menuOption(page, 'vteam', 'Open Play').click()
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
  })
})

test.describe('/book (guest)', () => {
  test('venues, day strip, surface chips, booking popup, freshness', async ({ page }) => {
    const outside = await stubOutsideHosts(page, BASE_URL, SUPABASE_URL)
    const hits = await mockCourts(page, 'live')
    await page.goto(`${BASE_URL}/book`)

    for (const f of FIXTURE_FACILITIES) {
      await expect(facility(page, f.id)).toBeVisible({ timeout: 20_000 })
    }
    expect(hits.live).toBeGreaterThan(0)
    expect(hits.static).toBe(0)
    await expect(page.getByTestId('book-freshness')).toContainText('Court calendars updated')

    // Day strip: today first, then switching days changes the heading.
    const today = austinToday()
    const tomorrow = addDays(today, 1)
    await expect(page.getByText(`Today · ${dayLong(today)}`, { exact: true })).toBeVisible()
    await page.getByTestId(`book-day-${tomorrow}`).click()
    await expect(page.getByText(dayLong(tomorrow), { exact: true })).toBeVisible()
    await expect(page.getByText(`Today · ${dayLong(today)}`, { exact: true })).toHaveCount(0)

    // Surface chips: Grass leaves only the grass facility; All brings the rest back.
    const grass = FIXTURE_FACILITIES.filter(f => f.surface === 'grass')
    const notGrass = FIXTURE_FACILITIES.filter(f => f.surface !== 'grass')
    expect(grass.length).toBeGreaterThan(0)
    await page.getByTestId('book-surface-grass').click()
    for (const f of grass) await expect(facility(page, f.id)).toBeVisible()
    for (const f of notGrass) await expect(facility(page, f.id)).toHaveCount(0)
    await page.getByTestId('book-surface-any').click()
    for (const f of notGrass) await expect(facility(page, f.id)).toBeVisible()

    // "Book at …" opens the venue's calendar on the day being viewed (tomorrow, picked
    // above) in a new page (stubbed, never reached).
    const target = FIXTURE_FACILITIES[0]
    const card = facility(page, target.id)
    const onDay = `${target.calendar}?viewdate=${tomorrow}`
    await expect(card.getByText(`Book at ${target.name}`, { exact: true })).toBeVisible()
    await expect(card.getByTestId('book-facility-note')).toContainText('You may need to request access on Skedda before you can book.')
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      card.getByTestId('book-facility-book').click(),
    ])
    await expect.poll(() => popup.url()).toBe(onDay)
    expect(outside).toContain(onDay)

    // Back on today, the same button opens today's page.
    await page.getByTestId(`book-day-${today}`).click()
    const [popupToday] = await Promise.all([
      page.waitForEvent('popup'),
      card.getByTestId('book-facility-book').click(),
    ])
    await expect.poll(() => popupToday.url()).toBe(`${target.calendar}?viewdate=${today}`)
  })

  test('"Already booked?" sends a guest to login', async ({ page }) => {
    await mockCourts(page, 'live')
    await page.goto(`${BASE_URL}/book`)
    const card = facility(page, FIXTURE_FACILITIES[0].id)
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.getByTestId('book-facility-create-event').click()
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
  })

  test('live API down: falls back to the static courts.json', async ({ page }) => {
    const hits = await mockCourts(page, 'static-only')
    await page.goto(`${BASE_URL}/book`)
    for (const f of FIXTURE_FACILITIES) {
      await expect(facility(page, f.id)).toBeVisible({ timeout: 20_000 })
    }
    expect(hits.live).toBeGreaterThan(0)
    expect(hits.static).toBeGreaterThan(0)
    await expect(page.getByTestId('book-freshness')).toContainText('Court calendars updated')
  })

  test('both sources down: error state, and Retry recovers', async ({ page }) => {
    await mockCourts(page, 'both-fail')
    await page.goto(`${BASE_URL}/book`)
    const error = page.getByTestId('screen-state-error')
    await expect(error).toBeVisible({ timeout: 20_000 })
    await expect(error).toContainText('Could not load court calendars')
    await expect(facility(page, FIXTURE_FACILITIES[0].id)).toHaveCount(0)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockCourts(page, 'live')
    await error.getByText('Retry', { exact: true }).click()
    await expect(facility(page, FIXTURE_FACILITIES[0].id)).toBeVisible({ timeout: 20_000 })
    await expect(error).toHaveCount(0)
  })
})

test.describe('outside session last-mile check (guest)', () => {
  /** The feed with exactly one outside session; returns its card. */
  async function feedCard(page: Page): Promise<Locator> {
    await stubOutsideHosts(page, BASE_URL, SUPABASE_URL)
    await mockFeedWithOneOutsideSession(page)
    await page.goto(`${BASE_URL}/`)
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
    const card = page.getByTestId('external-session-card').filter({ hasText: FAKE_SESSION_TITLE }).first()
    await expect(card).toBeVisible({ timeout: 20_000 })
    return card
  }

  /** ConfirmDialog buttons arm after a short ghost-click guard. */
  async function confirmDialog(page: Page): Promise<Locator> {
    const dialog = page.getByTestId('confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)
    return dialog
  }

  test('scheduled: opens the sign-up link', async ({ page }) => {
    const asked = await mockSessionCheck(page, { kind: 'json', body: { id: FAKE_SESSION_ID, status: 'scheduled' } })
    const card = await feedCard(page)
    const [popup] = await Promise.all([page.waitForEvent('popup'), card.click()])
    await expect.poll(() => popup.url()).toBe(FAKE_SIGNUP_URL)
    expect(asked).toEqual([FAKE_SESSION_ID])
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  })

  test('canceled: asks first, no popup, card marked cancelled', async ({ page }) => {
    await mockSessionCheck(page, { kind: 'json', body: { id: FAKE_SESSION_ID, status: 'canceled' } })
    const card = await feedCard(page)
    let popups = 0
    page.on('popup', () => { popups++ })

    await card.click()
    const dialog = await confirmDialog(page)
    await expect(dialog).toContainText('Cancelled at the venue')
    await dialog.getByTestId('confirm-dialog-cancel').click()
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)

    const finding = card.getByTestId('external-session-finding')
    await expect(finding).toHaveText('Cancelled at the venue')
    // Red: theme.colors.error (#FF5555), not the amber used for a changed time.
    await expect(finding).toHaveCSS('color', 'rgb(255, 85, 85)')
    expect(popups).toBe(0)
  })

  test('changed: dialog shows the new time, Continue opens the sign-up link', async ({ page }) => {
    const date = austinToday()
    // The real /api/check shape for a moved session: no occurrence, local times on `session`.
    await mockSessionCheck(page, {
      kind: 'json',
      body: {
        id: FAKE_SESSION_ID,
        status: 'changed',
        changes: ['start', 'end'],
        occurrence: null,
        session: { date, start: '20:30', end: '22:00' },
        checkedAt: new Date().toISOString(),
      },
    })
    const card = await feedCard(page)
    await card.click()
    const dialog = await confirmDialog(page)
    const newTime = `${dayLong(date)} · 8:30–10pm`
    await expect(dialog).toContainText('The time changed')
    await expect(dialog).toContainText(`Now ${newTime}.`)
    await expect(dialog).toContainText('Changed: start, end.')

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      dialog.getByTestId('confirm-dialog-confirm').click(),
    ])
    // No new link in the result, so it continues to the card's own sign-up URL.
    await expect.poll(() => popup.url()).toBe(FAKE_SIGNUP_URL)
    await expect(card.getByTestId('external-session-finding')).toHaveText(`New time: ${newTime}`)
  })

  test('check slower than 1.5s: opens the link anyway', async ({ page }) => {
    await mockSessionCheck(page, {
      kind: 'json',
      body: { id: FAKE_SESSION_ID, status: 'canceled' },
      delayMs: 4_000,
    })
    const card = await feedCard(page)
    const started = Date.now()
    const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 3_500 }), card.click()])
    await expect.poll(() => popup.url()).toBe(FAKE_SIGNUP_URL)
    expect(Date.now() - started).toBeLessThan(3_500)
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  })
})
