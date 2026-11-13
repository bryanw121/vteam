/**
 * Integration tests for row level security and key RPCs (#12), run against the
 * CI Supabase project (vteam beta) with its public anon key and the e2e
 * account. No browser. Nothing here writes: every insert is one RLS must
 * reject, `find_or_create_dm` finds the existing seed DM, and the reminder
 * lead-time check writes back the account's current value.
 *
 * Asserts the policies as they are on main; drafts that tighten them (#100+)
 * update these expectations in their own PRs.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { EVENT_PREVIEW_COLUMNS } from '../constants/selects'
import { signInE2eClient } from './eventsFixtures'
import { withNetworkRetry } from './retry'

const BUDDY_ID = 'b0dd1e00-0000-4000-8000-0000000e2e02'
/** The e2e account's DM with e2ebuddy (same seed as e2e/chat.spec.ts). */
const SEED_DM_ID = '1e473b01-c06a-48b0-9308-21b3f593f603'
/** Postgres "insufficient_privilege": what PostgREST returns when a policy rejects a row. */
const RLS_DENIED = '42501'
/** Postgres "check_violation". */
const CHECK_FAILED = '23514'

type Result<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number | null }

/** Run a query; retry network flakes only (a returned PostgREST error is passed through). */
async function q<T>(run: () => PromiseLike<Result<T>>, label: string): Promise<Result<T>> {
  return withNetworkRetry(async () => {
    const res = await run()
    if (res.error && /fetch failed|Failed to fetch/i.test(res.error.message)) throw new Error(res.error.message)
    return res
  }, { label })
}

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
let me: SupabaseClient
let myId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  ;({ supabase: me, userId: myId } = await signInE2eClient())
})

test.afterAll(async () => {
  await me?.auth.signOut({ scope: 'local' })
})

test.describe('anon (guest browsing)', () => {
  test('reads public events, attendees, profiles, tags and clubs', async () => {
    for (const table of ['events', 'event_attendees', 'tags', 'clubs'] as const) {
      // head: true returns only the count, no rows.
      const res = await q(() => anon.from(table).select('*', { count: 'exact', head: true }), `anon ${table}`)
      expect(res.error, `anon SELECT on ${table}`).toBeNull()
    }
    const buddy = await q(() => anon.from('profiles').select('id, username').eq('id', BUDDY_ID), 'anon profile')
    expect(buddy.error).toBeNull()
    expect(buddy.data).toEqual([{ id: BUDDY_ID, username: 'e2ebuddy' }])
  })

  test('can read what an event link preview shows (#130)', async () => {
    // api/event-page.ts and api/og/event.tsx read these with the anon key; a
    // policy change that hides them would quietly turn every preview generic.
    const ev = await q(() => anon.from('events').select(EVENT_PREVIEW_COLUMNS).limit(1), 'anon event preview columns')
    expect(ev.error, 'anon SELECT of the preview columns').toBeNull()
    for (const view of ['event_attendees_attending', 'event_guests_attending'] as const) {
      const res = await q(() => anon.from(view).select('event_id', { count: 'exact', head: true }), `anon ${view} count`)
      expect(res.error, `anon count on ${view}`).toBeNull()
      expect(typeof res.count, `anon count on ${view}`).toBe('number')
    }
  })

  test('sees no rows of private tables', async () => {
    for (const table of ['notifications', 'user_settings', 'messages', 'conversations', 'conversation_members', 'push_tokens', 'feedback_submissions', 'app_events', 'app_events_daily'] as const) {
      // A GET (not head: a HEAD error has no body to read the code from).
      const res = await q(() => anon.from(table).select('*').limit(1), `anon ${table}`)
      // No grant: permission denied. Granted but no anon policy: zero rows. Never data.
      if (res.error) expect(res.error.code, `anon ${table}: ${res.error.message}`).toBe(RLS_DENIED)
      else expect(res.data, `anon rows visible in ${table}`).toEqual([])
    }
    const dm = await q(() => anon.from('messages').select('id').eq('conversation_id', SEED_DM_ID).limit(1), 'anon seed messages')
    expect(dm.data ?? []).toEqual([])
  })

  test('reads generated badge art but cannot write it (#10)', async () => {
    const read = await q(() => anon.from('badge_art').select('badge_type, tier, image_url').limit(1), 'anon badge_art')
    // Until the migration is on beta (draft PR) the table does not exist.
    test.skip(read.error?.code === 'PGRST205', 'badge_art not applied on beta yet')
    expect(read.error).toBeNull()
    const prompt = await q(() => anon.from('badge_art').select('prompt').limit(1), 'anon badge_art prompt')
    expect(prompt.error?.code, 'prompt column is not granted to clients').toBe(RLS_DENIED)
    const write = await q(() => anon.from('badge_art').insert({ badge_type: 'e2e_rls', tier: 1, image_url: 'https://x', prompt: 'x', model: 'x' }), 'anon insert badge_art')
    expect(write.error?.code).toBe(RLS_DENIED)
  })

  test('sees no friend data and cannot call the friend RPCs (#15)', async () => {
    const probe = await q(() => anon.from('friendships').select('user_id').limit(1), 'anon friendships')
    // Until the migration is on beta (draft PR) the tables do not exist.
    test.skip(probe.error?.code === 'PGRST205', 'friends migration not applied on beta yet')
    for (const table of ['friendships', 'friend_requests'] as const) {
      const res = await q(() => anon.from(table).select('*').limit(1), `anon ${table}`)
      if (res.error) expect(res.error.code, `anon ${table}: ${res.error.message}`).toBe(RLS_DENIED)
      else expect(res.data, `anon rows visible in ${table}`).toEqual([])
    }
    const rpc = await q(() => anon.rpc('send_friend_request', { p_user_id: BUDDY_ID }), 'anon send_friend_request')
    expect(rpc.error, 'anon must not execute send_friend_request').not.toBeNull()
  })

  test('cannot run the reminder job or read its ledger (#129)', async () => {
    const run = await q(() => anon.rpc('send_event_reminders'), 'anon send_event_reminders')
    expect(run.error, 'anon may not run send_event_reminders').not.toBeNull()
    expect(run.data).toBeNull()
    const log = await q(() => anon.from('event_reminder_log').select('*').limit(1), 'anon event_reminder_log')
    if (log.error) expect(log.error.code).toBe(RLS_DENIED)
    else expect(log.data).toEqual([])
  })

  test('cannot write events or RSVPs', async () => {
    const ev = await q(() => anon.from('events').insert({ title: '[e2e rls] must fail', event_date: new Date().toISOString(), created_by: BUDDY_ID }).select('id'), 'anon insert event')
    expect(ev.error?.code).toBe(RLS_DENIED)
    const rsvp = await q(() => anon.from('event_attendees').insert({ event_id: crypto.randomUUID(), user_id: BUDDY_ID }), 'anon insert attendee')
    expect(rsvp.error?.code).toBe(RLS_DENIED)
  })

  test('cannot call save_event (#188)', async () => {
    const res = await q(() => anon.rpc('save_event', { p_edit_id: null, p_event: { title: '[e2e rls] must fail' }, p_dates: [new Date().toISOString()], p_tag_ids: [] } as never), 'anon save_event')
    expect(res.error).not.toBeNull()
  })

  test('cannot create a club', async () => {
    const club = await q(() => anon.from('clubs').insert({ name: '[e2e rls] must fail', created_by: BUDDY_ID }).select('id'), 'anon insert club')
    expect(club.error?.code).toBe(RLS_DENIED)
  })
})

