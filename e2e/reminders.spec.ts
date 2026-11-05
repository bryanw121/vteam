/**
 * Event reminders (#129): Settings → Notifications → Reminders.
 * Picks a lead time, checks it is saved to the account (survives a reload) and
 * the example reminder follows it, then restores the account's original value.
 * The reminder itself is sent by pg_cron on the server (covered by the SQL
 * checks in the PR and the RLS spec), so it isn't waited for here.
 */
import { test, expect, type Page, type Response } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { gotoReady } from './retry'

const LEADS = [60, 120, 1440] as const

/** The settings read (GET user_settings) the screen makes on load. */
function settingsLoaded(page: Page): Promise<Response> {
  return page.waitForResponse(r => r.url().includes('/rest/v1/user_settings') && r.request().method() === 'GET', { timeout: 30_000 })
}

/** The save a lead-time chip makes (an upsert into user_settings carrying the lead, not the seen-banner upsert). */
function settingsSaved(page: Page): Promise<Response> {
  return page.waitForResponse(
    r => r.url().includes('/rest/v1/user_settings') && r.request().method() === 'POST' && (r.request().postData() ?? '').includes('reminder_lead_minutes'),
    { timeout: 30_000 },
  )
}

/** The example reminder for each lead (it is built from the saved lead). */
const PREVIEW: Record<(typeof LEADS)[number], RegExp> = { 60: /Starts in 1 hour/, 120: /Starts in 2 hours/, 1440: /Tomorrow at/ }

/** The checked lead chip (role="radio" + aria-checked in a radiogroup). */
async function selectedLead(page: Page): Promise<(typeof LEADS)[number] | null> {
  for (const m of LEADS) {
    if ((await page.getByTestId(`reminder-lead-${m}`).getAttribute('aria-checked')) === 'true') return m
  }
  return null
}

/** `m` is the checked chip and the example reminder follows it. */
async function expectLead(page: Page, m: (typeof LEADS)[number], timeout = 5_000): Promise<void> {
  await expect(page.getByTestId(`reminder-lead-${m}`)).toHaveAttribute('aria-checked', 'true', { timeout })
  await expect(page.getByTestId('reminder-preview')).toContainText(PREVIEW[m], { timeout })
}

test('Reminders: choose how long before an event, saved to the account', async ({ page }) => {
  const card = page.getByTestId('settings-reminders')
  // Wait for the saved settings, not just the card: the card renders with the
  // profile, and the lead time arrives in a second request. Deciding before
  // both are in read a default state and toggled reminders the wrong way.
  const loaded = settingsLoaded(page)
  await gotoReady(page, `${BASE_URL}/settings/notifications`, card)
  await loaded
  await expect(page.getByText(/coming soon/i)).toHaveCount(0)

  // A previous run may have turned reminders off: turn them back on.
  const toggle = page.getByTestId('reminders-toggle')
  await expect(toggle).toBeVisible()
  if (!(await page.getByTestId('reminder-lead-120').isVisible())) {
    await toggle.click()
  }
  await expect(page.getByTestId('reminder-lead-120')).toBeVisible({ timeout: 15_000 })

  // Exactly one lead is always checked (a missing row reads as the default):
  // none means the chips stopped exposing their state, so fail here rather than
  // guess, where the cause is plain (the restore below would hide it).
  const original = await selectedLead(page)
  if (original === null) throw new Error('No reminder lead chip has aria-checked="true"')
  const next = original === 60 ? 1440 : 60
  try {
    const saved = settingsSaved(page)
    await page.getByTestId(`reminder-lead-${next}`).click()
    await expectLead(page, next)
    // Reload only once the save is done, or the reload can drop it.
    expect((await saved).ok()).toBe(true)

    // Saved on the account, not just on screen.
    const reloaded = settingsLoaded(page)
    await page.reload()
    await reloaded
    await expectLead(page, next, 20_000)
  } finally {
    if ((await selectedLead(page)) !== original) {
      const restored = settingsSaved(page)
      await page.getByTestId(`reminder-lead-${original}`).click()
      expect((await restored).ok()).toBe(true)
      await expectLead(page, original, 15_000)
    }
  }
})
