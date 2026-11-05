/**
 * No-show flag (#151), against beta (where this PR's migration is applied
 * through `beta_meta.apply_pr_migration`).
 *
 * beforeAll creates an event that started 10 minutes ago, hosted by the e2e
 * account, and RSVPs the account to it; afterAll deletes it. Beta has no way
 * to put e2ebuddy on that roster (only buddy could RSVP buddy), so:
 *   - the database path (set_no_show, the guard trigger, persistence) runs
 *     for real on the host's own row (the RPC allows any attending player);
 *   - the host's roster flow (⋯ → Mark as no-show → badge → Undo) runs in the
 *     browser with e2ebuddy added to the event read and the RPC answered by
 *     `page.route`, so it checks the UI and the exact call it makes;
 *   - the flagged player's card is checked for real after flagging the host's
 *     own row and reloading.
 *
 * Titles use their own `[e2e-ns <tag>]` prefix: the events suite in the same
 * shard scrubs every `[e2e <tag>]` event of this run in its beforeAll.
 */
import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { E2E_BASE_URL as BASE_URL, E2E_RUN_TAG, STALE_FIXTURE_HOURS } from './env'
import { signInE2eClient } from './eventsFixtures'
import { gotoReady, withNetworkRetry } from './retry'
import { PROFILE_ROSTER } from '../constants/selects'

const PREFIX = `[e2e-ns ${E2E_RUN_TAG}]`
const TITLE = `${PREFIX} No-show`
const BUDDY_ID = 'b0dd1e00-0000-4000-8000-0000000e2e02'

test.describe.configure({ mode: 'serial' })

let client: SupabaseClient
let myId = ''
let eventId = ''
let buddyProfile: Record<string, unknown> | null = null

async function deleteFixtures(supabase: SupabaseClient, userId: string) {
  const own = await supabase.from('events').delete().eq('created_by', userId).like('title', `${PREFIX}%`)
  if (own.error) throw new Error(`Failed to clean no-show events: ${own.error.message}`)
  const staleBefore = new Date(Date.now() - STALE_FIXTURE_HOURS * 3600_000).toISOString()
  const stale = await supabase.from('events').delete().eq('created_by', userId).like('title', '[e2e-ns%').lt('created_at', staleBefore)
  if (stale.error) throw new Error(`Failed to clean stale no-show events: ${stale.error.message}`)
}

const setNoShow = (userId: string, value: boolean, id = eventId) =>
  withNetworkRetry(() => Promise.resolve(client.rpc('set_no_show' as never, { p_event_id: id, p_user_id: userId, p_value: value } as never)), { label: 'set_no_show' })

test.beforeAll(async () => {
  ;({ supabase: client, userId: myId } = await signInE2eClient())
  await withNetworkRetry(async () => {
    await deleteFixtures(client, myId)
    const ev = await client.from('events').insert({
      title: TITLE,
      description: 'Ephemeral e2e fixture — safe to ignore.',
      location: 'E2E Sand Courts',
      event_date: new Date(Date.now() - 10 * 60_000).toISOString(),
      duration_minutes: 120,
      max_attendees: null,
      created_by: myId,
    }).select('id').single()
    if (ev.error) throw new Error(`Failed to insert no-show event: ${ev.error.message}`)
    eventId = ev.data.id
    const rsvp = await client.from('event_attendees').insert({ event_id: eventId, user_id: myId })
    if (rsvp.error) throw new Error(`Failed to RSVP the host: ${rsvp.error.message}`)
    const buddy = await client.from('profiles').select(PROFILE_ROSTER).eq('id', BUDDY_ID).single()
    if (buddy.error) throw new Error(`Failed to read e2ebuddy: ${buddy.error.message}`)
    buddyProfile = buddy.data as Record<string, unknown>
  }, { label: 'seed no-show event' })
})

test.afterAll(async () => {
  try {
    await withNetworkRetry(() => deleteFixtures(client, myId), { label: 'clean no-show events' })
  } finally {
    await client?.auth.signOut({ scope: 'local' })
  }
})