test.describe('job health (#157)', () => {
  test('a guest can read the aggregate report, and nothing behind it', async () => {
    const report = await q(() => anon.rpc('job_health'), 'job_health')
    expect(report.error).toBeNull()
    const rows = (report.data ?? []) as Record<string, unknown>[]
    expect(rows.some(r => String(r.check_name).startsWith('cron: '))).toBe(true)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['check_name', 'detail', 'failures_24h', 'last_ok_at', 'ok'])
      // Counts and ages only: no ids, no error text.
      expect(String(row.detail ?? '')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|ERROR:/i)
    }
    const ledger = await q(() => anon.from('point_events').select('id').limit(1), 'anon point_events')
    expect(ledger.data ?? []).toEqual([])
  })
})

test.describe('event_payments ("I\'ve paid", #6)', () => {
  test('anon reads nothing and cannot write', async () => {
    const res = await q(() => anon.from('event_payments').select('*').limit(1), 'anon event_payments')
    if (res.error) expect(res.error.code, `anon event_payments: ${res.error.message}`).toBe(RLS_DENIED)
    else expect(res.data).toEqual([])
    const ins = await q(() => anon.from('event_payments').insert({ event_id: crypto.randomUUID(), user_id: BUDDY_ID }), 'anon insert event_payments')
    expect(ins.error?.code).toBe(RLS_DENIED)
  })

  test('a signed-in user cannot mark someone else paid, and sees no one else\'s flags', async () => {
    const ins = await q(() => me.from('event_payments').insert({ event_id: crypto.randomUUID(), user_id: BUDDY_ID }), 'insert for buddy')
    expect(ins.error?.code).toBe(RLS_DENIED)
    const others = await q(() => me.from('event_payments').select('user_id').neq('user_id', myId).limit(1), 'others flags')
    expect(others.error).toBeNull()
    expect(others.data).toEqual([])
  })

  test('cannot mark yourself paid on an event you are not on', async () => {
    const ins = await q(() => me.from('event_payments').insert({ event_id: crypto.randomUUID(), user_id: myId }), 'insert self, no RSVP')
    expect(ins.error?.code).toBe(RLS_DENIED)
  })
})

