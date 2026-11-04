/**
 * Events E2E — requires a web build served on port 8081 (CI) or the Expo dev
 * server (`npx expo start --web --port 8081`) running locally.
 * Run: npx playwright test e2e/events.spec.ts
 *
 * Test account: E2E_USERNAME / E2E_PASSWORD (see .env.example)
 *
 * Fixtures: beforeAll creates two relative-dated events hosted by the e2e account
 * (`[e2e <run>] Open Play`, `[e2e <run>] Tournament`) and afterAll deletes them. No
 * permanent shared seed events are required in the live DB.
 */

import { test, expect, Page } from '@playwright/test'
import {
  OPEN_PLAY_EVENT,
  TITLE_PREFIX,
  TOURNAMENT_EVENT,
  seedEventFixtures,
  cleanupEventFixtures,
  readEventLocation,
} from './eventsFixtures'
import {
  MOCK_PLACE_ID,
  MOCK_VENUE_NAME,
  MOCK_VENUE_REGION,
  MOCK_VENUE_COORDS,
  MOCK_ADDRESS_PLACE_ID,
  MOCK_ADDRESS_MAIN,
  MOCK_ADDRESS_SAVED,
  MOCK_ADDRESS_COORDS,
  mockPlacesProxy,
  unmockPlacesProxy,
  clearPlacesCache,
} from './placesMock'
import { E2E_BASE_URL as BASE_URL } from './env'


test.describe.configure({ mode: 'serial' })