test('database: set_no_show flags and unflags; a direct write is rejected', async () => {
  const flag = await setNoShow(myId, true)
  expect(flag.error).toBeNull()
  const row = await client.from('event_attendees').select('no_show, no_show_marked_by, no_show_marked_at').eq('event_id', eventId).eq('user_id', myId).single()
  expect(row.error).toBeNull()
  expect(row.data).toMatchObject({ no_show: true, no_show_marked_by: myId })
  expect(row.data?.no_show_marked_at).toBeTruthy()

  // The host may update rows of their own event (team saves), but not these columns.
  const direct = await client.from('event_attendees').update({ no_show: false } as never).eq('event_id', eventId).eq('user_id', myId)
  expect(direct.error?.code).toBe('42501')

  const unflag = await setNoShow(myId, false)
  expect(unflag.error).toBeNull()
  const after = await client.from('event_attendees').select('no_show, no_show_marked_by, no_show_marked_at').eq('event_id', eventId).eq('user_id', myId).single()
  expect(after.data).toEqual({ no_show: false, no_show_marked_by: null, no_show_marked_at: null })

  // Not on the roster: rejected.
  const notAttending = await setNoShow(BUDDY_ID, true)
  expect(notAttending.error?.message).toMatch(/Only players who are going/)
})

/** Add e2ebuddy (attending, not flagged) to this event's detail read. */
async function withBuddyOnRoster(page: Page) {
  // The buddy's flag follows the last set_no_show call, so a refetch after marking keeps it.
  let buddyNoShow = false
  await page.route(url => url.pathname.endsWith('/rest/v1/events') && url.searchParams.get('id') === `eq.${eventId}`, async route => {
    const res = await route.fetch()
    const body = await res.json()
    const add = (ev: Record<string, unknown>) => ({
      ...ev,
      event_attendees: [
        ...((ev.event_attendees as unknown[]) ?? []),
        { event_id: eventId, user_id: BUDDY_ID, joined_at: new Date().toISOString(), team_number: null, team_pinned: false, status: 'attending', no_show: buddyNoShow, profiles: buddyProfile },
      ],
    })
    const next = Array.isArray(body) ? body.map(add) : body && typeof body === 'object' && 'event_attendees' in body ? add(body) : body
    await route.fulfill({ response: res, json: next })
  })
  const calls: unknown[] = []
  await page.route('**/rest/v1/rpc/set_no_show', async route => {
    const args = route.request().postDataJSON() as { p_value?: boolean }
    calls.push(args)
    buddyNoShow = !!args.p_value
    await route.fulfill({ status: 204, body: '' })
  })
  return calls
}

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true })

test('host: ⋯ → Mark as no-show shows the badge; Undo clears it', async ({ page }) => {
  const calls = await withBuddyOnRoster(page)
  await gotoReady(page, `${BASE_URL}/event/${eventId}`, page.getByTestId('event-tab-people').first())
  await page.getByTestId('event-tab-people').first().click()

  await expect(visible(page, 'roster-no-show-note').first()).toHaveText(/Tap ⋯ on anyone who didn't come\. Everyone else gets points at/, { timeout: 20_000 })
  // By name: the host (e2ebot) is on the roster too, and a flagged player may move in the list.
  const first = String(buddyProfile?.first_name ?? '').trim()
  const last = String(buddyProfile?.last_name ?? '').trim()
  const buddyName = first && last ? `${first} ${last.charAt(0)}` : first || last || String(buddyProfile?.username ?? '')
  expect(buddyName).not.toBe('')
  const escaped = buddyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const buddyMenu = page.getByRole('button', { name: new RegExp(`^Actions for ${escaped}`) }).filter({ visible: true }).first()
  await buddyMenu.click()
  await expect(visible(page, 'roster-action-no-show')).toContainText('Mark as no-show')
  await expect(visible(page, 'roster-action-no-show')).toContainText(/You can undo until/)
  await visible(page, 'roster-action-no-show').click()

  await expect(visible(page, 'roster-no-show-badge')).toHaveCount(1, { timeout: 10_000 })
  await expect(visible(page, 'roster-no-show-note').first()).toHaveText(/^1 no-show\. Everyone else gets points at/)
  await expect.poll(() => calls).toEqual([{ p_event_id: eventId, p_user_id: BUDDY_ID, p_value: true }])

  await buddyMenu.click()
  await expect(visible(page, 'roster-action-no-show')).toContainText('Undo no-show')
  await visible(page, 'roster-action-no-show').click()
  await expect(visible(page, 'roster-no-show-badge')).toHaveCount(0, { timeout: 10_000 })
  await expect.poll(() => calls.length).toBe(2)
  expect(calls[1]).toEqual({ p_event_id: eventId, p_user_id: BUDDY_ID, p_value: false })
})

test('flagged player: Details explains it after a reload', async ({ page }) => {
  expect((await setNoShow(myId, true)).error).toBeNull()
  try {
    await gotoReady(page, `${BASE_URL}/event/${eventId}`, visible(page, 'no-show-card').first())
    await expect(visible(page, 'no-show-card').first()).toContainText('Marked as a no-show')
    await expect(visible(page, 'no-show-card').first()).toContainText('earns no points')
  } finally {
    await setNoShow(myId, false)
  }
})
