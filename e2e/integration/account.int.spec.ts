/**
 * The signed-in player's own corner, on the server: settings (reminders, hidden
 * feed, seen banners), saved host templates, notifications read marks, the
 * ad-free status, friend requests to e2ebuddy, member search, reports, usage
 * heartbeats and the account-deletion preview. Everything written is put back.
 */
import { test, expect } from '@playwright/test'
import { BUDDY_ID, RUN, ok, refused, signIn, sweep, type Me } from './helpers'

test.describe.configure({ mode: 'serial' })

let me: Me

test.beforeAll(async () => {
  me = await signIn()
  await sweep(me, 'user_event_templates', 'name', 'user_id')
})
test.afterAll(async () => {
  if (me) await sweep(me, 'user_event_templates', 'name', 'user_id', false)
  await me?.db.auth.signOut({ scope: 'local' })
})

test('settings: hidden feed and seen banners save and come back, then are restored', async () => {
  const before = await ok('read settings', () => me.db.from('user_settings').select('hidden_feed, seen_banners').eq('user_id', me.id).maybeSingle()) as { hidden_feed: unknown[]; seen_banners: string[] } | null
  const hidden = [{ kind: 'venue', key: `${RUN} venue`, label: 'Integration venue' }]
  const banners = [...(before?.seen_banners ?? []), `${RUN}-banner`]
  await ok('write settings', () => me.db.from('user_settings').upsert({ user_id: me.id, hidden_feed: hidden, seen_banners: banners }))
  const after = await ok('read back', () => me.db.from('user_settings').select('hidden_feed, seen_banners').eq('user_id', me.id).single()) as { hidden_feed: unknown[]; seen_banners: string[] }
  expect(after.hidden_feed).toEqual(hidden)
  expect(after.seen_banners).toContain(`${RUN}-banner`)
  await ok('restore', () => me.db.from('user_settings').upsert({ user_id: me.id, hidden_feed: before?.hidden_feed ?? [], seen_banners: before?.seen_banners ?? [] }))
})

test("settings are private: no other player's row is readable", async () => {
  const rows = await ok('read all settings', () => me.db.from('user_settings').select('user_id'))
  expect((rows as { user_id: string }[]).every(r => r.user_id === me.id)).toBe(true)
})

test('host templates: save, list, delete', async () => {
  const t = await ok('save template', () => me.db.from('user_event_templates').insert({ user_id: me.id, name: `${RUN} Tuesday 6s`, title: 'Tuesday 6s', max_attendees: 12 }).select('id').single()) as { id: string }
  const list = await ok('list', () => me.db.from('user_event_templates').select('id').eq('user_id', me.id))
  expect((list as { id: string }[]).map(r => r.id)).toContain(t.id)
  await ok('delete', () => me.db.from('user_event_templates').delete().eq('id', t.id))
})

test('notifications: mark one read and mark all read', async () => {
  const latest = await ok('inbox', () => me.db.from('notifications').select('id').eq('user_id', me.id).order('created_at', { ascending: false }).limit(1)) as { id: string }[]
  if (latest[0]) {
    await ok('mark one', () => me.db.rpc('mark_notification_read', { p_notification_id: latest[0].id }))
    const row = await ok('read one', () => me.db.from('notifications').select('read_at').eq('id', latest[0].id).single()) as { read_at: string | null }
    expect(row.read_at).not.toBeNull()
  }
  // Other suites may add notifications while this runs, so only the call is checked here.
  await ok('mark all', () => me.db.rpc('mark_all_notifications_read'))
})

test('ad-free: the status answers with the offer', async () => {
  const status = await ok('get_ad_free_status', () => me.db.rpc('get_ad_free_status')) as Record<string, unknown>
  expect(status).toBeTruthy()
  expect(typeof status).toBe('object')
})

test('friends: a request to buddy can be sent and taken back', async () => {
  const sent = await me.db.rpc('send_friend_request', { p_user_id: BUDDY_ID })
  // 3 requests a week to the same person: a nightly run can meet the limit (PT429), which is the rule working.
  if (sent.error) { expect(sent.error.code).toBe('PT429'); return }
  expect(['requested', 'friends']).toContain(sent.data)
  if (sent.data === 'requested') {
    const back = await ok('cancel', () => me.db.rpc('cancel_friend_request', { p_user_id: BUDDY_ID }))
    expect(back).toBe('none')
  }
  const mine = await ok('my friend rows', () => me.db.from('friendships').select('user_id'))
  expect((mine as { user_id: string }[]).every(r => r.user_id === me.id)).toBe(true)
})

test('member search finds buddy by username', async () => {
  const rows = await ok('search_members', () => me.db.rpc('search_members', { p_query: 'e2ebud', p_limit: 5 })) as { id: string }[]
  expect(rows.map(r => r.id)).toContain(BUDDY_ID)
})

test("reports: reporting yourself or with an unknown reason is refused", async () => {
  await refused('report yourself', () => me.db.rpc('report_user', { p_target: me.id, p_kind: 'profile', p_context_id: me.id, p_reason: 'spam' }))
  await refused('unknown reason', () => me.db.rpc('report_user', { p_target: BUDDY_ID, p_kind: 'profile', p_context_id: BUDDY_ID, p_reason: `${RUN}-not-a-reason` }))
})

test('usage: a heartbeat for a new session is accepted', async () => {
  await ok('app_heartbeat', () => me.db.rpc('app_heartbeat', { p_session: crypto.randomUUID(), p_anon: `int-${crypto.randomUUID()}`, p_platform: 'web', p_version: 'integration', p_screen: '/integration' }))
})

test('account deletion: the preview describes the plan without deleting anything', async () => {
  const preview = await ok('get_account_deletion_preview', () => me.db.rpc('get_account_deletion_preview' as never)) as Record<string, unknown>
  expect(preview).toBeTruthy()
  const still = await ok('still here', () => me.db.from('profiles').select('id').eq('id', me.id).single())
  expect((still as { id: string }).id).toBe(me.id)
})

test('feed extras: friends going and card previews answer for an empty list', async () => {
  await ok('get_friends_going', () => me.db.rpc('get_friends_going', { p_event_ids: [] }))
  await ok('previews', () => me.db.rpc('get_event_card_attendee_previews', { p_event_ids: [] }))
})