test.describe('signed in as the e2e account', () => {
  test("reads its own DM, not other people's private rows", async () => {
    const msgs = await q(() => me.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', SEED_DM_ID), 'my seed messages')
    expect(msgs.error).toBeNull()
    expect(msgs.count ?? 0).toBeGreaterThan(0)

    const members = await q(() => me.from('conversation_members').select('user_id').eq('conversation_id', SEED_DM_ID), 'seed members')
    expect((members.data ?? []).map(m => (m as { user_id: string }).user_id).sort()).toEqual([myId, BUDDY_ID].sort())

    const settings = await q(() => me.from('user_settings').select('user_id'), 'user_settings')
    expect(settings.error).toBeNull()
    for (const row of (settings.data ?? []) as { user_id: string }[]) expect(row.user_id).toBe(myId)
    const buddySettings = await q(() => me.from('user_settings').select('user_id').eq('user_id', BUDDY_ID), 'buddy settings')
    expect(buddySettings.data ?? []).toEqual([])

    const notifs = await q(() => me.from('notifications').select('user_id').neq('user_id', myId).limit(1), 'others notifications')
    expect(notifs.data ?? []).toEqual([])
  })

  test("cannot RSVP someone else, or send as them", async () => {
    const event = await q(() => me.from('events').select('id').limit(1), 'any event')
    const eventId = (event.data as { id: string }[] | null)?.[0]?.id ?? crypto.randomUUID()
    const rsvp = await q(() => me.from('event_attendees').insert({ event_id: eventId, user_id: BUDDY_ID }), 'insert attendee for buddy')
    expect(rsvp.error?.code).toBe(RLS_DENIED)

    const spoof = await q(() => me.from('messages').insert({ conversation_id: SEED_DM_ID, sender_id: BUDDY_ID, content: '[e2e rls] must fail' }), 'spoofed message')
    expect(spoof.error?.code).toBe(RLS_DENIED)

    // Any signed-in user may create a club, but only as themselves.
    const club = await q(() => me.from('clubs').insert({ name: '[e2e rls] must fail', created_by: BUDDY_ID }).select('id'), 'club created as buddy')
    expect(club.error?.code).toBe(RLS_DENIED)

    // Writes buddy's current name back, so even a broken policy changes nothing.
    const profile = await q(() => me.from('profiles').update({ first_name: 'E2E' }).eq('id', BUDDY_ID).select('id'), "update buddy's profile")
    // UPDATE with a USING policy filters the row out: no error, zero rows changed.
    expect(profile.data ?? []).toEqual([])
  })

  test("save_event (#188) can't edit an event it doesn't host, and writes nothing", async () => {
    const res = await q(() => me.rpc('save_event', {
      p_edit_id: crypto.randomUUID(), p_event: { title: '[e2e rls] must fail' }, p_dates: [new Date().toISOString()], p_tag_ids: [],
    } as never), 'save_event on someone else')
    expect(res.error?.code).toBe('42501')
    const tooMany = await q(() => me.rpc('save_event', {
      p_edit_id: null, p_event: { title: '[e2e rls] must fail' }, p_dates: Array.from({ length: 53 }, (_, i) => new Date(Date.now() + i * 86_400_000).toISOString()), p_tag_ids: [],
    } as never), 'save_event 53 dates')
    expect(tooMany.error?.code).toBe('22023')
  })

  test('cannot rename itself; other columns of its own row still update (#223)', async () => {
    const mine = await q(() => me.from('profiles').select('username, first_name').eq('id', myId).single(), 'my profile')
    const { username, first_name } = mine.data as unknown as { username: string; first_name: string | null }

    const rename = await q(() => me.from('profiles').update({ username: `${username}_x` }).eq('id', myId).select('username'), 'rename myself')
    if (!rename.error) {
      // The guard is missing: put the shared account's name back before failing.
      await me.from('profiles').update({ username }).eq('id', myId)
    }
    expect(rename.error?.code, 'profiles_guard_username rejects a username change').toBe('42501')

    // Writes the current value back, so nothing changes either way.
    const other = await q(() => me.from('profiles').update({ first_name }).eq('id', myId).select('id'), 'update my first name')
    expect(other.error).toBeNull()
    expect(other.data).toHaveLength(1)
  })

  test('reads only its own friend rows and cannot write them directly (#15)', async () => {
    const probe = await q(() => me.from('friendships').select('user_id, friend_id, is_best_friend'), 'my friendships')
    test.skip(probe.error?.code === 'PGRST205', 'friends migration not applied on beta yet')
    expect(probe.error).toBeNull()
    for (const row of (probe.data ?? []) as { user_id: string }[]) expect(row.user_id).toBe(myId)
    const forged = await q(() => me.from('friendships').insert({ user_id: myId, friend_id: BUDDY_ID }), 'insert friendship')
    expect(forged.error?.code).toBe(RLS_DENIED)
    const forgedReq = await q(() => me.from('friend_requests').insert({ requester_id: BUDDY_ID, addressee_id: myId }), 'insert friend request')
    expect(forgedReq.error?.code).toBe(RLS_DENIED)
    const internal = await q(() => me.rpc('friend_accept', { p_request_id: crypto.randomUUID(), p_requester: BUDDY_ID, p_addressee: myId }), 'friend_accept')
    expect(internal.error, 'friend_accept is internal').not.toBeNull()
  })

  test('event reminders (#129): the job and its ledger are server-only', async () => {
    const run = await q(() => me.rpc('send_event_reminders'), 'send_event_reminders')
    expect(run.error, 'a signed-in user may not run send_event_reminders').not.toBeNull()
    expect(run.data).toBeNull()

    const log = await q(() => me.from('event_reminder_log').select('*').limit(1), 'event_reminder_log')
    if (log.error) expect(log.error.code).toBe(RLS_DENIED)
    else expect(log.data).toEqual([])
    const event = await q(() => me.from('events').select('id').limit(1), 'any event')
    const eventId = (event.data as { id: string }[] | null)?.[0]?.id ?? crypto.randomUUID()
    const logInsert = await q(() => me.from('event_reminder_log').insert({ event_id: eventId, user_id: myId }), 'insert reminder log')
    expect(logInsert.error?.code).toBe(RLS_DENIED)

    // Clients still never insert notifications, the new types included.
    const fake = await q(() => me.from('notifications').insert({
      user_id: myId, notification_type: 'event_reminder', title: '[e2e rls] must fail', body: 'x', data: { event_id: eventId },
    }), 'insert event_reminder notification')
    expect(fake.error?.code).toBe(RLS_DENIED)
  })

  test('reminder lead time (#129): only 1h / 2h / a day, own row only', async () => {
    const mine = await q(() => me.from('user_settings').select('reminder_lead_minutes').eq('user_id', myId).maybeSingle(), 'my lead time')
    expect(mine.error).toBeNull()
    const current = (mine.data as { reminder_lead_minutes: number } | null)?.reminder_lead_minutes ?? 120
    expect([60, 120, 1440]).toContain(current)

    // An insert-or-update of an invalid value fails the check, so nothing is written either way.
    const bad = await q(() => me.from('user_settings').upsert({ user_id: myId, reminder_lead_minutes: 5 }, { onConflict: 'user_id' }), 'lead 5')
    expect(bad.error?.code).toBe(CHECK_FAILED)

    // A valid value is accepted (writes back the current one: no change).
    const ok = await q(() => me.from('user_settings').update({ reminder_lead_minutes: current }).eq('user_id', myId), 'lead valid')
    expect(ok.error).toBeNull()

    // Someone else's row: filtered out by RLS, zero rows changed.
    const buddy = await q(() => me.from('user_settings').update({ reminder_lead_minutes: 60 }).eq('user_id', BUDDY_ID).select('user_id'), "buddy's lead")
    expect(buddy.data ?? []).toEqual([])
  })

  test('find_or_create_dm returns the existing DM with e2ebuddy, every time', async () => {
    const first = await q(() => me.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }), 'find_or_create_dm')
    expect(first.error).toBeNull()
    expect(first.data).toBe(SEED_DM_ID)
    const again = await q(() => me.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }), 'find_or_create_dm again')
    expect(again.data).toBe(SEED_DM_ID)
  })

  test('get_my_conversations includes the seed DM', async () => {
    const res = await q(() => me.rpc('get_my_conversations'), 'get_my_conversations')
    expect(res.error).toBeNull()
    const ids = ((res.data ?? []) as Record<string, unknown>[]).map(r => r.conversation_id ?? r.id)
    expect(ids).toContain(SEED_DM_ID)
  })
})

