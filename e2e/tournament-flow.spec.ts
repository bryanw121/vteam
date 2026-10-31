/**
 * Tournament happy path: create → register → generate → record the final →
 * completed, with the podium on the Results tab and the tournament under Past.
 *
 * Signed in as the e2e account (stored session from auth.setup.ts). beforeAll
 * creates a run-tagged club (hosting needs one); afterAll deletes it, which
 * cascades to the tournament. The second team is added through the API as the
 * organizer, since one account captains one team.
 *
 * Bracket-only with two teams keeps it to one match: the final.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { gotoReady, withNetworkRetry } from './retry'
import {
  CLUB_NAME, MY_TEAM, RIVAL_TEAM, TOURNAMENT_TITLE, addRivalTeam, cleanupTournamentClub, seedTournamentClub,
} from './tournamentFixtures'

test.describe.configure({ mode: 'serial' })

function inDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Press a React Native Web touchable. dispatchEvent skips Playwright's viewport
 * check, which fails for buttons inside bottom sheets and horizontal scrollers.
 */
async function press(page: Page, testId: string) {
  await page.getByTestId(testId).first().dispatchEvent('click')
}

/**
 * Press a Button only once it is enabled. A disabled Button (aria-disabled)
 * ignores the click silently: Generate stays disabled until the teams query
 * has loaded two teams, Register until the name has reached React state.
 */
async function pressWhenEnabled(page: Page, testId: string) {
  const button = page.getByTestId(testId).first()
  await expect(button).toBeVisible({ timeout: 15_000 })
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 })
  await button.dispatchEvent('click')
}

/** Resolve on the first successful Supabase write matching `path` (POST/PATCH/DELETE to /rest/v1/<path>). */
function supabaseWrite(page: Page, path: string) {
  return page.waitForResponse(
    r => r.url().includes(`/rest/v1/${path}`) && r.request().method() !== 'GET' && r.ok(),
    { timeout: 20_000 },
  )
}

async function openTab(page: Page, tab: string) {
  await press(page, `tournament-tab-${tab}`)
}

test.describe('Tournament flow', () => {
  let tournamentUrl = ''

  test.beforeAll(async () => { await withNetworkRetry(seedTournamentClub, { label: 'seed club' }) })
  test.afterAll(async () => { await withNetworkRetry(cleanupTournamentClub, { label: 'clean club' }) })

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.error(`[page error] ${err.message}`))
  })

  test('host creates and publishes a bracket tournament', async ({ page }) => {
    const titleField = page.getByPlaceholder('e.g. Summer Slam 2026')
    await gotoReady(page, `${BASE_URL}/tournament/create`, titleField)
    // The club list loads after the form: wait for it before picking.
    await expect(page.getByText(CLUB_NAME, { exact: true })).toBeVisible({ timeout: 20_000 })
    await titleField.fill(TOURNAMENT_TITLE)
    // One club: picked automatically. Pick it anyway in case the account has others.
    await page.getByText(CLUB_NAME, { exact: true }).click({ force: true })
    await page.locator('input[type="date"]').first().fill(inDays(7))
    await page.getByText('Continue', { exact: true }).click({ force: true })

    await page.getByText('Bracket Only', { exact: true }).click({ force: true })
    for (let i = 0; i < 3; i++) await page.getByText('Continue', { exact: true }).click({ force: true })

    await page.getByText('Publish Tournament', { exact: true }).click({ force: true })
    await expect(page).toHaveURL(/\/tournament\/[0-9a-f-]{36}$/, { timeout: 20_000 })
    tournamentUrl = page.url()
    await expect(page.getByText(TOURNAMENT_TITLE).first()).toBeVisible()
    await expect(page.getByTestId('tournament-status').first()).toHaveText('Registration Open')
  })

  test('host registers a team', async ({ page }) => {
    test.skip(!tournamentUrl, 'needs the tournament from the previous test')
    await gotoReady(page, tournamentUrl, page.getByTestId('tournament-tab-teams'))
    // Let the viewer's own registration load before deciding: on a retry the
    // first attempt may already have registered, and the button then goes away.
    await page.waitForLoadState('networkidle')
    if (await page.getByTestId('register-team').count()) {
      await pressWhenEnabled(page, 'register-team')
      const name = page.getByPlaceholder('e.g. Block Party')
      await expect(name).toBeVisible()
      await name.fill(MY_TEAM)
      const saved = supabaseWrite(page, 'tournament_team_members')
      await pressWhenEnabled(page, 'register-submit')
      await saved
    }
    await openTab(page, 'teams')
    await expect(page.getByText(MY_TEAM, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })

  test('schedule generates a bracket; recording the final completes the tournament', async ({ page }) => {
    test.skip(!tournamentUrl, 'needs the tournament from the previous tests')
    const tournamentId = tournamentUrl.split('/').pop() as string
    await withNetworkRetry(() => addRivalTeam(tournamentId), { label: 'add rival team' })
    await gotoReady(page, tournamentUrl, page.getByTestId('tournament-tab-schedule'))
    await openTab(page, 'schedule')
    // On a retry the bracket may already exist; generate only when the button is there.
    await page.waitForLoadState('networkidle')
    if (await page.getByTestId('generate-schedule').count()) {
      const rpc = page.waitForResponse(r => r.url().includes('/rest/v1/rpc/replace_tournament_schedule') && r.ok(), { timeout: 20_000 })
      const bracket = supabaseWrite(page, 'tournament_matches')
      await pressWhenEnabled(page, 'generate-schedule')
      await rpc
      await bracket
    }
    await expect(page.getByText('Final', { exact: true }).first()).toBeVisible({ timeout: 20_000 })

    const recordResult = page.locator('[data-testid^="record-result-"]').first()
    await expect(recordResult).toBeVisible()
    await recordResult.dispatchEvent('click')
    await page.getByTestId('set-1-a').fill('25')
    await page.getByTestId('set-1-b').fill('20')
    await page.getByTestId('set-2-a').fill('25')
    await page.getByTestId('set-2-b').fill('18')
    // The status write: a PATCH on tournaments, or the complete_tournament RPC once trophies are live.
    const finished = page.waitForResponse(
      r => /\/rest\/v1\/(tournaments\?|rpc\/complete_tournament)/.test(r.url()) && r.request().method() !== 'GET' && r.ok(),
      { timeout: 20_000 },
    )
    await pressWhenEnabled(page, 'result-save')
    await finished

    // Status flips to Completed (points PR #100 awards on this), and the podium shows.
    await expect(page.getByTestId('tournament-status').first()).toHaveText('Completed', { timeout: 15_000 })
    await openTab(page, 'results')
    const podium = page.getByTestId('tournament-podium')
    await expect(podium).toBeVisible()
    await expect(podium.getByText(/Diggers|Rivals/).first()).toBeVisible()
  })

  test('the finished tournament is listed under Past', async ({ page }) => {
    test.skip(!tournamentUrl, 'needs the tournament from the previous tests')
    await gotoReady(page, `${BASE_URL}/tournaments`, page.getByTestId('tournaments-past'))
    await press(page, 'tournaments-past')
    await expect(page.getByText(TOURNAMENT_TITLE, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })

  // TODO(#7): enable once the trophies migration (draft PR, `tournament_trophies` +
  // `complete_tournament`) is applied to beta: the champion's roster should show
  // a gold trophy on their profile.
  test.skip('trophies land on the winners\' profiles', async () => {})

  // TODO(#7): enable once the registration-rules migration is applied to beta:
  // registering after the deadline is refused by the server, not just hidden.
  test.skip('registration after the deadline is refused server-side', async () => {})
})
