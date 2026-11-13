/**
 * What to bring (#256), against beta (where this PR's migration is applied
 * through `beta_meta.apply_pr_migration`).
 *
 * beforeAll creates a sand game two days out, hosted by the e2e account, and
 * RSVPs the account to it; afterAll deletes it (items and claims cascade).
 *   - database: the host saves a list, claims, over-claims (refused), releases,
 *     and leaving the game releases what you said you'd bring; guests read
 *     counts without names and can't claim; direct writes are refused;
 *   - browser: the card on Details claims and lets go with one tap each, and a
 *     guest sees the list with a sign-in button.
 *
 * Titles use their own `[e2e-bring <tag>]` prefix: the events suite in the same
 * shard scrubs every `[e2e <tag>]` event of this run in its beforeAll.
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { E2E_BASE_URL as BASE_URL, E2E_RUN_TAG, STALE_FIXTURE_HOURS, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { signInE2eClient } from './eventsFixtures'
import { gotoReady, withNetworkRetry } from './retry'
import type { BringItem } from '../types'

const PREFIX = `[e2e-bring ${E2E_RUN_TAG}]`
const TITLE = `${PREFIX} Sand game`

test.describe.configure({ mode: 'serial' })

let client: SupabaseClient
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
let myId = ''
let eventId = ''

async function deleteFixtures(supabase: SupabaseClient, userId: string) {
  const own = await supabase.from('events').delete().eq('created_by', userId).like('title', `${PREFIX}%`)
  if (own.error) throw new Error(`Failed to clean bring-list events: ${own.error.message}`)
  const staleBefore = new Date(Date.now() - STALE_FIXTURE_HOURS * 3600_000).toISOString()
  const stale = await supabase.from('events').delete().eq('created_by', userId).like('title', '[e2e-bring%').lt('created_at', staleBefore)
  if (stale.error) throw new Error(`Failed to clean stale bring-list events: ${stale.error.message}`)
}

const rpc = <T>(c: SupabaseClient, fn: string, args: Record<string, unknown>, label = fn) =>
  withNetworkRetry(async () => {
    const res = await c.rpc(fn as never, args as never)
    if (res.error && /fetch failed|Failed to fetch/i.test(res.error.message)) throw new Error(res.error.message)
    return res as { data: T | null; error: { message: string; code?: string } | null }
  }, { label })

const list = (c: SupabaseClient = client) => rpc<BringItem[]>(c, 'get_event_bring_list', { p_event_id: eventId })
const byLabel = async (label: string, c: SupabaseClient = client) => (await list(c)).data?.find(i => i.label === label)

async function rsvp() {
  const res = await client.from('event_attendees').insert({ event_id: eventId, user_id: myId })
  if (res.error) throw new Error(`Failed to RSVP: ${res.error.message}`)
}

test.beforeAll(async () => {
  ;({ supabase: client, userId: myId } = await signInE2eClient())
  await withNetworkRetry(async () => {
    await deleteFixtures(client, myId)
    const ev = await client.from('events').insert({
      title: TITLE,
      description: 'Ephemeral e2e fixture — safe to ignore.',
      location: 'E2E Sand Courts',
      event_date: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      duration_minutes: 120,
      max_attendees: null,
      surface: 'sand',
      created_by: myId,
    }).select('id').single()
    if (ev.error) throw new Error(`Failed to insert bring-list event: ${ev.error.message}`)
    eventId = ev.data.id
    await rsvp()
  }, { label: 'seed bring-list event' })
})

test.afterAll(async () => {
  try {
    await withNetworkRetry(() => deleteFixtures(client, myId), { label: 'clean bring-list events' })
  } finally {
    await client?.auth.signOut({ scope: 'local' })
  }
})

test('database: save, claim, over-claim, release, and leaving releases claims', async () => {
  const save = await rpc(client, 'save_event_bring_items', {
    p_event_id: eventId,
    p_items: [
      { label: 'Net + antennas', quantity: 1, required: true, mine: false },
      { label: 'Game balls', quantity: 2, required: false, mine: false },
    ],
  })
  expect(save.error).toBeNull()
  const saved = (await list()).data ?? []
  expect(saved.map(i => [i.label, i.quantity, i.required, i.claimed])).toEqual([
    ['Net + antennas', 1, true, 0],
    ['Game balls', 2, false, 0],
  ])

  const net = saved[0]
  const claim = await rpc<number>(client, 'claim_bring_item', { p_item_id: net.id, p_quantity: 1 })
  expect(claim.error).toBeNull()
  expect(claim.data).toBe(1)
  const after = await byLabel('Net + antennas')
  expect(after?.claimed).toBe(1)
  expect(after?.claimers.map(c => c.user_id)).toEqual([myId])

  // Asking for more than the item needs takes only what is left.
  const balls = saved[1]
  const many = await rpc<number>(client, 'claim_bring_item', { p_item_id: balls.id, p_quantity: 5 })
  expect(many.data).toBe(2)

  // Re-saving the list with ids keeps claims; dropping an item drops its claims.
  const resave = await rpc(client, 'save_event_bring_items', {
    p_event_id: eventId,
    p_items: [{ id: net.id, label: 'Net + antennas', quantity: 1, required: true, mine: true }],
  })
  expect(resave.error).toBeNull()
  const kept = (await list()).data ?? []
  expect(kept.map(i => [i.label, i.claimed])).toEqual([['Net + antennas', 1]])

  const release = await rpc(client, 'release_bring_item', { p_item_id: net.id })
  expect(release.error).toBeNull()
  expect((await byLabel('Net + antennas'))?.claimed).toBe(0)

  // Leaving the game releases what you said you'd bring (trigger on event_attendees).
  await rpc(client, 'claim_bring_item', { p_item_id: net.id, p_quantity: 1 })
  const leave = await client.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', myId)
  expect(leave.error).toBeNull()
  expect((await byLabel('Net + antennas'))?.claimed).toBe(0)
  await rsvp()
})

test('database: guests read counts without names and cannot write', async () => {
  const net = await byLabel('Net + antennas')
  await rpc(client, 'claim_bring_item', { p_item_id: net!.id, p_quantity: 1 })

  const guestView = await byLabel('Net + antennas', anon)
  expect(guestView?.claimed).toBe(1)
  expect(guestView?.claimers).toEqual([])

  const guestClaim = await rpc(anon, 'claim_bring_item', { p_item_id: net!.id, p_quantity: 1 }, 'anon claim')
  expect(guestClaim.error).not.toBeNull()
  const guestSave = await rpc(anon, 'save_event_bring_items', { p_event_id: eventId, p_items: [] }, 'anon save')
  expect(guestSave.error).not.toBeNull()

  // No client writes the tables directly, not even the host.
  const insert = await client.from('event_bring_items' as never).insert({ event_id: eventId, label: 'Sneaky' } as never)
  expect(insert.error).not.toBeNull()
  const claimRow = await client.from('event_bring_claims' as never).insert({ item_id: net!.id, event_id: eventId, user_id: myId } as never)
  expect(claimRow.error).not.toBeNull()

  await rpc(client, 'release_bring_item', { p_item_id: net!.id })
})

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true })

test('browser: claim and let go from the Details card', async ({ page }) => {
  await gotoReady(page, `${BASE_URL}/event/${eventId}`, page.getByTestId('bring-list-card').first())
  const card = visible(page, 'bring-list-card')
  await expect(card).toContainText('What to bring', { timeout: 20_000 })
  await expect(visible(page, 'bring-list-coverage')).toHaveText('0 of 1 covered')

  await visible(page, 'bring-item-claim').first().click()
  await expect(visible(page, 'bring-item-release')).toBeVisible()
  await expect(visible(page, 'bring-list-coverage')).toHaveText('1 of 1 covered')
  await expect(visible(page, 'bring-item-status').first()).toHaveText('You are bringing it')
  await expect.poll(async () => (await byLabel('Net + antennas'))?.claimed, { timeout: 10_000 }).toBe(1)

  await visible(page, 'bring-item-release').first().click()
  await expect(visible(page, 'bring-item-claim')).toBeVisible()
  await expect.poll(async () => (await byLabel('Net + antennas'))?.claimed, { timeout: 10_000 }).toBe(0)
})

test('browser: a guest sees the list and is asked to sign in to bring something', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  try {
    await gotoReady(page, `${BASE_URL}/event/${eventId}`, page.getByTestId('bring-list-card').first())
    await expect(visible(page, 'bring-list-card')).toContainText('Net + antennas', { timeout: 20_000 })
    await visible(page, 'bring-item-sign-in').first().click()
    await expect(page).toHaveURL(/\/login/)
  } finally {
    await ctx.close()
  }
})