/**
 * #99 / #102 tightens what signed-out visitors and other users can read. These
 * run once that migration is on the beta project (detected by its new
 * event_attendee_denials table) and skip before that.
 * TODO(#102): drop the skip once the migration is applied on beta and live.
 */
test.describe('privacy tightening (#99)', () => {
  let applied = false
  test.beforeAll(async () => {
    const probe = await q(() => me.from('event_attendee_denials').select('event_id').limit(1), 'probe #102 migration')
    applied = !probe.error
  })

  test('anon cannot read +1 guest names, but head counts still work', async () => {
    test.skip(!applied, 'TODO(#102): migration 20261028120000_privacy_private_reads not on beta yet')
    const rows = await q(() => anon.from('event_guests').select('id, first_name, last_name').limit(5), 'anon guests')
    if (rows.error) expect(rows.error.code).toBe(RLS_DENIED)
    else expect(rows.data).toEqual([])
    const view = await q(() => anon.from('event_guests_attending').select('id, event_id, added_by').limit(1), 'anon guest view')
    expect(view.error).toBeNull()
    const names = await q(() => anon.from('event_guests_attending').select('first_name').limit(1), 'anon guest view names')
    expect(names.error, 'the public view has no name columns').not.toBeNull()
  })

  test('anon cannot see who gave a kudo, only that it was received', async () => {
    test.skip(!applied, 'TODO(#102): migration not on beta yet')
    const givers = await q(() => anon.from('cheers').select('giver_id').limit(1), 'anon cheers giver')
    expect(givers.error?.code).toBe(RLS_DENIED)
    const received = await q(() => anon.from('cheers').select('id', { count: 'exact', head: true }).eq('receiver_id', BUDDY_ID), 'anon cheers received')
    expect(received.error).toBeNull()
  })

  test('private profile values live off the public row', async () => {
    test.skip(!applied, 'TODO(#102): migration not on beta yet')
    const buddy = await q(() => anon.from('profiles').select('is_admin, notification_prefs').eq('id', BUDDY_ID), 'anon private columns')
    expect(buddy.error).toBeNull()
    expect(buddy.data).toEqual([{ is_admin: false, notification_prefs: { push: {}, in_app: {} } }])
    const denials = await q(() => anon.from('event_attendee_denials').select('event_id').limit(1), 'anon denials')
    expect(denials.error?.code).toBe(RLS_DENIED)
    const admins = await q(() => me.from('app_admins').select('user_id').limit(1), 'app_admins')
    if (admins.error) expect(admins.error.code).toBe(RLS_DENIED)
    else expect(admins.data).toEqual([])
    const mine = await q(() => me.from('user_settings').select('notification_prefs').eq('user_id', myId), 'own prefs')
    expect(mine.error).toBeNull()
  })

  test('nobody can add themselves to a conversation directly', async () => {
    test.skip(!applied, 'TODO(#102): migration 20261028120300_conversation_members_insert not on beta yet')
    const join = await q(() => me.from('conversation_members').insert({ conversation_id: crypto.randomUUID(), user_id: myId }), 'self-join conversation')
    expect(join.error?.code).toBe(RLS_DENIED)
  })
})