test.describe('Events', () => {
  test.beforeAll(async () => {
    await seedEventFixtures()
  })

  test.afterAll(async () => {
    await cleanupEventFixtures()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`)
    })
    page.on('pageerror', err => console.error(`[page error] ${err.message}`))
    console.log(`→ starting: ${testInfo.title}`)
    // auth.setup.ts signs in once per Playwright run and each test receives
    // that stored session. Going directly to / proves the session restored.
    await page.goto(`${BASE_URL}/`)
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
  })

  test('feed lists upcoming events with filter chips', async ({ page }) => {
    await expect(page.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('filter-all').first()).toBeVisible()
    await expect(page.getByTestId('filter-tournament').first()).toBeVisible()
  })

  // Players should never misread what time they're signing up for: the start
  // time is its own high-contrast pill on the feed card and the event page. Not
  // anchored: the clock icon renders as a private-use glyph in the same text.
  test('the start time is its own pill on the feed card and the event page', async ({ page }) => {
    const cardTime = page.getByTestId('events-feed').getByTestId('event-card-time').first()
    await expect(cardTime).toBeVisible({ timeout: 20000 })
    await expect(cardTime).toHaveText(/\d{1,2}:\d{2}\s(AM|PM)/)

    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })
    const heroTime = page.getByTestId('event-hero-time')
    await expect(heroTime).toBeVisible({ timeout: 20000 })
    await expect(heroTime).toHaveText(/\d{1,2}:\d{2}\s(AM|PM)/)
  })

  // Filter chips are clicked by testID, never by visible text: an event card's
  // type tag renders the exact same strings ("Tournament", "Open Play"), so a
  // text locator's .first() can resolve to the tag instead of the chip — and
  // with { force: true } that misdirected click fails silently, leaving the
  // filter unapplied.
  test('filtering by tag narrows the feed', async ({ page }) => {
    // Scoped to the feed: the "You're going" rail deliberately ignores the
    // active filter (it's a shortcut to your commitments, not a view of the
    // filter), so a page-wide count would always find the hosted fixtures.
    const feed = page.getByTestId('events-feed')
    await expect(feed.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 20000 })

    // Tournament filter: tournament event shown, open-play event gone.
    await page.getByTestId('filter-tournament').first().dispatchEvent('click')
    await expect(feed.getByText(TOURNAMENT_EVENT).first()).toBeVisible()
    await expect(feed.getByText(OPEN_PLAY_EVENT)).toHaveCount(0)

    // Open Play filter: open-play event back, tournament event gone.
    await page.getByTestId('filter-open_play').first().dispatchEvent('click')
    await expect(feed.getByText(OPEN_PLAY_EVENT).first()).toBeVisible()
    await expect(feed.getByText(TOURNAMENT_EVENT)).toHaveCount(0)

    // All: both visible again.
    await page.getByTestId('filter-all').first().dispatchEvent('click')
    await expect(feed.getByText(TOURNAMENT_EVENT).first()).toBeVisible()
    await expect(feed.getByText(OPEN_PLAY_EVENT).first()).toBeVisible()
  })

  // Safety net for the event-detail refactor (splitting the four tab bodies into
  // sibling components): drives every tab and asserts each renders its landmark,
  // so an extraction that breaks a tab's JSX or prop wiring fails CI.
  test('event detail — all four tabs render and switch', async ({ page }) => {
    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })

    // Details is the default tab (quick-stats strip).
    await expect(page.getByText('Duration').first()).toBeVisible({ timeout: 20000 })

    // People tab — "Going" roster heading.
    await page.getByTestId('event-tab-people').first().click()
    await expect(page.getByText('Going', { exact: true }).first()).toBeVisible({ timeout: 15000 })

    // Discussion tab — the comment composer.
    await page.getByTestId('event-tab-discussion').first().click()
    await expect(page.getByPlaceholder('Add a comment…').first()).toBeVisible({ timeout: 15000 })

    // Cheers tab — fixtures are upcoming, so the not-yet-available gate shows.
    await page.getByTestId('event-tab-cheers').first().click()
    await expect(page.getByText(/Cheers open after the event ends/).first()).toBeVisible({ timeout: 15000 })

    // Back to Details.
    await page.getByTestId('event-tab-details').first().click()
    await expect(page.getByText('Duration').first()).toBeVisible({ timeout: 15000 })
  })

  test('open an event, then join and leave it through the leave sheet', async ({ page }) => {
    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })

    const joinBtn = page.getByText('Join event', { exact: true })
    // By its label, not just the testID: while the join is still saving the button
    // shows a spinner (and ignores taps), and the label only appears once it is done.
    const leaveBtn = page.getByTestId('leave-event').getByText('Leave event', { exact: true })
    const sheetLeave = page.getByTestId('leave-confirm')
    const stayIn = page.getByTestId('leave-cancel')

    // State-tolerant: a prior run may have left the account attending.
    if (await leaveBtn.isVisible().catch(() => false)) {
      await leaveBtn.click()
      await sheetLeave.click()
      await expect(joinBtn).toBeVisible({ timeout: 15000 })
    }

    // Join → button flips to Leave, Details tab shows "You're going".
    await joinBtn.click()
    await expect(leaveBtn).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("You're going", { exact: true }).first()).toBeVisible()

    // Leave opens the sheet (#171); Stay in keeps the spot.
    await leaveBtn.click()
    await expect(page.getByText('Leave this game?', { exact: true })).toBeVisible()
    // Open spots and points, never the host notice (this account hosts the fixture).
    await expect(page.getByTestId('leave-line-points')).toBeVisible()
    await expect(page.getByTestId('leave-line-hostNotified')).toHaveCount(0)
    await expect(stayIn).toBeFocused()
    await stayIn.click()
    await expect(page.getByText('Leave this game?', { exact: true })).toHaveCount(0)
    await expect(leaveBtn).toBeVisible()

    // Esc is Stay in too.
    await leaveBtn.click()
    await expect(sheetLeave).toBeVisible()
    await expect(stayIn).toBeFocused() // focus moves into the dialog first; Esc acts on the focused dialog
    await page.keyboard.press('Escape')
    await expect(sheetLeave).toHaveCount(0)
    await expect(leaveBtn).toBeVisible()

    // Leave game → back to Join (cleans up shared-account state).
    await leaveBtn.click()
    await sheetLeave.click()
    await expect(joinBtn).toBeVisible({ timeout: 15000 })
  })

  test('host adds a +1 guest, sees it on the roster, then removes it', async ({ page }) => {
    // the e2e account hosts the fixtures, so host-only UI (+1 button, guest remove X)
    // renders for the e2e account. Removal doubles as cleanup so the shared DB
    // doesn't accumulate guests across runs.
    const guestFirst = 'E2eguest'
    const guestLast = `X${Date.now()}`

    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })

    // Open the +1 modal from the sticky footer (Details tab is active by default).
    await page.getByLabel('Add a +1 guest').first().click()
    await expect(page.getByText('Add a +1')).toBeVisible({ timeout: 10000 })
    await page.getByPlaceholder('First name').fill(guestFirst)
    await page.getByPlaceholder('Last name').fill(guestLast)
    await page.getByText('Add', { exact: true }).click()

    // Guest card renders on the People tab as "First L." with an "…'s +1" note.
    await page.getByTestId('event-tab-people').first().click()
    const guestCardName = `${guestFirst} ${guestLast.charAt(0)}.`
    await expect(page.getByText(guestCardName).first()).toBeVisible({ timeout: 15000 })

    // Remove the guest (X → "Remove guest?" confirm modal) — cleans up.
    await page.getByLabel(`Remove guest ${guestFirst} ${guestLast}`).first().click()
    await expect(page.getByText('Remove guest?')).toBeVisible({ timeout: 10000 })
    // Modal buttons arm after a short ghost-click guard delay.
    await page.waitForTimeout(500)
    await page.getByText('Remove', { exact: true }).click()
    await expect(page.getByText(guestCardName)).toHaveCount(0, { timeout: 15000 })
  })

  // #41: the "You're going" rail. the e2e account hosts both fixtures, so the account
  // always has at least two upcoming commitments and the rail is guaranteed
  // non-empty. Deliberately NOT asserting that a specific fixture appears in the
  // rail: it's capped at 3 and sorted soonest-first, and the fixtures are seeded
  // +2/+3 days out, so any real event this account hosts sooner would push them
  // out — a true behaviour, not a regression.
  test("the You're going rail shows this account's commitments and opens one", async ({ page }) => {
    const rail = page.getByTestId('my-events-rail')
    await expect(rail).toBeVisible({ timeout: 20000 })

    // Hosted events count as commitments and are tagged HOSTING.
    await expect(rail.getByText('HOSTING').first()).toBeVisible()

    // The header counts every commitment, not just the (capped) visible cards.
    const headerCount = await rail.getByText(/^YOU'RE GOING · \d+$/).first().textContent()
    expect(Number(headerCount!.split('·')[1].trim())).toBeGreaterThanOrEqual(2)

    // Tapping a card opens that event.
    await rail.getByTestId(/^my-event-card-/).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })
  })

  test('the Mine chip carries a count and filters without losing the hosted fixtures', async ({ page }) => {
    await expect(page.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 20000 })

    // The chip shows how many commitments there are — at least the two fixtures.
    const mineChip = page.getByTestId('filter-mine').first()
    await expect(mineChip).toHaveText(/^Mine \d+$/)

    // Both fixtures are hosted by this account, so Mine keeps them in the feed
    // itself — asserting against the rail would be vacuous, since the rail
    // shows commitments regardless of filter.
    const feed = page.getByTestId('events-feed')
    await mineChip.click()
    await expect(feed.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 15000 })
    await expect(feed.getByText(TOURNAMENT_EVENT).first()).toBeVisible()

    // All restores the unfiltered feed.
    await page.getByTestId('filter-all').first().click()
    await expect(feed.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 15000 })
  })

  // #44: exercise the controlled input, Supabase write/read, and formatted
  // detail output together. The fixture is restored to free before the test
  // finishes, and afterAll still deletes it if an assertion interrupts us.
  test('a decimal event price survives editing and renders with two places', async ({ page }) => {
    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })
    const eventUrl = page.url()

    async function savePrice(price: string) {
      await page.getByTestId('event-edit-button').first().click()
      await page.waitForURL(/\/host\?edit=/, { timeout: 20000 })
      const priceInput = page.getByTestId('event-price-input')
      await expect(priceInput).toBeVisible({ timeout: 20000 })
      await priceInput.fill(price)
      await expect(priceInput).toHaveValue(price)
      await page.getByText('Save changes', { exact: true }).click()
      await expect(page.getByText('Event updated!')).toBeVisible({ timeout: 20000 })
      await page.getByText('Done', { exact: true }).click()
      await page.waitForURL(eventUrl, { timeout: 20000 })
    }

    await savePrice('5.50')
    await expect(page.getByTestId('event-price-stat')).toHaveText('$5.50', { timeout: 20000 })

    // Restore shared state for subsequent tests and local reruns.
    await savePrice('')
    await expect(page.getByTestId('event-price-stat')).toHaveText('Free', { timeout: 20000 })
  })

  // Regression guard for #34: editing an event and going back showed the OLD
  // title. The detail screen's focus refetch was gated purely on a 30s staleness
  // window, and this whole round-trip finishes in a couple of seconds — so the
  // window masked the change. Deliberately no reload and no pull-to-refresh
  // anywhere in this test; that's the entire point.
  test('editing an event shows the new title on the detail page without a refresh', async ({ page }) => {
    const editedTitle = `${TITLE_PREFIX} Edited ${Date.now()}`

    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })
    // Assert on the detail page's own hero title, not a bare getByText: the feed
    // stays mounted behind the pushed screen, so `getByText(title).first()`
    // resolves to the hidden feed card and never becomes visible.
    const heroTitle = page.getByTestId('event-hero-title')
    await expect(heroTitle).toHaveText(OPEN_PLAY_EVENT, { timeout: 20000 })
    const eventUrl = page.url()

    async function renameTo(next: string) {
      await page.getByTestId('event-edit-button').first().click()
      await page.waitForURL(/\/host\?edit=/, { timeout: 20000 })
      const titleField = page.getByPlaceholder('Friday Night Round Robin')
      await expect(titleField).toBeVisible({ timeout: 20000 })
      await titleField.fill(next)
      await page.getByText('Save changes', { exact: true }).click()
      // Success modal → Done runs router.back(), restoring the detail screen
      // with its pre-edit React state intact. That restore is what used to be stale.
      await expect(page.getByText('Event updated!')).toBeVisible({ timeout: 20000 })
      await page.getByText('Done', { exact: true }).click()
      await page.waitForURL(eventUrl, { timeout: 20000 })
    }

    await renameTo(editedTitle)
    await expect(heroTitle).toHaveText(editedTitle, { timeout: 20000 })

    // Restore the fixture title — this spec runs serially against a shared DB.
    // (afterAll cleanup matches the `[e2e]` prefix, so it would collect the
    // renamed row either way; this keeps reruns starting from a clean name.)
    await renameTo(OPEN_PLAY_EVENT)
    await expect(heroTitle).toHaveText(OPEN_PLAY_EVENT, { timeout: 20000 })
  })

  // Regression guard for #45: saving an edit used to delete every `event_tags`
  // row and re-insert the set. A failure between the two left the event with
  // ZERO tags, which drops it out of every feed filter except "All" — a
  // failure a host would never trace back to the title edit they just made.
  // The save now diffs, so a title-only edit writes no tag rows at all.
  test('editing an event\'s title keeps its tags, so it stays under its filter chip', async ({ page }) => {
    const feed = page.getByTestId('events-feed')
    const editedTitle = `${OPEN_PLAY_EVENT} ${Date.now()}`

    // Precondition: the fixture is tagged Open Play and shows under that chip.
    await page.getByTestId('filter-open_play').first().click()
    await expect(feed.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('filter-all').first().click()

    await feed.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20_000 })
    const heroTitle = page.getByTestId('event-hero-title')
    await expect(heroTitle).toHaveText(OPEN_PLAY_EVENT, { timeout: 20_000 })
    const eventUrl = page.url()

    async function renameTo(next: string) {
      await page.getByTestId('event-edit-button').first().click()
      await page.waitForURL(/\/host\?edit=/, { timeout: 20_000 })
      const titleField = page.getByPlaceholder('Friday Night Round Robin')
      await expect(titleField).toBeVisible({ timeout: 20_000 })
      await titleField.fill(next)
      // Deliberately touch nothing but the title — the whole point is that a
      // non-tag edit must not rewrite the tag rows.
      await page.getByText('Save changes', { exact: true }).click()
      await expect(page.getByText('Event updated!')).toBeVisible({ timeout: 20_000 })
      await page.getByText('Done', { exact: true }).click()
      await page.waitForURL(eventUrl, { timeout: 20_000 })
    }

    await renameTo(editedTitle)
    await expect(heroTitle).toHaveText(editedTitle, { timeout: 20_000 })

    // Back to the feed: the renamed event must still carry its Open Play tag.
    await page.goto(`${BASE_URL}/`)
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('filter-open_play').first().click()
    await expect(feed.getByText(editedTitle).first()).toBeVisible({ timeout: 20_000 })

    // Restore the fixture name for reruns.
    await page.getByTestId('filter-all').first().click()
    await feed.getByText(editedTitle).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20_000 })
    await renameTo(OPEN_PLAY_EVENT)
    await expect(heroTitle).toHaveText(OPEN_PLAY_EVENT, { timeout: 20_000 })
  })

  test('a tag write failure keeps the host on the edit form with the approved recovery message', async ({ page }) => {
    const feed = page.getByTestId('events-feed')
    await feed.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20_000 })
    await page.getByTestId('event-edit-button').first().click()
    await page.waitForURL(/\/host\?edit=/, { timeout: 20_000 })

    const titleField = page.getByPlaceholder('Friday Night Round Robin')
    await expect(titleField).toBeVisible({ timeout: 20_000 })

    // Isolate the failure to the tag insert. The event row is allowed to save,
    // matching the partial-success state this modal exists to explain.
    await page.route('**/rest/v1/event_tags*', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'forced tag write failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByText('BB', { exact: true }).click()
    await page.getByText('Save changes', { exact: true }).click()

    await expect(page.getByText('Event saved — tags not updated', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Your event details were saved, but its tags were left unchanged.', { exact: true })).toBeVisible()
    await expect(page.getByText('Close', { exact: true })).toBeVisible()

    await page.getByText('Close', { exact: true }).click()
    await expect(page).toHaveURL(/\/host\?edit=/)
    await expect(titleField).toBeVisible()
    await expect(page.getByText('Event saved — tags not updated', { exact: true })).toHaveCount(0)
    await page.unroute('**/rest/v1/event_tags*')
  })

  // The venue picker is the app's only Google Places consumer, and every
  // keystroke past three characters is billable quota — so this drives it
  // against a mocked places-proxy instead of the live edge function. Nothing
  // else in the suite opens the picker, so without this the whole
  // search → select → persist path ships untested.
  //
  // Deliberately no restore step: this test runs last in the serial file and
  // afterAll deletes the `[e2e]` fixtures outright, so leaving the mock venue
  // on the row affects nothing. (The picker has no free-text entry either —
  // restoring would mean clicking a "Recent" row that is only present if the
  // account's five most recent venues still include E2E Gym.)
  test('the venue picker writes a searched Google place onto the event', async ({ page }) => {
    const feed = page.getByTestId('events-feed')
    await feed.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20_000 })
    const eventUrl = page.url()

    // Precondition: the fixture's seeded venue, with no coordinates.
    await expect(page.getByTestId('event-location-name')).toHaveText('E2E Gym', { timeout: 20_000 })

    await page.getByTestId('event-edit-button').first().click()
    await page.waitForURL(/\/host\?edit=/, { timeout: 20_000 })

    const proxyCalls = await mockPlacesProxy(page)
    await clearPlacesCache(page)

    const trigger = page.getByTestId('location-picker-trigger')
    await expect(trigger).toContainText('E2E Gym', { timeout: 20_000 })
    await trigger.click()

    // Under MIN_LEN the component short-circuits before the network, so this
    // first fill proves the debounce gate, not the mock.
    const search = page.getByTestId('location-picker-input')
    await expect(search).toBeVisible({ timeout: 15_000 })
    await search.fill('Mo')
    await page.waitForTimeout(1_000) // past the picker's 600ms debounce, so this isn't vacuous
    await expect(page.getByTestId(`location-result-google-${MOCK_PLACE_ID}`)).toHaveCount(0)
    expect(proxyCalls).toHaveLength(0)

    // Past the gate: the mocked prediction renders with Google's structured
    // main/secondary text split.
    await search.fill('Mock Volleyball')
    const prediction = page.getByTestId(`location-result-google-${MOCK_PLACE_ID}`)
    await expect(prediction).toBeVisible({ timeout: 15_000 })
    await expect(prediction).toContainText(MOCK_VENUE_NAME)
    await expect(prediction).toContainText(MOCK_VENUE_REGION)

    // Selecting closes the sheet and fires the details lookup for coordinates.
    await prediction.click()
    await expect(search).toHaveCount(0, { timeout: 15_000 })
    await expect(trigger).toContainText(MOCK_VENUE_NAME, { timeout: 15_000 })

    await page.getByText('Save changes', { exact: true }).click()
    await expect(page.getByText('Event updated!')).toBeVisible({ timeout: 20_000 })
    await page.getByText('Done', { exact: true }).click()
    await page.waitForURL(eventUrl, { timeout: 20_000 })

    await expect(page.getByTestId('event-location-name')).toHaveText(MOCK_VENUE_NAME, { timeout: 20_000 })

    // The UI never renders coordinates, so read the row back: this is what
    // proves the `details` response reached the database and not just the form.
    const stored = await readEventLocation(OPEN_PLAY_EVENT)
    expect(stored.location).toBe(MOCK_VENUE_NAME)
    expect(stored.latitude).toBeCloseTo(MOCK_VENUE_COORDS.lat, 4)
    expect(stored.longitude).toBeCloseTo(MOCK_VENUE_COORDS.lng, 4)

    // Exactly one autocomplete and one details call, sharing a session token —
    // that pairing is what keeps Places billing to a single session per open.
    expect(proxyCalls.map(c => c.action)).toEqual(['autocomplete', 'details'])
    expect(proxyCalls[0].input).toBe('Mock Volleyball')
    expect(proxyCalls[1].place_id).toBe(MOCK_PLACE_ID)
    expect(proxyCalls[1].sessiontoken).toBe(proxyCalls[0].sessiontoken)

    await unmockPlacesProxy(page)
  })

  // The proxy used to send `types=establishment`, which made street addresses
  // impossible to return — "1100 Congress Ave" found nothing while "Gregory Gym"
  // worked. This drives the address path end to end: that an address prediction
  // is offered at all, and that it is saved with its city attached rather than
  // as a bare, ambiguous street line.
  test('a street-address result is offered and saved with its city', async ({ page }) => {
    const feed = page.getByTestId('events-feed')
    await feed.getByText(TOURNAMENT_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20_000 })
    const eventUrl = page.url()

    await page.getByTestId('event-edit-button').first().click()
    await page.waitForURL(/\/host\?edit=/, { timeout: 20_000 })

    const proxyCalls = await mockPlacesProxy(page)
    await clearPlacesCache(page)

    await page.getByTestId('location-picker-trigger').click()
    const search = page.getByTestId('location-picker-input')
    await expect(search).toBeVisible({ timeout: 15_000 })
    await search.fill('1100 Congress')

    // Both shapes come back from one query — a venue picker needs named places
    // AND addresses, which is exactly what the removed `types` filter prevented.
    await expect(page.getByTestId(`location-result-google-${MOCK_PLACE_ID}`)).toBeVisible({ timeout: 15_000 })
    const address = page.getByTestId(`location-result-google-${MOCK_ADDRESS_PLACE_ID}`)
    await expect(address).toBeVisible()
    await expect(address).toContainText(MOCK_ADDRESS_MAIN)

    await address.click()
    await expect(search).toHaveCount(0, { timeout: 15_000 })

    await page.getByText('Save changes', { exact: true }).click()
    await expect(page.getByText('Event updated!')).toBeVisible({ timeout: 20_000 })
    await page.getByText('Done', { exact: true }).click()
    await page.waitForURL(eventUrl, { timeout: 20_000 })

    // City attached, state and country left off — a bare "1100 Congress Ave"
    // would be the regression this guards.
    await expect(page.getByTestId('event-location-name')).toHaveText(MOCK_ADDRESS_SAVED, { timeout: 20_000 })

    const stored = await readEventLocation(TOURNAMENT_EVENT)
    expect(stored.location).toBe(MOCK_ADDRESS_SAVED)
    expect(stored.location).not.toMatch(/TX|USA/)
    expect(stored.latitude).toBeCloseTo(MOCK_ADDRESS_COORDS.lat, 4)
    expect(stored.longitude).toBeCloseTo(MOCK_ADDRESS_COORDS.lng, 4)

    // Still one session: the address details lookup reuses the autocomplete token.
    expect(proxyCalls.map(c => c.action)).toEqual(['autocomplete', 'details'])
    expect(proxyCalls[1].place_id).toBe(MOCK_ADDRESS_PLACE_ID)
    expect(proxyCalls[1].sessiontoken).toBe(proxyCalls[0].sessiontoken)

    await unmockPlacesProxy(page)
  })
})