test.describe('tournament trophies (#7)', () => {
  test('anyone can read trophies; nobody can write them directly', async () => {
    const read = await q(() => anon.from('tournament_trophies').select('id, place, tournament_title').limit(1), 'anon trophies')
    expect(read.error).toBeNull()
    const forged = await q(() => me.from('tournament_trophies').insert({
      tournament_id: crypto.randomUUID(), user_id: myId, place: 1,
      tournament_title: '[e2e rls] must fail', tournament_date: new Date().toISOString(), team_name: 'x',
    }), 'forge a trophy')
    expect(forged.error?.code).toBe(RLS_DENIED)
  })

  test('complete_tournament: only the organizer, never for a tournament you do not run', async () => {
    const guest = await q(() => anon.rpc('complete_tournament', { p_tournament_id: crypto.randomUUID(), p_podium: [] }), 'anon complete')
    expect(guest.error).not.toBeNull()
    const notMine = await q(() => me.rpc('complete_tournament', { p_tournament_id: crypto.randomUUID(), p_podium: [] }), 'complete someone else')
    expect(notMine.error?.code).toBe(RLS_DENIED)
  })
})

/**
 * #99 part 2 (#106): account deletion RPCs. Skipped until its migration is on
 * beta. TODO(#106): drop the skip once applied.
 */
test.describe('account deletion RPCs (#106)', () => {
  test('only the signed-in owner can preview; nobody but the service role can delete', async () => {
    const preview = await q(() => me.rpc('get_account_deletion_preview'), 'deletion preview')
    test.skip(!!preview.error && /get_account_deletion_preview|PGRST202/.test(`${preview.error.code} ${preview.error.message}`),
      'TODO(#106): migration 20261028130000_account_deletion not on beta yet')
    expect(preview.error).toBeNull()
    expect(preview.data).toMatchObject({ clubs: expect.any(Array), events: expect.any(Array), hash: expect.stringMatching(/^[0-9a-f]{32}$/) })

    const anonPreview = await q(() => anon.rpc('get_account_deletion_preview'), 'anon deletion preview')
    expect(anonPreview.error).not.toBeNull()
    for (const client of [anon, me]) {
      const del = await q(() => client.rpc('delete_account', { p_user: myId, p_plan_hash: '0'.repeat(32) }), 'delete_account')
      expect(del.error, 'delete_account must not be callable by clients').not.toBeNull()
    }
  })
})

test.describe('points (#4)', () => {
  test('anon reads point balances but no ledger rows', async () => {
    const balances = await q(() => anon.from('point_balances').select('user_id, balance').limit(1), 'anon point_balances')
    expect(balances.error).toBeNull()
    const ledger = await q(() => anon.from('point_events').select('id').limit(1), 'anon point_events')
    if (ledger.error) expect(ledger.error.code, `anon point_events: ${ledger.error.message}`).toBe(RLS_DENIED)
    else expect(ledger.data).toEqual([])
  })

  test('nobody writes points from the client', async () => {
    const own = await q(() => me.from('point_events').insert({ user_id: myId, amount: 1000, reason: 'e2e_rls' }), 'insert own points')
    expect(own.error?.code).toBe(RLS_DENIED)
    const bal = await q(() => me.from('point_balances').insert({ user_id: myId, balance: 1000 }), 'insert own balance')
    expect(bal.error?.code).toBe(RLS_DENIED)
    const ledger = await q(() => me.from('point_events').select('user_id').neq('user_id', myId).limit(1), "others' ledger")
    expect(ledger.data ?? []).toEqual([])
  })
})

/**
 * No-show flag (#151): only set_no_show() writes event_attendees.no_show, and
 * only for the host or a co-host. Nothing here succeeds: random ids, an event
 * the account doesn't host, and inserts the guard trigger refuses.
 */
test.describe('no-show flag (#151)', () => {
  // TEMPORARY casts: set_no_show / no_show reach types/database.ts when it is regenerated after merge.
  const args = (eventId: string, userId: string) => ({ p_event_id: eventId, p_user_id: userId, p_value: true }) as never

  test('anon cannot call set_no_show', async () => {
    const res = await q(() => anon.rpc('set_no_show' as never, args(crypto.randomUUID(), BUDDY_ID)), 'anon set_no_show')
    expect(res.error?.code).toBe(RLS_DENIED)
  })

  test('a user cannot flag on an event they do not host (or that does not exist)', async () => {
    const missing = await q(() => me.rpc('set_no_show' as never, args(crypto.randomUUID(), BUDDY_ID)), 'set_no_show unknown event')
    expect(missing.error, 'unknown event').not.toBeNull()
    const other = await q(() => me.from('events').select('id').neq('created_by', myId).limit(1), 'an event someone else hosts')
    test.skip(!other.data?.length, 'beta has no event hosted by someone else')
    const res = await q(() => me.rpc('set_no_show' as never, args(other.data![0].id, BUDDY_ID)), 'set_no_show not host')
    expect(res.error?.code).toBe(RLS_DENIED)
  })

  test('the columns cannot be set directly, even on your own RSVP', async () => {
    // Rejected by the guard trigger before any foreign key or RLS check could save it.
    const ins = await q(() => me.from('event_attendees').insert({ event_id: crypto.randomUUID(), user_id: myId, no_show: true } as never), 'insert with no_show')
    expect(ins.error?.code).toBe(RLS_DENIED)
    const marked = await q(() => me.from('event_attendees').insert({ event_id: crypto.randomUUID(), user_id: myId, no_show_marked_by: BUDDY_ID } as never), 'insert with no_show_marked_by')
    expect(marked.error?.code).toBe(RLS_DENIED)
  })
})

/**
 * New game alerts (#170): the ledger is service-only, the job can't be called
 * by clients, and the per-club switch only changes the caller's own membership.
 */
test.describe('new game alerts (#170)', () => {
  test('game_alert_log is closed to guests and signed-in users', async () => {
    for (const [client, who] of [[anon, 'anon'], [me, 'signed in']] as const) {
      const read = await q(() => client.from('game_alert_log').select('user_id').limit(1), `${who} read game_alert_log`)
      expect(read.data ?? [], who).toEqual([])
      const ins = await q(() => client.from('game_alert_log').insert({ user_id: myId, event_id: crypto.randomUUID() }), `${who} insert game_alert_log`)
      expect(ins.error?.code, who).toBe(RLS_DENIED)
    }
  })

  test('nobody but the cron job can run send_new_game_alerts', async () => {
    for (const [client, who] of [[anon, 'anon'], [me, 'signed in']] as const) {
      const res = await q(() => client.rpc('send_new_game_alerts'), `${who} send_new_game_alerts`)
      expect(res.error?.code, who).toBe(RLS_DENIED)
    }
  })

  test('set_club_game_alerts: guests cannot call it, members of nothing get 42501', async () => {
    const guest = await q(() => anon.rpc('set_club_game_alerts', { p_club_id: crypto.randomUUID(), p_on: false }), 'anon set_club_game_alerts')
    expect(guest.error?.code).toBe(RLS_DENIED)
    const stranger = await q(() => me.rpc('set_club_game_alerts', { p_club_id: crypto.randomUUID(), p_on: false }), 'set_club_game_alerts not a member')
    expect(stranger.error?.code).toBe(RLS_DENIED)
  })

  test('a user cannot write a new_game notification', async () => {
    const ins = await q(
      () => me.from('notifications').insert({ user_id: BUDDY_ID, notification_type: 'new_game', title: 'x', body: 'x', data: {} }),
      'insert new_game notification',
    )
    expect(ins.error).not.toBeNull()
  })

  test("another player's game alert settings are not readable", async () => {
    const res = await q(() => me.from('user_settings').select('game_alerts').eq('user_id', BUDDY_ID), "buddy's game_alerts")
    expect(res.data ?? []).toEqual([])
  })
})

/**
 * Club polls (#175): members read polls, options and votes; nobody writes the
 * tables directly; the RPCs check ownership and membership themselves.
 */
test.describe('club polls (#175)', () => {
  test('guests read nothing and can call nothing', async () => {
    for (const table of ['club_polls', 'club_poll_options', 'club_poll_votes'] as const) {
      const res = await q(() => anon.from(table).select('post_id').limit(1), `anon ${table}`)
      expect(res.data ?? [], table).toEqual([])
    }
    const create = await q(() => anon.rpc('create_club_poll', { p_club_id: crypto.randomUUID(), p_question: 'Q?', p_kind: 'text', p_options: [{ label: 'a' }, { label: 'b' }] }), 'anon create_club_poll')
    expect(create.error?.code).toBe(RLS_DENIED)
    const vote = await q(() => anon.rpc('vote_club_poll', { p_post_id: crypto.randomUUID(), p_option_ids: [] }), 'anon vote_club_poll')
    expect(vote.error?.code).toBe(RLS_DENIED)
    const link = await q(() => anon.rpc('link_poll_event', { p_post_id: crypto.randomUUID(), p_event_id: crypto.randomUUID() }), 'anon link_poll_event')
    expect(link.error?.code).toBe(RLS_DENIED)
  })

  test('a signed-in user cannot write the tables or post a poll in a club they do not own', async () => {
    const ins = await q(() => me.from('club_polls').insert({ post_id: crypto.randomUUID(), kind: 'text' }), 'insert club_polls')
    expect(ins.error?.code).toBe(RLS_DENIED)
    const vote = await q(() => me.from('club_poll_votes').insert({ option_id: crypto.randomUUID(), post_id: crypto.randomUUID(), user_id: myId }), 'insert club_poll_votes')
    expect(vote.error?.code).toBe(RLS_DENIED)
    const create = await q(() => me.rpc('create_club_poll', { p_club_id: crypto.randomUUID(), p_question: 'Q?', p_kind: 'text', p_options: [{ label: 'a' }, { label: 'b' }] }), 'create_club_poll not owner')
    expect(create.error?.code).toBe(RLS_DENIED)
  })
})

/**
 * #111: signed-in RPCs are no longer executable by anon. Skips while the
 * migration is not on beta (anon can still call them then).
 * TODO(#111): drop the skip once 20261028160000_definer_search_path is applied.
 */
test.describe('definer hardening (#111)', () => {
  test('anon cannot call the chat and notification RPCs', async () => {
    const probe = await q(() => anon.rpc('get_my_conversations'), 'anon get_my_conversations')
    test.skip(!probe.error, 'TODO(#111): migration not on beta yet')
    expect(probe.error?.code).toBe(RLS_DENIED)
    for (const fn of ['get_chat_unread_count', 'mark_all_notifications_read'] as const) {
      const res = await q(() => anon.rpc(fn), `anon ${fn}`)
      expect(res.error?.code, `anon ${fn}`).toBe(RLS_DENIED)
    }
    const dm = await q(() => anon.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }), 'anon find_or_create_dm')
    expect(dm.error?.code).toBe(RLS_DENIED)
  })
})

test.describe('admin usage metrics (#232 part 2)', () => {
  // The e2e account is not in app_admins: every admin_* function must refuse it (42501), and
  // guests can't execute them at all. The functions are the only way to read app_sessions,
  // app_online_samples and app_online_daily, so this is what keeps usage data admin-only.
  const calls: [string, Record<string, unknown>][] = [
    ['admin_metrics_overview', { p_from: '2026-11-01', p_to: '2026-11-07' }],
    ['admin_metrics_events', { p_from: '2026-11-01', p_to: '2026-11-07' }],
    ['admin_online_now', {}],
    ['admin_retention', { p_weeks: 4 }],
    ['admin_users', { p_search: '', p_sort: 'last_seen', p_limit: 5, p_offset: 0 }],
    ['admin_user_activity', { p_user: BUDDY_ID }],
  ]

  test('a signed-in non-admin gets nothing from the admin functions', async () => {
    const admin = await q(() => me.rpc('current_user_is_admin'), 'current_user_is_admin')
    expect(admin.error).toBeNull()
    expect(admin.data, 'the e2e account must not be an admin').toBe(false)
    for (const [fn, args] of calls) {
      const res = await q(() => me.rpc(fn as never, args as never), `me ${fn}`)
      expect(res.error?.code, `${fn} for a non-admin`).toBe(RLS_DENIED)
      expect(res.data, `${fn} returned data to a non-admin`).toBeNull()
    }
  })

  test('guests cannot execute them', async () => {
    for (const [fn, args] of calls) {
      const res = await q(() => anon.rpc(fn as never, args as never), `anon ${fn}`)
      expect(res.error, `anon ${fn}`).not.toBeNull()
      expect(res.data, `${fn} returned data to a guest`).toBeNull()
    }
  })
})

test.describe('what to bring (#256)', () => {
  // Writes go only through SECURITY DEFINER functions; guests read coverage through
  // get_event_bring_list (counts, no names) and never the claims table.
  const NO_EVENT = '00000000-0000-4000-8000-000000000000'

  test('guests read the list function but not who is bringing what', async () => {
    const listRes = await q(() => anon.rpc('get_event_bring_list' as never, { p_event_id: NO_EVENT } as never), 'anon get_event_bring_list')
    expect(listRes.error).toBeNull()
    expect(listRes.data).toEqual([])
    const items = await q(() => anon.from('event_bring_items' as never).select('id', { count: 'exact', head: true }), 'anon event_bring_items')
    expect(items.error).toBeNull()
    const claims = await q(() => anon.from('event_bring_claims' as never).select('item_id').limit(1), 'anon event_bring_claims')
    expect(claims.error?.code ?? null, 'anon must not read claims').toBe(RLS_DENIED)
  })

  test('guests cannot claim, release or save a list', async () => {
    for (const [fn, args] of [
      ['claim_bring_item', { p_item_id: NO_EVENT, p_quantity: 1 }],
      ['release_bring_item', { p_item_id: NO_EVENT }],
      ['save_event_bring_items', { p_event_id: NO_EVENT, p_items: [] }],
    ] as const) {
      const res = await q(() => anon.rpc(fn as never, args as never), `anon ${fn}`)
      expect(res.error, `anon ${fn}`).not.toBeNull()
    }
  })

  test('a signed-in player cannot write the tables directly or edit someone else\'s list', async () => {
    const ins = await q(() => me.from('event_bring_items' as never).insert({ event_id: NO_EVENT, label: 'x' } as never), 'me insert item')
    expect(ins.error).not.toBeNull()
    const claim = await q(() => me.from('event_bring_claims' as never).insert({ item_id: NO_EVENT, event_id: NO_EVENT, user_id: BUDDY_ID } as never), 'me insert claim as buddy')
    expect(claim.error).not.toBeNull()
    const save = await q(() => me.rpc('save_event_bring_items' as never, { p_event_id: NO_EVENT, p_items: [] } as never), 'me save missing event')
    expect(save.error?.message).toMatch(/Event not found/)
    const alert = await q(() => me.from('event_bring_alert_log' as never).select('event_id').limit(1), 'me alert log')
    expect(alert.error ?? (alert.data as unknown[] | null)?.length === 0, 'alert log is service-only').toBeTruthy()
  })
})

/**
 * Search (#176): search_feed runs as the caller (SECURITY INVOKER), so a guest
 * gets only what the guest feed already shows, and never past games.
 */
test.describe('search (#176)', () => {
  test('guests can search; every game id is one they can already read', async () => {
    const res = await q(() => anon.rpc('search_feed', { q: 'e2e' }), 'anon search_feed')
    expect(res.error).toBeNull()
    const found = res.data as { events: string[]; hosts: Record<string, unknown>[] }
    if (found.events.length) {
      const direct = await q(() => anon.from('events').select('id').in('id', found.events), 'anon events by id')
      expect((direct.data ?? []).length).toBe(found.events.length)
    }
    // Hosts carry public profile columns only.
    for (const h of found.hosts) expect(Object.keys(h).sort()).toEqual(['avatar_url', 'first_name', 'id', 'last_name', 'upcoming', 'username'])
  })

  test('past games are for signed-in players only, and only their own', async () => {
    const guest = await q(() => anon.rpc('search_feed', { q: 'e2e', scope: 'mine_past' }), 'anon mine_past')
    expect((guest.data as { events: string[] }).events).toEqual([])
    const mine = await q(() => me.rpc('search_feed', { q: 'e2e', scope: 'mine_past' }), 'my past games')
    expect(mine.error).toBeNull()
    const ids = (mine.data as { events: string[] }).events
    if (ids.length) {
      const attended = await q(() => me.from('event_attendees').select('event_id').eq('user_id', myId).in('event_id', ids), 'attended')
      expect(new Set((attended.data ?? []).map(r => r.event_id)).size).toBe(ids.length)
    }
  })

  test('too short or too long a search is refused', async () => {
    for (const text of ['a', 'x'.repeat(200)]) {
      const res = await q(() => anon.rpc('search_feed', { q: text }), `search ${text.length} chars`)
      expect(res.error?.code).toBe('22023')
    }
  })
})
